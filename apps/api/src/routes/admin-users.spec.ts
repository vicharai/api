import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, eq, tables } from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

const originalAdminEmails = process.env.ADMIN_EMAILS;

const PASSWORD_HASH =
	"c11ef27a7f9264be08db228ebb650888:a4d985a9c6bd98608237fd507534424950aa7fc255930d972242b81cbe78594f8568feb0d067e95ddf7be242ad3e9d013f695f4414fce68bfff091079f1dc460";

async function insertUser(id: string, email: string) {
	await db.insert(tables.user).values({
		id,
		name: id,
		email,
		emailVerified: true,
	});
	await db.insert(tables.account).values({
		id: `${id}-account`,
		providerId: "credential",
		accountId: `${id}-account`,
		userId: id,
		password: PASSWORD_HASH,
	});
}

async function signIn(email: string): Promise<Response> {
	return await app.request("/auth/sign-in/email", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password: "admin@example.com1A" }),
	});
}

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

async function getUser(id: string) {
	return await db.query.user.findFirst({ where: { id: { eq: id } } });
}

describe("admin users", () => {
	let cookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await insertUser("target-user", "target@example.com");
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await deleteAll();
	});

	it("returns user detail with memberships, sessions and sign-in methods", async () => {
		await db.insert(tables.organization).values({
			id: "detail-org",
			name: "Detail Org",
			billingEmail: "target@example.com",
		});
		await db.insert(tables.userOrganization).values({
			userId: "target-user",
			organizationId: "detail-org",
			role: "owner",
		});
		expect((await signIn("target@example.com")).status).toBe(200);

		const res = await request(cookie, "GET", "/admin/users/target-user");
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.user).toMatchObject({
			id: "target-user",
			email: "target@example.com",
			status: "active",
			isOwnerAdmin: false,
			adminRole: null,
		});
		expect(json.organizations).toEqual([
			expect.objectContaining({ id: "detail-org", role: "owner" }),
		]);
		expect(json.sessions).toHaveLength(1);
		expect(json.accounts).toEqual([{ providerId: "credential" }]);
		expect(json.hasPasskeys).toBe(false);

		const self = await request(cookie, "GET", "/admin/users/test-user-id");
		expect((await self.json()).user).toMatchObject({
			isOwnerAdmin: true,
			adminRole: "admin",
		});

		const missing = await request(cookie, "GET", "/admin/users/nope");
		expect(missing.status).toBe(404);
	});

	it("blocks a user, rejects their login, and unblocks them", async () => {
		const targetSignIn = await signIn("target@example.com");
		expect(targetSignIn.status).toBe(200);
		const targetCookie = targetSignIn.headers.get("set-cookie")!;

		const block = await request(
			cookie,
			"POST",
			"/admin/users/target-user/block",
			{ reason: "Chargeback fraud" },
		);
		expect(block.status).toBe(200);
		expect(await block.json()).toEqual({ success: true });

		const blocked = await getUser("target-user");
		expect(blocked?.status).toBe("deactivated");
		expect(blocked?.blockReason).toBe("Chargeback fraud");
		expect(
			await db.query.session.findMany({
				where: { userId: { eq: "target-user" } },
			}),
		).toHaveLength(0);

		const stale = await request(targetCookie, "GET", "/user/me");
		expect(stale.status).toBe(401);
		expect((await signIn("target@example.com")).status).toBe(403);

		const unblock = await request(
			cookie,
			"POST",
			"/admin/users/target-user/unblock",
		);
		expect(unblock.status).toBe(200);
		const unblocked = await getUser("target-user");
		expect(unblocked?.status).toBe("active");
		expect(unblocked?.blockReason).toBeNull();
		expect((await signIn("target@example.com")).status).toBe(200);
	});

	it("refuses to block the caller or another admin", async () => {
		const self = await request(
			cookie,
			"POST",
			"/admin/users/test-user-id/block",
			{ reason: "oops" },
		);
		expect(self.status).toBe(400);

		await insertUser("owner-two", "owner-two@example.com");
		process.env.ADMIN_EMAILS = "admin@example.com,owner-two@example.com";
		const owner = await request(
			cookie,
			"POST",
			"/admin/users/owner-two/block",
			{ reason: "oops" },
		);
		expect(owner.status).toBe(400);

		await db
			.insert(tables.adminMember)
			.values({ userId: "target-user", role: "viewer" });
		const member = await request(
			cookie,
			"POST",
			"/admin/users/target-user/block",
			{ reason: "oops" },
		);
		expect(member.status).toBe(400);
		expect((await getUser("target-user"))?.status).toBe("active");
	});

	it("rejects non-admins", async () => {
		const targetCookie = (await signIn("target@example.com")).headers.get(
			"set-cookie",
		)!;
		const res = await request(targetCookie, "GET", "/admin/users/test-user-id");
		expect(res.status).toBe(403);

		const block = await request(
			targetCookie,
			"POST",
			"/admin/users/test-user-id/block",
			{ reason: "nope" },
		);
		expect(block.status).toBe(403);
		expect((await getUser("test-user-id"))?.status).toBe("active");
	});

	it("force-logs out a user", async () => {
		await signIn("target@example.com");
		await signIn("target@example.com");

		const res = await request(
			cookie,
			"DELETE",
			"/admin/users/target-user/sessions",
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ deleted: 2 });
		expect((await getUser("target-user"))?.status).toBe("active");
	});

	it("unblocks an organization and only the members its block deactivated", async () => {
		await insertUser("member-b", "member-b@example.com");
		await db.insert(tables.organization).values({
			id: "blocked-org",
			name: "Blocked Org",
			billingEmail: "target@example.com",
			status: "deleted",
			blockReason: "Card testing",
		});
		await db.insert(tables.userOrganization).values([
			{ userId: "target-user", organizationId: "blocked-org", role: "owner" },
			{ userId: "member-b", organizationId: "blocked-org", role: "developer" },
		]);
		await db
			.update(tables.user)
			.set({ status: "deactivated", blockReason: "Card testing" })
			.where(eq(tables.user.id, "target-user"));
		await db
			.update(tables.user)
			.set({ status: "deactivated", blockReason: "Separate abuse" })
			.where(eq(tables.user.id, "member-b"));

		const res = await request(
			cookie,
			"POST",
			"/admin/organizations/blocked-org/unblock",
			{ reactivateMembers: true },
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true, reactivatedMembers: 1 });

		const org = await db.query.organization.findFirst({
			where: { id: { eq: "blocked-org" } },
		});
		expect(org?.status).toBe("active");
		expect(org?.blockReason).toBeNull();
		expect((await getUser("target-user"))?.status).toBe("active");
		expect((await getUser("member-b"))?.status).toBe("deactivated");

		const audit = await db.query.auditLog.findMany({
			where: { organizationId: { eq: "blocked-org" } },
		});
		expect(audit).toEqual([
			expect.objectContaining({
				action: "organization.update",
				userId: "test-user-id",
			}),
		]);

		const missing = await request(
			cookie,
			"POST",
			"/admin/organizations/nope/unblock",
			{ reactivateMembers: false },
		);
		expect(missing.status).toBe(404);
	});

	it("revokes and reactivates an organization's API key", async () => {
		await db.insert(tables.organization).values([
			{ id: "key-org", name: "Key Org", billingEmail: "a@example.com" },
			{ id: "other-org", name: "Other Org", billingEmail: "b@example.com" },
		]);
		await db.insert(tables.project).values({
			id: "key-project",
			name: "Key Project",
			organizationId: "key-org",
		});
		await db.insert(tables.apiKey).values({
			id: "key-1",
			...hashApiKeyForStorage("vichar-test-admin-revoke-token"),
			projectId: "key-project",
			description: "Prod key",
			createdBy: "test-user-id",
		});

		const revoke = await request(
			cookie,
			"PATCH",
			"/admin/organizations/key-org/api-keys/key-1",
			{ status: "inactive" },
		);
		expect(revoke.status).toBe(200);
		expect(await revoke.json()).toEqual({
			apiKey: { id: "key-1", status: "inactive" },
		});
		const key = await db.query.apiKey.findFirst({
			where: { id: { eq: "key-1" } },
		});
		expect(key?.status).toBe("inactive");

		const audit = await db.query.auditLog.findFirst({
			where: { organizationId: { eq: "key-org" } },
		});
		expect(audit).toMatchObject({
			action: "api_key.update_status",
			resourceId: "key-1",
		});

		const wrongOrg = await request(
			cookie,
			"PATCH",
			"/admin/organizations/other-org/api-keys/key-1",
			{ status: "active" },
		);
		expect(wrongOrg.status).toBe(404);

		const reactivate = await request(
			cookie,
			"PATCH",
			"/admin/organizations/key-org/api-keys/key-1",
			{ status: "active" },
		);
		expect(reactivate.status).toBe(200);
		expect(
			(await db.query.apiKey.findFirst({ where: { id: { eq: "key-1" } } }))
				?.status,
		).toBe("active");
	});

	it("lists an organization's payment methods", async () => {
		await db.insert(tables.organization).values({
			id: "pm-org",
			name: "PM Org",
			billingEmail: "pm@example.com",
		});
		await db.insert(tables.paymentMethod).values({
			id: "pm-1",
			stripePaymentMethodId: "pm_123",
			organizationId: "pm-org",
			type: "card",
			isDefault: true,
		});

		const res = await request(
			cookie,
			"GET",
			"/admin/organizations/pm-org/payment-methods",
		);
		expect(res.status).toBe(200);
		expect((await res.json()).paymentMethods).toEqual([
			expect.objectContaining({
				id: "pm-1",
				type: "card",
				isDefault: true,
				last4: null,
			}),
		]);

		const missing = await request(
			cookie,
			"GET",
			"/admin/organizations/nope/payment-methods",
		);
		expect(missing.status).toBe(404);
	});

	it("feeds and filters the admin action log", async () => {
		await request(cookie, "POST", "/admin/users/target-user/block", {
			reason: "Spam",
		});
		await request(cookie, "POST", "/admin/users/target-user/unblock");
		await request(cookie, "DELETE", "/admin/users/target-user/sessions");

		const all = await request(cookie, "GET", "/admin/audit-logs");
		expect(all.status).toBe(200);
		const json = await all.json();
		expect(json.total).toBe(3);
		expect(json.entries[0]).toMatchObject({
			method: "DELETE",
			path: "/admin/users/target-user/sessions",
			adminEmail: "admin@example.com",
			adminRole: "admin",
			targetUserId: "target-user",
			statusCode: 200,
		});

		const posts = await request(
			cookie,
			"GET",
			"/admin/audit-logs?method=post&search=block&limit=1",
		);
		const postsJson = await posts.json();
		expect(postsJson.total).toBe(2);
		expect(postsJson.entries).toHaveLength(1);

		const future = await request(
			cookie,
			"GET",
			`/admin/audit-logs?from=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`,
		);
		expect((await future.json()).total).toBe(0);
	});
});
