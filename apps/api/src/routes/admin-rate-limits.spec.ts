import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, tables } from "@llmgateway/db";

const originalAdminEmails = process.env.ADMIN_EMAILS;

async function request(
	cookie: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<Response> {
	return await app.request(path, {
		method,
		headers: {
			Cookie: cookie,
			...(body === undefined ? {} : { "Content-Type": "application/json" }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

describe("admin rate limit updates", () => {
	let cookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await db.delete(tables.rateLimit);
		await db.insert(tables.organization).values({
			id: "rl-org",
			name: "Rate Limited Org",
			billingEmail: "rl@example.com",
		});
		await db.insert(tables.rateLimit).values([
			{ id: "global-openai", provider: "openai", maxRpm: 100 },
			{ id: "global-anthropic", provider: "anthropic", maxRpm: 50 },
			{
				id: "org-openai",
				organizationId: "rl-org",
				provider: "openai",
				maxRpm: 10,
			},
		]);
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await db.delete(tables.rateLimit);
		await deleteAll();
	});

	it("updates a global rate limit", async () => {
		const res = await request(
			cookie,
			"PUT",
			"/admin/rate-limits/global-openai",
			{
				provider: "openai",
				limitType: "rpd",
				maxRequests: 5000,
				enforcement: "global",
				reason: "Shared upstream quota",
			},
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			id: "global-openai",
			organizationId: null,
			provider: "openai",
			limitType: "rpd",
			maxRequests: 5000,
			enforcement: "global",
			reason: "Shared upstream quota",
		});

		const row = await db.query.rateLimit.findFirst({
			where: { id: { eq: "global-openai" } },
		});
		expect(row).toMatchObject({ maxRpm: null, maxRpd: 5000 });
	});

	it("rejects missing, mis-scoped, invalid and conflicting updates", async () => {
		const body = { provider: "openai", limitType: "rpm", maxRequests: 1 };

		expect(
			(await request(cookie, "PUT", "/admin/rate-limits/nope", body)).status,
		).toBe(404);
		expect(
			(await request(cookie, "PUT", "/admin/rate-limits/org-openai", body))
				.status,
		).toBe(404);
		expect(
			(
				await request(cookie, "PUT", "/admin/rate-limits/global-openai", {
					...body,
					provider: "not-a-provider",
				})
			).status,
		).toBe(400);
		expect(
			(
				await request(cookie, "PUT", "/admin/rate-limits/global-openai", {
					...body,
					provider: "anthropic",
				})
			).status,
		).toBe(409);
	});

	it("updates an organization rate limit within its organization only", async () => {
		const res = await request(
			cookie,
			"PUT",
			"/admin/organizations/rl-org/rate-limits/org-openai",
			{ provider: "anthropic", limitType: "rpm", maxRequests: 25 },
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			id: "org-openai",
			organizationId: "rl-org",
			provider: "anthropic",
			maxRequests: 25,
		});

		const global = await request(
			cookie,
			"PUT",
			"/admin/organizations/rl-org/rate-limits/global-openai",
			{ provider: "openai", limitType: "rpm", maxRequests: 25 },
		);
		expect(global.status).toBe(404);
	});
});

describe("admin model error-rate alert settings", () => {
	let cookie: string;

	const rules = {
		enabled: true,
		thresholdPercent: 30,
		minRequests: 20,
		windowMinutes: 10,
		cooldownMinutes: 120,
	};

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await deleteAll();
	});

	it("returns defaults when unset", async () => {
		const res = await request(
			cookie,
			"GET",
			"/admin/settings/model-error-rate-alerts",
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			enabled: false,
			thresholdPercent: 20,
			minRequests: 50,
			windowMinutes: 15,
			cooldownMinutes: 60,
			webhookConfigured: false,
		});
	});

	it("stores rules, keeps the webhook when omitted and never returns it", async () => {
		const webhookUrl = "https://discord.com/api/webhooks/123/abc";
		const put = await request(
			cookie,
			"PUT",
			"/admin/settings/model-error-rate-alerts",
			{ ...rules, webhookUrl },
		);
		expect(put.status).toBe(200);
		const putText = await put.text();
		expect(putText).not.toContain("discord.com");
		expect(JSON.parse(putText)).toEqual({ ...rules, webhookConfigured: true });

		const keep = await request(
			cookie,
			"PUT",
			"/admin/settings/model-error-rate-alerts",
			{ ...rules, thresholdPercent: 50 },
		);
		expect(await keep.json()).toMatchObject({
			thresholdPercent: 50,
			webhookConfigured: true,
		});
		const stored = await db.query.systemSetting.findFirst({
			where: { id: { eq: "model_error_rate_alerts" } },
		});
		expect(JSON.parse(stored!.value!)).toMatchObject({
			thresholdPercent: 50,
			webhookUrl,
		});

		const get = await request(
			cookie,
			"GET",
			"/admin/settings/model-error-rate-alerts",
		);
		expect(await get.text()).not.toContain("discord.com");

		const cleared = await request(
			cookie,
			"PUT",
			"/admin/settings/model-error-rate-alerts",
			{ ...rules, enabled: false, webhookUrl: null },
		);
		expect(await cleared.json()).toMatchObject({
			enabled: false,
			webhookConfigured: false,
		});
	});

	it("validates the webhook and the rule bounds", async () => {
		const http = await request(
			cookie,
			"PUT",
			"/admin/settings/model-error-rate-alerts",
			{ ...rules, webhookUrl: "http://discord.com/api/webhooks/1/a" },
		);
		expect(http.status).toBe(400);

		const noWebhook = await request(
			cookie,
			"PUT",
			"/admin/settings/model-error-rate-alerts",
			rules,
		);
		expect(noWebhook.status).toBe(400);

		const outOfRange = await request(
			cookie,
			"PUT",
			"/admin/settings/model-error-rate-alerts",
			{
				...rules,
				windowMinutes: 1,
				webhookUrl: "https://discord.com/api/webhooks/1/a",
			},
		);
		expect(outOfRange.status).toBe(400);
	});
});
