import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, tables } from "@llmgateway/db";

import { adminRoleAllows, redactAdminRequestBody } from "./admin.js";

const originalAdminEmails = process.env.ADMIN_EMAILS;

const PASSWORD_HASH =
	"c11ef27a7f9264be08db228ebb650888:a4d985a9c6bd98608237fd507534424950aa7fc255930d972242b81cbe78594f8568feb0d067e95ddf7be242ad3e9d013f695f4414fce68bfff091079f1dc460";

describe("adminRoleAllows", () => {
	const refund = "/admin/organizations/org-1/transactions/tx-1/refund";

	it("gives admins everything", () => {
		expect(adminRoleAllows("admin", "POST", "/admin/users/u/block")).toBe(true);
		expect(adminRoleAllows("admin", "GET", "/admin/metrics")).toBe(true);
	});

	it("keeps viewers to non-revenue reads", () => {
		expect(adminRoleAllows("viewer", "GET", "/admin/organizations")).toBe(true);
		expect(adminRoleAllows("viewer", "GET", "/admin/metrics/timeseries")).toBe(
			false,
		);
		expect(adminRoleAllows("viewer", "GET", "/admin/global-stats")).toBe(false);
		expect(adminRoleAllows("viewer", "POST", refund)).toBe(false);
	});

	it("allows support only the allowlisted mutations", () => {
		expect(adminRoleAllows("support", "POST", refund)).toBe(true);
		expect(adminRoleAllows("support", "POST", "/admin/send-email")).toBe(true);
		expect(adminRoleAllows("support", "POST", "/admin/users/u/block")).toBe(
			false,
		);
		expect(adminRoleAllows("support", "GET", "/admin/team")).toBe(false);
		expect(adminRoleAllows("support", "PUT", "/admin/rate-limits/r")).toBe(
			false,
		);
		expect(
			adminRoleAllows("support", "DELETE", "/admin/crm/activities/a"),
		).toBe(true);
		expect(adminRoleAllows("support", "DELETE", "/admin/crm/accounts/a")).toBe(
			false,
		);
	});

	it("keeps operational load and incident data readable by every role", () => {
		for (const role of ["viewer", "support"] as const) {
			expect(adminRoleAllows(role, "GET", "/admin/load/overview")).toBe(true);
			expect(
				adminRoleAllows(role, "GET", "/admin/providers/openai/incidents"),
			).toBe(true);
		}
	});
});

describe("redactAdminRequestBody", () => {
	it("redacts secret-looking keys at any depth", () => {
		expect(
			redactAdminRequestBody({
				reason: "rotate",
				apiKey: "sk-live",
				nested: { webhookUrl: "https://discord.com/x", password: "p" },
				list: [{ token: "t", name: "ok" }],
			}),
		).toEqual({
			reason: "rotate",
			apiKey: "[redacted]",
			nested: { webhookUrl: "[redacted]", password: "[redacted]" },
			list: [{ token: "[redacted]", name: "ok" }],
		});
	});
});

describe("adminActionLogMiddleware", () => {
	let cookie: string;

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

	it("records mutating requests with secrets redacted", async () => {
		const res = await app.request("/admin/settings/model-error-rate-alerts", {
			method: "PUT",
			headers: { Cookie: cookie, "Content-Type": "application/json" },
			body: JSON.stringify({
				enabled: true,
				thresholdPercent: 25,
				minRequests: 10,
				windowMinutes: 15,
				cooldownMinutes: 60,
				webhookUrl: "https://discord.com/api/webhooks/1/secret",
			}),
		});
		expect(res.status).toBe(200);

		const rows = await db.query.adminActionLog.findMany();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			adminUserId: "test-user-id",
			adminEmail: "admin@example.com",
			adminRole: "admin",
			method: "PUT",
			path: "/admin/settings/model-error-rate-alerts",
			statusCode: 200,
			targetOrganizationId: null,
		});
		expect(rows[0].requestSummary).toEqual({
			body: expect.objectContaining({
				thresholdPercent: 25,
				webhookUrl: "[redacted]",
			}),
		});
	});

	it("records the target and status of rejected requests", async () => {
		const res = await app.request("/admin/organizations/missing-org/unblock", {
			method: "POST",
			headers: { Cookie: cookie, "Content-Type": "application/json" },
			body: JSON.stringify({ reactivateMembers: false }),
		});
		expect(res.status).toBe(404);

		const [row] = await db.query.adminActionLog.findMany();
		expect(row).toMatchObject({
			targetOrganizationId: "missing-org",
			statusCode: 404,
		});
	});

	it("does not record reads or non-admin requests", async () => {
		const read = await app.request("/admin/organizations", {
			headers: { Cookie: cookie },
		});
		expect(read.status).toBe(200);

		await db.insert(tables.user).values({
			id: "outsider",
			email: "outsider@example.com",
			emailVerified: true,
		});
		await db.insert(tables.account).values({
			id: "outsider-account",
			providerId: "credential",
			accountId: "outsider-account",
			userId: "outsider",
			password: PASSWORD_HASH,
		});
		const auth = await app.request("/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: "outsider@example.com",
				password: "admin@example.com1A",
			}),
		});
		const outsider = auth.headers.get("set-cookie")!;
		const denied = await app.request("/admin/users/test-user-id/block", {
			method: "POST",
			headers: { Cookie: outsider, "Content-Type": "application/json" },
			body: JSON.stringify({ reason: "nope" }),
		});
		expect(denied.status).toBe(403);

		expect(await db.query.adminActionLog.findMany()).toHaveLength(0);
	});
});
