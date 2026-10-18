import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import {
	apiKeyHourlyStats,
	db,
	projectHourlyStats,
	tables,
} from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

const originalAdminEmails = process.env.ADMIN_EMAILS;

function minutesAgo(minutes: number): Date {
	const offsetMs = minutes * 60_000;
	const date = new Date(Date.now() - offsetMs);
	date.setSeconds(0, 0);
	return date;
}

function hoursAgo(hours: number): Date {
	const offsetMs = hours * 3_600_000;
	const date = new Date(Date.now() - offsetMs);
	date.setMinutes(0, 0, 0);
	return date;
}

const mappingRow = {
	clientErrorsCount: 0,
	gatewayErrorsCount: 0,
	upstreamErrorsCount: 0,
	totalInputTokens: 0,
	totalOutputTokens: 0,
	totalTokens: 0,
	totalDuration: 0,
	totalTimeToFirstToken: 0,
	timeToFirstTokenCount: 0,
	totalCost: 0,
	errorsCount: 0,
};

async function seedMappingHistory() {
	await db.insert(tables.modelProviderMappingHistory).values([
		{
			...mappingRow,
			modelId: "gpt-4o",
			providerId: "openai",
			modelProviderMappingId: "load-openai-gpt-4o",
			minuteTimestamp: minutesAgo(10),
			logsCount: 100,
			errorsCount: 10,
			clientErrorsCount: 4,
			upstreamErrorsCount: 5,
			gatewayErrorsCount: 1,
			totalInputTokens: 1000,
			totalOutputTokens: 500,
			totalTokens: 1500,
			totalDuration: 50_000,
			totalTimeToFirstToken: 4_000,
			timeToFirstTokenCount: 20,
			totalCost: 1.5,
		},
		{
			...mappingRow,
			modelId: "gpt-4o",
			providerId: "azure",
			modelProviderMappingId: "load-azure-gpt-4o",
			minuteTimestamp: minutesAgo(5),
			logsCount: 50,
			errorsCount: 0,
			totalInputTokens: 200,
			totalOutputTokens: 100,
			totalTokens: 300,
			totalDuration: 10_000,
			totalCost: 0.5,
		},
		{
			...mappingRow,
			modelId: "claude-sonnet-4-5",
			providerId: "anthropic",
			modelProviderMappingId: "load-anthropic-sonnet",
			minuteTimestamp: minutesAgo(5),
			logsCount: 20,
			errorsCount: 2,
			upstreamErrorsCount: 2,
			totalInputTokens: 9000,
			totalOutputTokens: 1000,
			totalTokens: 10_000,
			totalDuration: 20_000,
			totalCost: 3,
		},
		{
			...mappingRow,
			modelId: "gpt-4o",
			providerId: "openai",
			modelProviderMappingId: "load-openai-gpt-4o",
			minuteTimestamp: minutesAgo(180),
			logsCount: 999,
			errorsCount: 999,
		},
	]);
	await db.insert(tables.modelProviderMappingHistoryHourly).values([
		{
			...mappingRow,
			modelId: "gpt-4o",
			providerId: "openai",
			modelProviderMappingId: "load-openai-gpt-4o",
			hourTimestamp: hoursAgo(48),
			logsCount: 1000,
			errorsCount: 100,
			upstreamErrorsCount: 100,
			totalTokens: 20_000,
			totalDuration: 1_000_000,
			totalCost: 10,
		},
		{
			...mappingRow,
			modelId: "gpt-4o",
			providerId: "openai",
			modelProviderMappingId: "load-openai-gpt-4o",
			hourTimestamp: hoursAgo(24 * 30),
			logsCount: 7777,
		},
	]);
}

async function seedHourlyStats() {
	await db.insert(tables.organization).values([
		{ id: "load-org-a", name: "Load Org A", billingEmail: "a@load.test" },
		{ id: "load-org-b", name: "Load Org B", billingEmail: "b@load.test" },
	]);
	await db.insert(tables.project).values([
		{ id: "load-proj-a1", name: "A1", organizationId: "load-org-a" },
		{ id: "load-proj-a2", name: "A2", organizationId: "load-org-a" },
		{ id: "load-proj-b1", name: "B1", organizationId: "load-org-b" },
	]);
	await db.insert(tables.apiKey).values([
		{
			id: "load-key-a1",
			projectId: "load-proj-a1",
			...hashApiKeyForStorage("load-key-a1-token"),
			description: "Key A1",
			createdBy: "test-user-id",
		},
		{
			id: "load-key-b1",
			projectId: "load-proj-b1",
			...hashApiKeyForStorage("load-key-b1-token"),
			description: "",
			createdBy: "test-user-id",
		},
	]);
	await db.insert(projectHourlyStats).values([
		{
			projectId: "load-proj-a1",
			hourTimestamp: hoursAgo(1),
			requestCount: 10,
			errorCount: 1,
			clientErrorCount: 1,
			inputTokens: "100",
			outputTokens: "50",
			totalTokens: "150",
			cost: 1,
		},
		{
			projectId: "load-proj-a2",
			hourTimestamp: hoursAgo(2),
			requestCount: 5,
			totalTokens: "5000",
			cost: 2,
		},
		{
			projectId: "load-proj-b1",
			hourTimestamp: hoursAgo(0),
			requestCount: 30,
			errorCount: 3,
			totalTokens: "300",
			cost: 0.5,
		},
		{
			projectId: "load-proj-b1",
			hourTimestamp: hoursAgo(72),
			requestCount: 500,
		},
	]);
	await db.insert(apiKeyHourlyStats).values([
		{
			apiKeyId: "load-key-a1",
			projectId: "load-proj-a1",
			hourTimestamp: hoursAgo(1),
			requestCount: 10,
			errorCount: 1,
			totalTokens: "150",
			cost: 1,
		},
		{
			apiKeyId: "load-key-b1",
			projectId: "load-proj-b1",
			hourTimestamp: hoursAgo(0),
			requestCount: 30,
			errorCount: 3,
			totalTokens: "300",
			cost: 0.5,
		},
	]);
}

describe("admin gateway load", () => {
	let cookie: string;

	async function get(path: string) {
		return await app.request(path, { headers: { Cookie: cookie } });
	}

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await db.delete(tables.modelProviderMappingHistory);
		await db.delete(tables.modelProviderMappingHistoryHourly);
		await seedMappingHistory();
		await seedHourlyStats();
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await db.delete(tables.modelProviderMappingHistory);
		await db.delete(tables.modelProviderMappingHistoryHourly);
		await deleteAll();
	});

	it("rejects non-admins", async () => {
		process.env.ADMIN_EMAILS = "someone-else@example.com";
		expect((await get("/admin/load/overview")).status).toBe(403);
		expect((await get("/admin/providers/openai/incidents")).status).toBe(403);
	});

	it("aggregates minute history by model for short windows", async () => {
		const res = await get("/admin/load/overview?window=1h&groupBy=model");
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body.window).toBe("1h");
		expect(body.groupBy).toBe("model");
		expect(body.summary).toMatchObject({
			requests: 170,
			errors: 12,
			clientErrors: 4,
			inputTokens: 10_200,
			outputTokens: 1600,
			totalTokens: 11_800,
			avgDurationMs: Math.round(80_000 / 170),
			avgTtftMs: 200,
		});
		expect(body.summary.errorRate).toBeCloseTo(12 / 170);
		expect(body.summary.requestsPerSecond).toBeCloseTo(170 / 3600);
		expect(body.summary.cost).toBeCloseTo(5);

		expect(body.breakdown.map((b: { key: string }) => b.key)).toEqual([
			"gpt-4o",
			"claude-sonnet-4-5",
		]);
		expect(body.breakdown[0]).toMatchObject({
			requests: 150,
			errors: 10,
			totalTokens: 1800,
			avgDurationMs: 400,
			avgTtftMs: 200,
		});
		expect(body.breakdown[0].label).not.toBe("");

		const seriesTotal = body.timeseries.reduce(
			(sum: number, point: { requests: number }) => sum + point.requests,
			0,
		);
		expect(seriesTotal).toBe(170);
		expect(body.timeseries.length).toBe(2);
	});

	it("groups by provider ordered by tokens", async () => {
		const res = await get(
			"/admin/load/overview?window=6h&groupBy=provider&metric=tokens",
		);
		const body = await res.json();
		expect(body.breakdown.map((b: { key: string }) => b.key)).toEqual([
			"anthropic",
			"openai",
			"azure",
		]);
		expect(body.breakdown[0].label).toBe("Anthropic");
	});

	it("reads the hourly rollup for windows over 24h", async () => {
		const res = await get("/admin/load/overview?window=7d&groupBy=provider");
		const body = await res.json();
		expect(body.summary.requests).toBe(1000);
		expect(body.summary.errors).toBe(100);
		expect(body.summary.avgDurationMs).toBe(1000);
		expect(body.breakdown).toHaveLength(1);
		expect(body.breakdown[0]).toMatchObject({ key: "openai", requests: 1000 });
	});

	it("groups hourly project stats by organization without latency", async () => {
		const res = await get(
			"/admin/load/overview?window=24h&groupBy=organization",
		);
		const body = await res.json();
		expect(body.summary).toMatchObject({
			requests: 45,
			errors: 4,
			clientErrors: 1,
			totalTokens: 5450,
			avgDurationMs: null,
			avgTtftMs: null,
		});
		expect(body.breakdown).toEqual([
			expect.objectContaining({
				key: "load-org-b",
				label: "Load Org B",
				requests: 30,
				errors: 3,
				errorRate: 0.1,
				avgDurationMs: null,
			}),
			expect.objectContaining({
				key: "load-org-a",
				label: "Load Org A",
				requests: 15,
				totalTokens: 5150,
				cost: 3,
			}),
		]);

		const byTokens = await (
			await get(
				"/admin/load/overview?window=24h&groupBy=organization&metric=tokens",
			)
		).json();
		expect(byTokens.breakdown[0].key).toBe("load-org-a");
	});

	it("groups by project and api key", async () => {
		const projects = await (
			await get("/admin/load/overview?window=24h&groupBy=project")
		).json();
		expect(projects.breakdown.map((b: { key: string }) => b.key)).toEqual([
			"load-proj-b1",
			"load-proj-a1",
			"load-proj-a2",
		]);

		const keys = await (
			await get("/admin/load/overview?window=24h&groupBy=apiKey")
		).json();
		expect(keys.summary.requests).toBe(40);
		expect(keys.breakdown).toEqual([
			expect.objectContaining({ key: "load-key-b1", requests: 30 }),
			expect.objectContaining({
				key: "load-key-a1",
				label: "Key A1",
				requests: 10,
			}),
		]);
		expect(keys.breakdown[0].label).not.toBe("");
	});

	it("reports provider incidents per model and error class", async () => {
		const res = await get("/admin/providers/openai/incidents?window=1h");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.summary).toEqual({
			requests: 100,
			errors: 10,
			upstreamErrors: 5,
			gatewayErrors: 1,
			clientErrors: 4,
			errorRate: 0.1,
		});
		expect(body.byModel).toEqual([
			{
				modelId: "gpt-4o",
				requests: 100,
				errors: 10,
				upstreamErrors: 5,
				gatewayErrors: 1,
				clientErrors: 4,
				errorRate: 0.1,
			},
		]);
		expect(body.timeseries).toHaveLength(1);

		const wide = await (
			await get("/admin/providers/openai/incidents?window=7d")
		).json();
		expect(wide.summary.requests).toBe(1000);
		expect(wide.summary.upstreamErrors).toBe(100);
	});
});
