import { afterEach, describe, expect, it, vi } from "vitest";

import {
	crossValidatePlatformConfig,
	describePlatformConfig,
	parseStoredPlatformConfig,
	PLATFORM_CONFIG_REGISTRY,
	platformConfigValue,
	resolvePlatformConfig,
	validatePlatformConfigPatch,
} from "./platform-config.js";
import { getOrgSpendTier, isSpendCapEnabled } from "./spend-tier.js";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("resolvePlatformConfig", () => {
	it("resolves DB over env over default", () => {
		const env = { GATEWAY_MAX_INFLIGHT_REQUESTS: "250" };

		const fromDefault = resolvePlatformConfig({}, {});
		expect(fromDefault.values["gateway.maxInflightPerPod"]).toBe(1000);
		expect(fromDefault.sources["gateway.maxInflightPerPod"]).toBe("default");

		const fromEnv = resolvePlatformConfig({}, env);
		expect(fromEnv.values["gateway.maxInflightPerPod"]).toBe(250);
		expect(fromEnv.sources["gateway.maxInflightPerPod"]).toBe("env");

		const fromDb = resolvePlatformConfig(
			{ "gateway.maxInflightPerPod": 40 },
			env,
		);
		expect(fromDb.values["gateway.maxInflightPerPod"]).toBe(40);
		expect(fromDb.sources["gateway.maxInflightPerPod"]).toBe("db");
	});

	it("ignores invalid env values", () => {
		const { values, sources } = resolvePlatformConfig(
			{},
			{
				GATEWAY_MAX_INFLIGHT_REQUESTS: "0",
				EXPLORATION_RATE: "1.5",
				SAME_KEY_MAX_RETRIES: "-1",
			},
		);
		expect(values["gateway.maxInflightPerPod"]).toBe(1000);
		expect(values["gateway.explorationRate"]).toBeNull();
		expect(values["gateway.sameKeyMaxRetries"]).toBe(2);
		expect(sources["gateway.sameKeyMaxRetries"]).toBe("default");
	});

	it("keeps the legacy env semantics", () => {
		const { values } = resolvePlatformConfig(
			{},
			{
				BILL_CANCELLED_REQUESTS: "no",
				GATEWAY_MODEL_ALLOWLIST: " vichar-*, gpt-4o ,",
				LLM_CONTENT_FILTER_MODE: "openai",
				GATEWAY_RATE_LIMIT_CHAT_COMPLETIONS_RPM: "30",
				GATEWAY_SPEND_TIER_2_DAILY_CAP_USD: "7",
			},
		);
		expect(values["gateway.billCancelledRequests"]).toBe(true);
		expect(values["gateway.modelAllowlist"]).toEqual(["vichar-*", "gpt-4o"]);
		expect(values["contentFilter.mode"]).toBe("enabled");
		expect(values["contentFilter.method"]).toBe("openai");
		expect(values["gateway.rpm.chat_completions"]).toBe(30);
		expect(values["gateway.tier2.dailyCapUsd"]).toBe(7);
	});

	it("evaluates environment-dependent defaults per call", () => {
		vi.stubEnv("GATEWAY_SPEND_CAPS_ENABLED", undefined as unknown as string);
		vi.stubEnv("NODE_ENV", "test");
		expect(isSpendCapEnabled()).toBe(false);
		vi.stubEnv("NODE_ENV", "production");
		expect(isSpendCapEnabled()).toBe(true);
		const config = resolvePlatformConfig({
			"gateway.spendCapsEnabled": false,
		}).values;
		expect(isSpendCapEnabled(config)).toBe(false);
	});

	it("falls back to env/default per key without a loaded config", () => {
		vi.stubEnv("SAME_KEY_MAX_RETRIES", "4");
		expect(platformConfigValue("gateway.sameKeyMaxRetries")).toBe(4);
		const config = resolvePlatformConfig({
			"gateway.sameKeyMaxRetries": 1,
		}).values;
		expect(platformConfigValue("gateway.sameKeyMaxRetries", config)).toBe(1);
	});

	it("feeds the trust-tier ladder", () => {
		const hundredDaysMs = 100 * 86_400_000;
		const org = { createdAt: new Date(Date.now() - hundredDaysMs) };
		const config = resolvePlatformConfig({
			"gateway.tier4.ageDays": 1000,
			"gateway.tier3.dailyCapUsd": 123,
		}).values;
		const tier = getOrgSpendTier(org, 0, Date.now(), config);
		expect(tier.tier).toBe(3);
		expect(tier.dailyCapUsd).toBe(123);
		expect(getOrgSpendTier(org, 0).tier).toBe(4);
	});
});

describe("validatePlatformConfigPatch", () => {
	it("accepts valid values", () => {
		const result = validatePlatformConfigPatch({
			"billing.platformFeePercent": 7.5,
			"gateway.modelAllowlist": ["a", "b*"],
			"gateway.explorationRate": null,
			"contentFilter.mode": "monitor",
			"billing.topUpPresets": [10, 25],
		});
		expect(result.ok).toBe(true);
	});

	it("reports every invalid key", () => {
		const result = validatePlatformConfigPatch({
			"no.such.key": 1,
			"billing.platformFeePercent": 150,
			"gateway.sameKeyMaxRetries": 1.5,
			"gateway.rateLimitsEnabled": "yes",
			"contentFilter.mode": "strict",
			"gateway.maxInflightPerPod": null,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.map((error) => error.key).sort()).toEqual([
				"billing.platformFeePercent",
				"contentFilter.mode",
				"gateway.maxInflightPerPod",
				"gateway.rateLimitsEnabled",
				"gateway.sameKeyMaxRetries",
				"no.such.key",
			]);
		}
	});

	it("checks rules spanning several keys", () => {
		const config = resolvePlatformConfig({
			"billing.topUpMinAmount": 100,
			"billing.topUpMaxAmount": 50,
		}).values;
		expect(crossValidatePlatformConfig(config).map((e) => e.key)).toEqual([
			"billing.topUpMinAmount",
		]);
	});
});

describe("parseStoredPlatformConfig", () => {
	it("drops keys that no longer validate", () => {
		const { values, invalidKeys } = parseStoredPlatformConfig(
			JSON.stringify({
				"billing.platformFeePercent": 3,
				"gateway.maxInflightPerPod": -5,
				"removed.key": true,
			}),
		);
		expect(values).toEqual({ "billing.platformFeePercent": 3 });
		expect(invalidKeys.sort()).toEqual([
			"gateway.maxInflightPerPod",
			"removed.key",
		]);
	});

	it("reports unparseable JSON", () => {
		expect(parseStoredPlatformConfig("{").invalidKeys).toHaveLength(1);
		expect(parseStoredPlatformConfig(null)).toEqual({
			values: {},
			invalidKeys: [],
		});
	});
});

describe("describePlatformConfig", () => {
	it("lists every entry with metadata, value and source", () => {
		const view = describePlatformConfig(
			resolvePlatformConfig({ "company.name": "Acme" }, {}),
		);
		expect(view.entries).toHaveLength(
			Object.keys(PLATFORM_CONFIG_REGISTRY).length,
		);
		expect(view.categories.map((c) => c.id)).toContain("gateway");
		const entry = view.entries.find((e) => e.key === "company.name");
		expect(entry).toMatchObject({
			category: "company",
			type: "string",
			default: "Vichar",
			value: "Acme",
			source: "db",
			secret: false,
		});
		for (const e of view.entries) {
			expect(view.categories.map((c) => c.id)).toContain(e.category);
		}
	});
});
