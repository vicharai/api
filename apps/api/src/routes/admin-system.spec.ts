import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { redisClient, storageRedisClient } from "@llmgateway/cache";
import {
	db,
	drizzleCache,
	eq,
	organizationCacheTag,
	systemSettingCacheTag,
	tables,
} from "@llmgateway/db";
import {
	GATEWAY_MAINTENANCE_SETTING_ID,
	WORKER_HEARTBEAT_KEY,
} from "@llmgateway/shared";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const FIVE_MINUTES_MS = 5 * 60 * 1000;

async function invalidate(cookie: string, body: unknown) {
	return await app.request("/admin/cache/invalidate", {
		method: "POST",
		headers: { Cookie: cookie, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("admin system routes", () => {
	let cookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
	});

	afterEach(async () => {
		await redisClient.del(WORKER_HEARTBEAT_KEY);
		await deleteAll();
	});

	test("reports healthy dependencies with a fresh worker heartbeat", async () => {
		await redisClient.set(WORKER_HEARTBEAT_KEY, new Date().toISOString());
		process.env.APP_VERSION = "v9.9.9-test";

		const res = await app.request("/admin/system/health", {
			headers: { Cookie: cookie },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		const byName = Object.fromEntries(
			body.checks.map((check: { name: string; status: string }) => [
				check.name,
				check.status,
			]),
		);
		expect(byName).toMatchObject({
			postgres: "ok",
			redis: "ok",
			storage_redis: "ok",
			worker: "ok",
			log_queue: "ok",
			settings_cache: "ok",
		});
		expect(body.version).toBe("v9.9.9-test");
		expect(typeof body.checkedAt).toBe("string");
		delete process.env.APP_VERSION;
	});

	test("marks the worker degraded when the heartbeat is stale", async () => {
		await redisClient.set(
			WORKER_HEARTBEAT_KEY,
			new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
		);
		const res = await app.request("/admin/system/health", {
			headers: { Cookie: cookie },
		});
		const body = await res.json();
		expect(
			body.checks.find((check: { name: string }) => check.name === "worker"),
		).toMatchObject({ status: "degraded" });
	});

	test("evicts the organization and settings caches", async () => {
		await db.insert(tables.organization).values({
			id: "cache-org",
			name: "Cache Org",
			billingEmail: "billing@example.com",
		});
		await drizzleCache.put(
			organizationCacheTag("cache-org"),
			[{ id: "cache-org" }],
			["organization"],
			true,
		);
		const settingTag = systemSettingCacheTag(GATEWAY_MAINTENANCE_SETTING_ID);
		await drizzleCache.put(
			settingTag,
			[{ enabled: true }],
			["system_setting"],
			true,
		);

		expect(
			(
				await invalidate(cookie, {
					scope: "organization",
					targetId: "cache-org",
				})
			).status,
		).toBe(200);
		expect(
			await drizzleCache.get(organizationCacheTag("cache-org"), [], true),
		).toBeUndefined();

		const res = await invalidate(cookie, { scope: "settings" });
		expect(await res.json()).toEqual({ success: true, cleared: null });
		expect(await drizzleCache.get(settingTag, [], true)).toBeUndefined();
	});

	test("validates cache targets", async () => {
		expect((await invalidate(cookie, { scope: "organization" })).status).toBe(
			400,
		);
		expect(
			(await invalidate(cookie, { scope: "organization", targetId: "nope" }))
				.status,
		).toBe(404);
		expect(
			(await invalidate(cookie, { scope: "apiKey", targetId: "nope" })).status,
		).toBe(404);
		expect((await invalidate(cookie, { scope: "apiKey" })).status).toBe(200);

		await db
			.insert(tables.model)
			.values({ id: "cache-test-model", name: "Cache Test", family: "test" })
			.onConflictDoNothing();
		expect(
			(
				await invalidate(cookie, {
					scope: "responseCache",
					targetId: "cache-test-model",
				})
			).status,
		).toBe(400);
		await db
			.delete(tables.model)
			.where(eq(tables.model.id, "cache-test-model"));
	});

	test("flushes only the target organization's response cache", async () => {
		await db.insert(tables.organization).values([
			{ id: "rc-org", name: "RC Org", billingEmail: "rc@example.com" },
			{ id: "rc-other", name: "RC Other", billingEmail: "other@example.com" },
		]);
		await db.insert(tables.project).values([
			{ id: "rc-project", name: "RC", organizationId: "rc-org" },
			{ id: "rc-other-project", name: "Other", organizationId: "rc-other" },
		]);
		const ownKeys = [`rc-project:${HASH_A}`, `stream:rc-project:${HASH_B}`];
		const keptKeys = [
			`rc-other-project:${HASH_A}`,
			`responses:item:rc-project:${HASH_A}`,
		];
		for (const key of [...ownKeys, ...keptKeys]) {
			await storageRedisClient.set(key, "{}", "EX", 300);
		}

		const res = await invalidate(cookie, {
			scope: "responseCache",
			targetId: "rc-org",
		});
		expect(await res.json()).toEqual({ success: true, cleared: 2 });
		expect(await storageRedisClient.exists(...ownKeys)).toBe(0);
		expect(await storageRedisClient.exists(...keptKeys)).toBe(2);

		const all = await invalidate(cookie, { scope: "responseCache" });
		expect((await all.json()).cleared).toBeGreaterThanOrEqual(1);
		expect(await storageRedisClient.exists(keptKeys[0]!)).toBe(0);
		expect(await storageRedisClient.exists(keptKeys[1]!)).toBe(1);
		await storageRedisClient.del(keptKeys[1]!);
	});
});
