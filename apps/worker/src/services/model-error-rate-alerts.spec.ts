import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { redisClient } from "@llmgateway/cache";
import { db, tables } from "@llmgateway/db";

import {
	checkModelErrorRateAlerts,
	modelErrorRateAlertCooldownKey,
} from "./model-error-rate-alerts.js";

const WEBHOOK = "https://discord.com/api/webhooks/1/test";
const NOW = new Date("2026-10-17T12:00:00.000Z");

async function saveSettings(overrides: Record<string, unknown> = {}) {
	const value = JSON.stringify({
		enabled: true,
		thresholdPercent: 20,
		minRequests: 10,
		windowMinutes: 15,
		cooldownMinutes: 60,
		webhookUrl: WEBHOOK,
		...overrides,
	});
	await db
		.insert(tables.systemSetting)
		.values({ id: "model_error_rate_alerts", enabled: true, value })
		.onConflictDoUpdate({
			target: tables.systemSetting.id,
			set: { value },
		});
}

function minutesToMs(minutes: number): number {
	return minutes * 60_000;
}

async function insertHistory(
	mappingId: string,
	minutesAgo: number,
	counts: {
		logs: number;
		upstream?: number;
		gateway?: number;
		client?: number;
	},
) {
	await db.insert(tables.modelProviderMappingHistory).values({
		modelId: `${mappingId}-model`,
		providerId: "openai",
		modelProviderMappingId: mappingId,
		minuteTimestamp: new Date(NOW.getTime() - minutesToMs(minutesAgo)),
		logsCount: counts.logs,
		upstreamErrorsCount: counts.upstream ?? 0,
		gatewayErrorsCount: counts.gateway ?? 0,
		clientErrorsCount: counts.client ?? 0,
		errorsCount:
			(counts.upstream ?? 0) + (counts.gateway ?? 0) + (counts.client ?? 0),
	});
}

const MAPPINGS = ["mp-broken", "mp-healthy", "mp-quiet", "mp-client", "mp-old"];

describe("checkModelErrorRateAlerts", () => {
	const fetchMock = vi.fn();

	beforeEach(async () => {
		await db.delete(tables.modelProviderMappingHistory);
		await db.delete(tables.systemSetting);
		await redisClient.del(...MAPPINGS.map(modelErrorRateAlertCooldownKey));
		fetchMock
			.mockReset()
			.mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(async () => {
		vi.unstubAllGlobals();
		await db.delete(tables.modelProviderMappingHistory);
		await db.delete(tables.systemSetting);
		await redisClient.del(...MAPPINGS.map(modelErrorRateAlertCooldownKey));
	});

	it("posts each breach once, then suppresses repeats during the cooldown", async () => {
		await saveSettings();
		await insertHistory("mp-broken", 2, { logs: 10, upstream: 3 });
		await insertHistory("mp-broken", 5, { logs: 10, gateway: 2 });
		await insertHistory("mp-healthy", 2, { logs: 100, upstream: 5 });
		await insertHistory("mp-quiet", 2, { logs: 5, upstream: 5 });
		await insertHistory("mp-client", 2, { logs: 20, client: 20 });
		await insertHistory("mp-old", 30, { logs: 50, upstream: 50 });

		const posted = await checkModelErrorRateAlerts(NOW);
		expect(posted).toEqual([
			expect.objectContaining({
				mappingId: "mp-broken",
				requests: 20,
				errors: 5,
				errorRatePercent: 25,
			}),
		]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(WEBHOOK);
		const payload = JSON.parse(init.body as string);
		expect(payload.embeds).toHaveLength(1);
		expect(payload.embeds[0].title).toBe(
			"High error rate: openai/mp-broken-model",
		);

		expect(await checkModelErrorRateAlerts(NOW)).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(
			await redisClient.ttl(modelErrorRateAlertCooldownKey("mp-broken")),
		).toBeGreaterThan(3500);
	});

	it("does nothing when disabled", async () => {
		await saveSettings({ enabled: false });
		await insertHistory("mp-broken", 2, { logs: 20, upstream: 20 });

		expect(await checkModelErrorRateAlerts(NOW)).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("releases the cooldown when the webhook fails so the next run retries", async () => {
		await saveSettings();
		await insertHistory("mp-broken", 2, { logs: 20, upstream: 20 });
		fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));

		await expect(checkModelErrorRateAlerts(NOW)).rejects.toThrow(
			"Discord webhook error: 500",
		);
		expect(
			await redisClient.exists(modelErrorRateAlertCooldownKey("mp-broken")),
		).toBe(0);

		expect(await checkModelErrorRateAlerts(NOW)).toHaveLength(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
