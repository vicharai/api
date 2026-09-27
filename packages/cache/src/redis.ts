import { Redis } from "ioredis";

import { logger } from "@llmgateway/logger";

export const redisClient = new Redis({
	host: process.env.REDIS_HOST ?? "localhost",
	port: Number(process.env.REDIS_PORT) || 6379,
	password: process.env.REDIS_PASSWORD,
	// Batch commands issued in the same event-loop tick into one round trip.
	// The gateway hot path issues dozens of independent commands per request
	// (rate-limit peeks, discount lookups, cached queries) on this single
	// connection; without pipelining they serialize RTT-by-RTT. No consumer
	// of this client uses blocking commands or subscriptions.
	enableAutoPipelining: true,
});

redisClient.on("error", (err) => logger.error("Redis Client Error", err));

export const LOG_QUEUE = "log_queue_" + process.env.NODE_ENV;

export async function publishToQueue(
	queue: string,
	message: unknown,
): Promise<void> {
	try {
		await redisClient.lpush(queue, JSON.stringify(message));
	} catch (error) {
		const msg = message as Record<string, unknown> | undefined;
		const item = msg
			? {
					requestId: msg.requestId,
					organizationId: msg.organizationId,
					projectId: msg.projectId,
					usedModel: msg.usedModel,
					usedProvider: msg.usedProvider,
				}
			: undefined;
		logger.error("Error publishing to queue", error, { queue, item });
		throw error;
	}
}

export async function consumeFromQueue(
	queue: string,
	count = 100,
): Promise<string[] | null> {
	try {
		const result = await redisClient.lpop(queue, count);

		if (!result) {
			return null;
		}

		return result;
	} catch (error) {
		logger.error("Error consuming from queue", error);
		throw error;
	}
}

// ---------------------------------------------------------------------------
// Reliable consume: claim-then-ack
//
// LPOP removes a message before it is persisted — a consumer crash between the
// pop and the database write loses the event permanently, and AOF can only
// replay state that reached Redis. To make billing events crash-safe the
// worker moves each message atomically into an in-flight list (LMOVE) and
// records the claim timestamp in a sorted set, performs the idempotent
// Postgres write, then removes both. Entries stranded by a crash are redriven
// back onto the source queue after a staleness window long enough to cover
// the consumer's own retry backoff; because the durable write is idempotent
// on the payload's id, a redrive racing a still-alive consumer is a harmless
// duplicate, not a lost or double-applied event.
// ---------------------------------------------------------------------------

function inflightKey(queue: string): string {
	return `${queue}:inflight`;
}

function inflightClaimsKey(queue: string): string {
	return `${queue}:inflight_claims`;
}

/**
 * Atomically moves up to `count` messages from `queue` into its in-flight
 * list, recording a claim timestamp per message. Each LMOVE is atomic; a
 * crash mid-batch can only strand messages in the in-flight list, which the
 * redrive pass recovers (an in-flight entry with no claim timestamp is
 * treated as maximally stale there).
 */
export async function claimFromQueue(
	queue: string,
	count: number,
): Promise<string[] | null> {
	const claimed: string[] = [];
	try {
		for (let i = 0; i < count; i++) {
			const payload = await redisClient.lmove(
				queue,
				inflightKey(queue),
				"LEFT",
				"RIGHT",
			);
			if (payload === null) {
				break;
			}
			try {
				await redisClient.zadd(inflightClaimsKey(queue), Date.now(), payload);
			} catch {
				// The claim timestamp is only a redrive heuristic — without it the
				// entry simply counts as stale immediately.
			}
			claimed.push(payload);
		}
	} catch (error) {
		logger.error("Error claiming from queue", error);
		throw error;
	}
	return claimed.length > 0 ? claimed : null;
}

/**
 * Removes in-flight entries after their payloads were durably written.
 * Idempotent: LREM/ZREM on a missing member is a no-op.
 */
export async function ackClaimedMessages(
	queue: string,
	payloads: string[],
): Promise<void> {
	if (payloads.length === 0) {
		return;
	}
	try {
		const pipeline = redisClient.pipeline();
		for (const payload of payloads) {
			pipeline.lrem(inflightKey(queue), 0, payload);
			pipeline.zrem(inflightClaimsKey(queue), payload);
		}
		await pipeline.exec();
	} catch (error) {
		logger.error("Error acknowledging claimed messages", error);
		throw error;
	}
}

/**
 * Moves stale in-flight payloads back onto the source queue. An entry counts
 * as stale when it was claimed more than `staleMs` ago or its claim timestamp
 * never landed (LMOVE succeeded, ZADD crashed). Requeued payloads are re-run
 * through the idempotent insert, so a redrive racing a live-but-slow consumer
 * produces at most a skipped duplicate write.
 */
export async function redriveStaleInflight(
	queue: string,
	staleMs: number,
): Promise<number> {
	const inflight = inflightKey(queue);
	const claims = inflightClaimsKey(queue);
	let entries: string[];
	try {
		entries = await redisClient.lrange(inflight, 0, -1);
	} catch (error) {
		logger.error("Error listing in-flight queue entries", error);
		throw error;
	}
	let redriven = 0;
	const cutoff = Date.now() - staleMs;
	for (const entry of entries) {
		try {
			const claimedAt = await redisClient.zscore(claims, entry);
			if (claimedAt !== null && Number(claimedAt) > cutoff) {
				continue;
			}
			await redisClient.lpush(queue, entry);
			await redisClient
				.pipeline()
				.lrem(inflight, 1, entry)
				.zrem(claims, entry)
				.exec();
			redriven++;
		} catch (error) {
			logger.error("Error redriving in-flight message", error);
		}
	}
	return redriven;
}

export async function closeRedisClient(): Promise<void> {
	try {
		await redisClient.disconnect();
		logger.info("Redis client disconnected");
	} catch (error) {
		logger.error("Error disconnecting Redis client", error);
		throw error;
	}
}
