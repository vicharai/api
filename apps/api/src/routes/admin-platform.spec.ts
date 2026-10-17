import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, tables } from "@llmgateway/db";

async function put(cookie: string, path: string, body: unknown) {
	return await app.request(path, {
		method: "PUT",
		headers: { Cookie: cookie, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("admin platform routes", () => {
	let cookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
	});

	afterEach(async () => {
		await deleteAll();
	});

	test("rejects non-admins", async () => {
		process.env.ADMIN_EMAILS = "someone-else@example.com";
		const res = await app.request("/admin/settings/platform-controls", {
			headers: { Cookie: cookie },
		});
		expect(res.status).toBe(403);
	});

	test("returns open defaults for platform controls", async () => {
		const res = await app.request("/admin/settings/platform-controls", {
			headers: { Cookie: cookie },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			signupMode: "open",
			blockedSignupIps: [],
			maintenance: { enabled: false, message: null },
		});
	});

	test("applies partial platform control updates", async () => {
		let res = await put(cookie, "/admin/settings/platform-controls", {
			signupMode: "invite_only",
			blockedSignupIps: ["203.0.113.0/24", "2001:DB8::/32", "198.51.100.7"],
		});
		expect(res.status).toBe(200);

		res = await put(cookie, "/admin/settings/platform-controls", {
			maintenance: { enabled: true, message: "  Upgrading  " },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			signupMode: "invite_only",
			blockedSignupIps: ["203.0.113.0/24", "2001:db8::/32", "198.51.100.7"],
			maintenance: { enabled: true, message: "Upgrading" },
		});
	});

	test("rejects invalid IP rules", async () => {
		const res = await put(cookie, "/admin/settings/platform-controls", {
			blockedSignupIps: ["10.0.0.0/33"],
		});
		expect(res.status).toBe(400);
	});

	test("stores the admin digest settings", async () => {
		let res = await app.request("/admin/settings/admin-digest", {
			headers: { Cookie: cookie },
		});
		expect(await res.json()).toEqual({ enabled: false, hourUtc: 8 });

		res = await put(cookie, "/admin/settings/admin-digest", {
			enabled: true,
			hourUtc: 6,
		});
		expect(res.status).toBe(200);

		res = await app.request("/admin/settings/admin-digest", {
			headers: { Cookie: cookie },
		});
		expect(await res.json()).toEqual({ enabled: true, hourUtc: 6 });

		res = await put(cookie, "/admin/settings/admin-digest", {
			enabled: true,
			hourUtc: 24,
		});
		expect(res.status).toBe(400);
	});

	test("merges activity sources newest first and pages by createdAt", async () => {
		await db.insert(tables.organization).values({
			id: "feed-org",
			name: "Feed Org",
			billingEmail: "billing@example.com",
		});
		await db.insert(tables.user).values({
			id: "feed-user",
			email: "feed-user@example.com",
			createdAt: new Date("2026-10-10T10:00:00Z"),
			riskStatus: "flagged",
			riskFlaggedAt: new Date("2026-10-10T11:00:00Z"),
			riskFlagSource: "signup",
		});
		await db.insert(tables.transaction).values([
			{
				id: "feed-topup",
				organizationId: "feed-org",
				type: "credit_topup",
				amount: "50",
				creditAmount: "50",
				status: "completed",
				createdAt: new Date("2026-10-10T12:00:00Z"),
			},
			{
				id: "feed-gift",
				organizationId: "feed-org",
				type: "credit_gift",
				creditAmount: "5",
				status: "completed",
				createdAt: new Date("2026-10-10T13:00:00Z"),
			},
			{
				id: "feed-pending",
				organizationId: "feed-org",
				type: "credit_topup",
				amount: "99",
				status: "pending",
				createdAt: new Date("2026-10-10T13:30:00Z"),
			},
		]);
		await db.insert(tables.adminActionLog).values([
			{
				id: "feed-block",
				adminEmail: "admin@example.com",
				adminRole: "admin",
				method: "POST",
				path: "/admin/organizations/feed-org/block",
				targetOrganizationId: "feed-org",
				statusCode: 200,
				requestSummary: { body: { reason: "fraud" } },
				createdAt: new Date("2026-10-10T14:00:00Z"),
			},
			{
				id: "feed-action",
				adminEmail: "admin@example.com",
				adminRole: "admin",
				method: "PUT",
				path: "/admin/settings/banner",
				statusCode: 200,
				createdAt: new Date("2026-10-10T15:00:00Z"),
			},
		]);

		const before = "2026-10-11T00:00:00.000Z";
		const res = await app.request(
			`/admin/activity-feed?limit=10&before=${before}`,
			{ headers: { Cookie: cookie } },
		);
		expect(res.status).toBe(200);
		const { events } = await res.json();
		expect(
			events.map((e: { id: string; type: string }) => [e.id, e.type]),
		).toEqual([
			["admin_action:feed-action", "admin_action"],
			["admin_action:feed-block", "block"],
			["transaction:feed-gift", "credit_change"],
			["transaction:feed-topup", "payment"],
			["flag:feed-user", "flag"],
			["signup:feed-user", "signup"],
		]);
		expect(events[1].detail).toContain("fraud");
		expect(events[3]).toMatchObject({
			organizationId: "feed-org",
			amount: 50,
		});

		const page = await app.request(
			`/admin/activity-feed?limit=2&before=${events[2].createdAt}`,
			{ headers: { Cookie: cookie } },
		);
		const next = await page.json();
		expect(next.events.map((e: { id: string }) => e.id)).toEqual([
			"transaction:feed-topup",
			"flag:feed-user",
		]);
	});
});
