import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, getPlatformConfig } from "@llmgateway/db";

interface ConfigEntry {
	key: string;
	value: unknown;
	default: unknown;
	source: "db" | "env" | "default";
	env: string | null;
}

interface ConfigResponse {
	categories: { id: string; label: string }[];
	entries: ConfigEntry[];
}

async function request(
	cookie: string,
	method: string,
	path: string,
	body?: unknown,
) {
	return await app.request(path, {
		method,
		headers: { Cookie: cookie, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

function entry(config: ConfigResponse, key: string): ConfigEntry {
	const found = config.entries.find((e) => e.key === key);
	if (!found) {
		throw new Error(`missing entry ${key}`);
	}
	return found;
}

describe("admin platform config", () => {
	let cookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await deleteAll();
	});

	test("rejects non-admins", async () => {
		process.env.ADMIN_EMAILS = "someone-else@example.com";
		const res = await request(cookie, "GET", "/admin/settings/config");
		expect(res.status).toBe(403);
	});

	test("lists the registry with effective values and sources", async () => {
		vi.stubEnv("GATEWAY_MAX_INFLIGHT_REQUESTS", "321");
		const res = await request(cookie, "GET", "/admin/settings/config");
		expect(res.status).toBe(200);
		const config = (await res.json()) as ConfigResponse;

		expect(config.categories.map((c) => c.id)).toEqual([
			"gateway",
			"billing",
			"plans",
			"company",
			"retention",
			"abuse",
			"contentFilter",
		]);
		expect(entry(config, "billing.topUpMinAmount")).toMatchObject({
			value: 20,
			default: 20,
			source: "default",
			env: null,
		});
		expect(entry(config, "gateway.maxInflightPerPod")).toMatchObject({
			value: 321,
			default: 1000,
			source: "env",
			env: "GATEWAY_MAX_INFLIGHT_REQUESTS",
		});
	});

	test("stores partial updates that win over env, and resets them", async () => {
		vi.stubEnv("GATEWAY_MAX_INFLIGHT_REQUESTS", "321");

		let res = await request(cookie, "PUT", "/admin/settings/config", {
			values: { "gateway.maxInflightPerPod": 50 },
		});
		expect(res.status).toBe(200);
		res = await request(cookie, "PUT", "/admin/settings/config", {
			values: {
				"billing.platformFeePercent": 2.5,
				"gateway.modelAllowlist": ["vichar-*"],
			},
		});
		expect(res.status).toBe(200);
		let config = (await res.json()) as ConfigResponse;
		expect(entry(config, "gateway.maxInflightPerPod")).toMatchObject({
			value: 50,
			source: "db",
		});
		expect(entry(config, "billing.platformFeePercent")).toMatchObject({
			value: 2.5,
			source: "db",
		});
		expect((await getPlatformConfig())["gateway.modelAllowlist"]).toEqual([
			"vichar-*",
		]);

		res = await request(
			cookie,
			"DELETE",
			"/admin/settings/config/gateway.maxInflightPerPod",
		);
		expect(res.status).toBe(200);
		config = (await res.json()) as ConfigResponse;
		expect(entry(config, "gateway.maxInflightPerPod")).toMatchObject({
			value: 321,
			source: "env",
		});
		expect(entry(config, "billing.platformFeePercent").source).toBe("db");
	});

	test("rejects invalid values without writing anything", async () => {
		const res = await request(cookie, "PUT", "/admin/settings/config", {
			values: {
				"billing.platformFeePercent": 3,
				"billing.topUpMinAmount": -1,
				"gateway.rateLimitsEnabled": "yes",
				"not.a.setting": 1,
			},
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as {
			message: string;
			errors: { key: string }[];
		};
		expect(body.message).toContain("billing.topUpMinAmount");
		expect(body.errors.map((e) => e.key).sort()).toEqual([
			"billing.topUpMinAmount",
			"gateway.rateLimitsEnabled",
			"not.a.setting",
		]);
		expect((await getPlatformConfig())["billing.platformFeePercent"]).toBe(5);
	});

	test("rejects updates that conflict with stored values", async () => {
		let res = await request(cookie, "PUT", "/admin/settings/config", {
			values: { "billing.topUpMaxAmount": 100 },
		});
		expect(res.status).toBe(200);
		res = await request(cookie, "PUT", "/admin/settings/config", {
			values: { "billing.topUpMinAmount": 200 },
		});
		expect(res.status).toBe(400);
	});

	test("returns 404 when resetting an unknown key", async () => {
		const res = await request(
			cookie,
			"DELETE",
			"/admin/settings/config/not.a.setting",
		);
		expect(res.status).toBe(404);
	});

	test("records writes in the admin action log", async () => {
		await request(cookie, "PUT", "/admin/settings/config", {
			values: { "company.name": "Acme Inc" },
		});
		const logged = await db.query.adminActionLog.findFirst({
			where: { path: { eq: "/admin/settings/config" } },
		});
		expect(logged).toMatchObject({ method: "PUT", statusCode: 200 });
	});
});

describe("public config", () => {
	afterEach(async () => {
		await deleteAll();
	});

	test("serves billing and company settings without auth", async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		const cookie = await createTestUser();

		let res = await app.request("/v1/config");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			billing: {
				topUpMin: 20,
				topUpMax: 5000,
				topUpPresets: [20, 50, 100, 250],
				platformFeePercent: 5,
				autoTopUpDefaultThreshold: 5,
				autoTopUpDefaultAmount: 20,
			},
			company: { name: "Vichar", supportEmail: "contact@vichar.io" },
		});

		await request(cookie, "PUT", "/admin/settings/config", {
			values: {
				"billing.topUpMinAmount": 10,
				"billing.topUpPresets": [10, 40],
				"company.supportEmail": "help@example.com",
			},
		});

		res = await app.request("/v1/config");
		const body = (await res.json()) as {
			billing: { topUpMin: number; topUpPresets: number[] };
			company: { supportEmail: string };
		};
		expect(body.billing.topUpMin).toBe(10);
		expect(body.billing.topUpPresets).toEqual([10, 40]);
		expect(body.company.supportEmail).toBe("help@example.com");
	});
});
