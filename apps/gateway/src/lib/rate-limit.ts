import { randomUUID } from "node:crypto";

import { redisClient } from "@llmgateway/cache";
import { logger } from "@llmgateway/logger";

import type { ModelDefinition } from "@llmgateway/models";

/**
 * Flat free-tier limits, applied per organization and aggregated across all
 * free models and free-pool providers: 10 requests per minute plus a hard
 * 100 requests per day. The same caps apply to every organization regardless
 * of credit balance — they exist to push heavy users to the paid tier.
 */
const FREE_MODEL_RPM_LIMIT = 10;
const FREE_MODEL_RPM_WINDOW_SECONDS = 60;
const FREE_MODEL_DAILY_LIMIT = 100;
const FREE_MODEL_DAILY_WINDOW_SECONDS = 86_400;

/**
 * Check if a model is free based on model definition
 */
export function isFreeModel(
	modelDefinition: Partial<ModelDefinition> | null | undefined,
): boolean {
	return modelDefinition?.free === true;
}

function getMinuteKey(organizationId: string): string {
	return `rate_limit:free_model_rpm:${organizationId}`;
}

function getDailyKey(organizationId: string): string {
	return `rate_limit:free_model_daily:${organizationId}`;
}

/**
 * Atomically trim both sliding windows, check them, and consume one slot in
 * each. The request only burns quota when it fits inside BOTH windows —
 * rejected attempts consume nothing. Doing it in one Lua script avoids the
 * peek-then-consume race where concurrent requests could overshoot the cap.
 * Returns [allowed, retryAfterSeconds, remainingMinuteSlots, dailyExceeded].
 */
const CONSUME_SCRIPT = `
local minute_key = KEYS[1]
local daily_key = KEYS[2]
local now = tonumber(ARGV[1])
local member = ARGV[2]
local minute_limit = tonumber(ARGV[3])
local minute_window = tonumber(ARGV[4])
local daily_limit = tonumber(ARGV[5])
local daily_window = tonumber(ARGV[6])

redis.call("ZREMRANGEBYSCORE", minute_key, "-inf", now - minute_window * 1000)
redis.call("ZREMRANGEBYSCORE", daily_key, "-inf", now - daily_window * 1000)

local minute_count = redis.call("ZCARD", minute_key)
local daily_count = redis.call("ZCARD", daily_key)

local function retry_after(key, window)
	local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
	if #oldest > 1 then
		return math.ceil((tonumber(oldest[2]) + window * 1000 - now) / 1000)
	end
	return window
end

if daily_count >= daily_limit then
	return {0, retry_after(daily_key, daily_window), 0, 1}
end
if minute_count >= minute_limit then
	return {0, retry_after(minute_key, minute_window), 0, 0}
end

-- Unique members: score-only members collide under same-ms concurrency.
redis.call("ZADD", minute_key, now, member)
redis.call("EXPIRE", minute_key, minute_window * 2)
redis.call("ZADD", daily_key, now, member .. ":daily")
redis.call("EXPIRE", daily_key, daily_window * 2)

return {1, 0, math.max(0, minute_limit - minute_count - 1), 0}
`;

/**
 * Check rate limit for free models. `model` is retained in the signature for
 * call-site compatibility — the caps are deliberately org-aggregate, so the
 * key ignores it.
 */
export async function checkFreeModelRateLimit(
	organizationId: string,
	model: string,
	modelDefinition: Partial<ModelDefinition> | null | undefined,
): Promise<{
	allowed: boolean;
	retryAfter?: number;
	remaining: number;
	limit: number;
	daily?: boolean;
}> {
	// Only apply rate limiting to free models
	if (!isFreeModel(modelDefinition)) {
		return { allowed: true, remaining: 0, limit: 0 };
	}

	try {
		const [allowed, retryAfter, remaining, dailyExceeded] =
			(await redisClient.eval(
				CONSUME_SCRIPT,
				2,
				getMinuteKey(organizationId),
				getDailyKey(organizationId),
				Date.now(),
				`${Date.now()}:${randomUUID()}`,
				FREE_MODEL_RPM_LIMIT,
				FREE_MODEL_RPM_WINDOW_SECONDS,
				FREE_MODEL_DAILY_LIMIT,
				FREE_MODEL_DAILY_WINDOW_SECONDS,
			)) as [number, number, number, number];

		if (allowed !== 1) {
			const daily = dailyExceeded === 1;
			logger.info(
				daily
					? "Free model daily limit exceeded"
					: "Free model rate limit exceeded",
				{
					organizationId,
					model,
					limit: daily ? FREE_MODEL_DAILY_LIMIT : FREE_MODEL_RPM_LIMIT,
					retryAfter,
				},
			);
			return {
				allowed: false,
				retryAfter,
				remaining: 0,
				limit: daily ? FREE_MODEL_DAILY_LIMIT : FREE_MODEL_RPM_LIMIT,
				daily: daily || undefined,
			};
		}

		return {
			allowed: true,
			remaining: Math.max(0, remaining),
			limit: FREE_MODEL_RPM_LIMIT,
		};
	} catch (error) {
		logger.error("Error checking free model rate limit:", error as Error);
		// Allow request on error to avoid blocking users due to Redis issues
		return { allowed: true, remaining: 0, limit: 0 };
	}
}
