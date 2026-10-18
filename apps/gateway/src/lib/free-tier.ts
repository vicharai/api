import { redisClient } from "@llmgateway/cache";
import { logger } from "@llmgateway/logger";
import { maskFreePoolProviderId } from "@llmgateway/models";

/**
 * Free-tier constants and the Redis-backed daily budget that caps how much
 * the paid-priced Cloudflare fallback legs may spend on free requests.
 */

export const FREE_TIER_TOP_UP_MESSAGE =
	"Top up $20 for unlimited access to full-speed models.";

export const FREE_TIER_MAX_INPUT_TOKENS = 32_000;
export const FREE_TIER_MAX_OUTPUT_TOKENS = 4_096;

const FREE_CF_DAILY_BUDGET_DEFAULT_USD = 5;

function utcToday(): string {
	return new Date().toISOString().slice(0, 10);
}

export function freeCfBudgetKey(date: string = utcToday()): string {
	return `budget:free_cf:${date}`;
}

function freeCfBudgetLimitUsd(): number {
	const raw = Number(process.env.FREE_CF_DAILY_BUDGET_USD ?? "");
	return Number.isFinite(raw) && raw > 0
		? raw
		: FREE_CF_DAILY_BUDGET_DEFAULT_USD;
}

/**
 * Whether today's Cloudflare free-tier budget is spent. Fails closed: on a
 * Redis error the paid-priced Cloudflare legs are skipped and the remaining
 * free pools still serve, so a flake never overruns the cap.
 */
export async function isFreeCfBudgetExhausted(
	date: string = utcToday(),
): Promise<boolean> {
	try {
		const raw = await redisClient.get(freeCfBudgetKey(date));
		return (raw ? Number(raw) : 0) >= freeCfBudgetLimitUsd();
	} catch (error) {
		logger.error("Free Cloudflare budget check failed", {
			error: error instanceof Error ? error : new Error(String(error)),
		});
		return true;
	}
}

/**
 * Atomically add `usd` to today's Cloudflare free-tier spend and set the key
 * to expire at end-of-day plus one hour. Called once per request from the
 * log choke point with the cost the paid-priced Cloudflare mapping produced.
 */
export async function recordFreeCfSpend(usd: number): Promise<void> {
	if (!Number.isFinite(usd) || usd <= 0) {
		return;
	}
	const key = freeCfBudgetKey();
	try {
		await redisClient.incrbyfloat(key, usd);
		const now = new Date();
		const endOfDayUtc = Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate() + 1,
		);
		await redisClient.expireat(key, Math.floor(endOfDayUtc / 1000) + 3600);
	} catch (error) {
		logger.error("Free Cloudflare budget increment failed", {
			error: error instanceof Error ? error : new Error(String(error)),
		});
	}
}

/**
 * The provider id a client may see for a free-model request. Free-pool ids
 * and the stealth upstreams they can fall back to collapse to the public
 * label; everything else passes through.
 */
export function freeTierProviderLabel(
	provider: string | null | undefined,
): string | null | undefined {
	return maskFreePoolProviderId(provider);
}

/**
 * Deep-replace masked provider ids inside a value (routing metadata, response
 * metadata, log JSON) with the public label. Applied only for free models, so
 * paid-model surfaces keep reporting the real providers.
 */
export function maskFreeTierProviders(value: unknown): unknown {
	if (typeof value === "string") {
		return maskFreePoolProviderId(value) ?? value;
	}
	if (Array.isArray(value)) {
		return value.map(maskFreeTierProviders);
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, v]) => [
				key,
				maskFreeTierProviders(v),
			]),
		);
	}
	return value;
}
