import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkFreeModelRateLimit, isFreeModel } from "./rate-limit.js";

// Mock dependencies
vi.mock("@llmgateway/cache", () => ({
	redisClient: {
		eval: vi.fn(),
	},
}));

vi.mock("@llmgateway/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
	},
}));

const mockCache = await import("@llmgateway/cache");
const redis = mockCache.redisClient;

describe("Rate Limiting", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("isFreeModel", () => {
		it("should return true for free models", () => {
			expect(isFreeModel({ free: true })).toBe(true);
		});

		it("should return false for non-free models", () => {
			expect(isFreeModel({ free: false })).toBe(false);
		});

		it("should return false for models without free property", () => {
			expect(isFreeModel({})).toBe(false);
		});
	});

	describe("checkFreeModelRateLimit", () => {
		const organizationId = "test-org-id";
		const model = "test-model";

		it("should allow non-free models without touching Redis", async () => {
			const result = await checkFreeModelRateLimit(organizationId, model, {
				free: false,
			});

			expect(result.allowed).toBe(true);
			expect(result.retryAfter).toBeUndefined();
			expect(redis.eval).not.toHaveBeenCalled();
		});

		it("consumes both the minute and daily windows atomically", async () => {
			vi.mocked(redis.eval).mockResolvedValue([1, 0, 9, 0]);

			const result = await checkFreeModelRateLimit(organizationId, model, {
				free: true,
			});

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(9);
			expect(result.limit).toBe(10);

			expect(redis.eval).toHaveBeenCalledTimes(1);
			const [script, numKeys, minuteKey, dailyKey, , member, ...rest] =
				vi.mocked(redis.eval).mock.calls[0];
			expect(script).toContain("ZADD");
			expect(numKeys).toBe(2);
			// Org-aggregate keys: the model id is not part of either key, so the
			// 100/day cap is shared across all free models and pool providers.
			expect(minuteKey).toBe(`rate_limit:free_model_rpm:${organizationId}`);
			expect(dailyKey).toBe(`rate_limit:free_model_daily:${organizationId}`);
			expect(member).toContain(":");
			expect(rest).toEqual([10, 60, 100, 86400]);
		});

		it("blocks at the 10-per-minute cap with retry info", async () => {
			vi.mocked(redis.eval).mockResolvedValue([0, 42, 0, 0]);

			const result = await checkFreeModelRateLimit(organizationId, model, {
				free: true,
			});

			expect(result.allowed).toBe(false);
			expect(result.retryAfter).toBe(42);
			expect(result.remaining).toBe(0);
			expect(result.limit).toBe(10);
			expect(result.daily).toBeUndefined();
		});

		it("blocks at the 100-per-day aggregate cap regardless of minute room", async () => {
			vi.mocked(redis.eval).mockResolvedValue([0, 3600, 0, 1]);

			const result = await checkFreeModelRateLimit(
				organizationId,
				"a-different-free-model",
				{ free: true },
			);

			expect(result.allowed).toBe(false);
			expect(result.retryAfter).toBe(3600);
			expect(result.remaining).toBe(0);
			expect(result.limit).toBe(100);
			expect(result.daily).toBe(true);
		});

		it("fails open on Redis errors", async () => {
			vi.mocked(redis.eval).mockRejectedValue(new Error("redis down"));

			const result = await checkFreeModelRateLimit(organizationId, model, {
				free: true,
			});

			expect(result.allowed).toBe(true);
		});
	});
});
