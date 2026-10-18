import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	freeCfBudgetKey,
	freeTierProviderLabel,
	isFreeCfBudgetExhausted,
	maskFreeTierProviders,
	recordFreeCfSpend,
} from "./free-tier.js";

vi.mock("@llmgateway/cache", () => ({
	redisClient: {
		get: vi.fn(),
		incrbyfloat: vi.fn(),
		expireat: vi.fn(),
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

describe("free-tier Cloudflare budget", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("reports not exhausted below the daily cap", async () => {
		vi.mocked(redis.get).mockResolvedValue("4.99");
		await expect(isFreeCfBudgetExhausted()).resolves.toBe(false);
	});

	it("reports exhausted at and above the daily cap", async () => {
		vi.mocked(redis.get).mockResolvedValue("5");
		await expect(isFreeCfBudgetExhausted()).resolves.toBe(true);
		vi.mocked(redis.get).mockResolvedValue("9.50");
		await expect(isFreeCfBudgetExhausted()).resolves.toBe(true);
	});

	it("reports not exhausted with no spend recorded", async () => {
		vi.mocked(redis.get).mockResolvedValue(null);
		await expect(isFreeCfBudgetExhausted()).resolves.toBe(false);
	});

	it("fails closed when Redis errors so the budget can never overrun", async () => {
		vi.mocked(redis.get).mockRejectedValue(new Error("redis down"));
		await expect(isFreeCfBudgetExhausted()).resolves.toBe(true);
	});

	it("increments today's spend and sets an end-of-day expiry", async () => {
		vi.mocked(redis.incrbyfloat).mockResolvedValue("1.25" as never);
		await recordFreeCfSpend(0.42);
		expect(redis.incrbyfloat).toHaveBeenCalledWith(freeCfBudgetKey(), 0.42);
		expect(redis.expireat).toHaveBeenCalledWith(
			freeCfBudgetKey(),
			expect.any(Number),
		);
	});

	it("ignores non-positive spend", async () => {
		await recordFreeCfSpend(0);
		await recordFreeCfSpend(Number.NaN);
		await recordFreeCfSpend(-1);
		expect(redis.incrbyfloat).not.toHaveBeenCalled();
	});
});

describe("free-tier provider masking", () => {
	it("collapses pool ids and stealth fallback upstreams to the public label", () => {
		for (const id of [
			"nvidia-free",
			"openrouter-free",
			"opencode-free",
			"kilo-free",
			"groq-free",
			"google-free",
			"cloudflare",
			"nvidia",
		]) {
			expect(freeTierProviderLabel(id)).toBe("vichar");
		}
	});

	it("leaves non-free providers untouched", () => {
		expect(freeTierProviderLabel("openai")).toBe("openai");
		expect(freeTierProviderLabel("anthropic")).toBe("anthropic");
		expect(freeTierProviderLabel(null)).toBeNull();
		expect(freeTierProviderLabel(undefined)).toBeUndefined();
	});

	it("deep-masks routing metadata and provider lists", () => {
		const masked = maskFreeTierProviders({
			used_provider: "nvidia-free",
			requested_provider: "openrouter-free",
			routing: [
				{ provider: "nvidia-free", model: "m", succeeded: false },
				{ provider: "cloudflare", model: "m", succeeded: true },
			],
			providerScores: [
				{ providerId: "kilo-free", score: 1 },
				{ providerId: "openai", score: 0.5 },
			],
			untouched: { message: "nvidia-free is great" },
		}) as Record<string, any>;

		expect(masked.used_provider).toBe("vichar");
		expect(masked.requested_provider).toBe("vichar");
		expect(masked.routing[0].provider).toBe("vichar");
		expect(masked.routing[1].provider).toBe("vichar");
		expect(masked.providerScores[0].providerId).toBe("vichar");
		expect(masked.providerScores[1].providerId).toBe("openai");
		// Only exact id matches are masked — prose mentioning the id keeps it,
		// which is why error text is redacted before it reaches here.
		expect(masked.untouched.message).toBe("nvidia-free is great");
	});
});
