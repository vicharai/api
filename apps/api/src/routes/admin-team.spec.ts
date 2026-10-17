import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, eq, tables } from "@llmgateway/db";

const originalAdminEmails = process.env.ADMIN_EMAILS;

const PASSWORD_HASH =
	"c11ef27a7f9264be08db228ebb650888:a4d985a9c6bd98608237fd507534424950aa7fc255930d972242b81cbe78594f8568feb0d067e95ddf7be242ad3e9d013f695f4414fce68bfff091079f1dc460";

async function insertUser(id: string, email: string, emailVerified = true) {
	await db.insert(tables.user).values({ id, name: id, email, emailVerified });
	await db.insert(tables.account).values({
		id: `${id}-account`,
		providerId: "credential",
		accountId: `${id}-account`,
		userId: id,
		password: PASSWORD_HASH,
	});
}

async function signIn(email: string): Promise<string> {
	const res = await app.request("/auth/sign-in/email", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password: "admin@example.com1A" }),
	});
	expect(res.status).toBe(200);
	return res.headers.get("set-cookie")!;
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

describe("admin team and roles", () => {
	let cookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await insertUser("staff-user", "staff@example.com");
		await insertUser("customer-user", "customer@example.com");
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await deleteAll();
	});

	it("grants, changes and revokes roles", async () => {
		const grant = await request(cookie, "POST", "/admin/team", {
			email: "STAFF@example.com",
			role: "support",
		});
		expect(grant.status).toBe(200);
		expect((await grant.json()).member).toMatchObject({
			userId: "staff-user",
			email: "staff@example.com",
			role: "support",
			isOwner: false,
		});

		const list = await request(cookie, "GET", "/admin/team");
		expect(list.status).toBe(200);
		expect((await list.json()).members).toEqual([
			expect.objectContaining({
				userId: "test-user-id",
				role: "admin",
				isOwner: true,
				createdAt: null,
			}),
			expect.objectContaining({ userId: "staff-user", role: "support" }),
		]);

		const patch = await request(cookie, "PATCH", "/admin/team/staff-user", {
			role: "viewer",
		});
		expect(patch.status).toBe(200);
		expect((await patch.json()).member.role).toBe("viewer");

		const remove = await request(cookie, "DELETE", "/admin/team/staff-user");
		expect(remove.status).toBe(200);
		expect(
			await db.query.adminMember.findFirst({
				where: { userId: { eq: "staff-user" } },
			}),
		).toBeUndefined();

		const removeAgain = await request(
			cookie,
			"DELETE",
			"/admin/team/staff-user",
		);
		expect(removeAgain.status).toBe(404);
	});

	it("validates the grantee", async () => {
		await insertUser("unverified-user", "unverified@example.com", false);

		const unknown = await request(cookie, "POST", "/admin/team", {
			email: "nobody@example.com",
			role: "viewer",
		});
		expect(unknown.status).toBe(404);

		const unverified = await request(cookie, "POST", "/admin/team", {
			email: "unverified@example.com",
			role: "viewer",
		});
		expect(unverified.status).toBe(400);

		const owner = await request(cookie, "POST", "/admin/team", {
			email: "admin@example.com",
			role: "viewer",
		});
		expect(owner.status).toBe(409);
	});

	it("keeps ADMIN_EMAILS owners immutable", async () => {
		const patch = await request(cookie, "PATCH", "/admin/team/test-user-id", {
			role: "viewer",
		});
		expect(patch.status).toBe(400);

		const remove = await request(cookie, "DELETE", "/admin/team/test-user-id");
		expect(remove.status).toBe(400);
	});

	it("limits a viewer to non-revenue reads", async () => {
		await db
			.insert(tables.adminMember)
			.values({ userId: "staff-user", role: "viewer" });
		const staff = await signIn("staff@example.com");

		const me = await request(staff, "GET", "/user/me");
		expect((await me.json()).user).toMatchObject({
			isAdmin: true,
			adminRole: "viewer",
		});

		expect(
			(await request(staff, "GET", "/admin/users/customer-user")).status,
		).toBe(200);
		expect((await request(staff, "GET", "/admin/metrics")).status).toBe(403);
		expect((await request(staff, "GET", "/admin/team")).status).toBe(403);

		const verify = await request(
			staff,
			"POST",
			"/admin/users/customer-user/verify-email",
			{ reason: "Confirmed by phone" },
		);
		expect(verify.status).toBe(403);
	});

	it("lets support run allowlisted mutations only", async () => {
		await db
			.insert(tables.adminMember)
			.values({ userId: "staff-user", role: "support" });
		await db
			.update(tables.user)
			.set({ emailVerified: false })
			.where(eq(tables.user.id, "customer-user"));
		const staff = await signIn("staff@example.com");

		const verify = await request(
			staff,
			"POST",
			"/admin/users/customer-user/verify-email",
			{ reason: "Confirmed by phone" },
		);
		expect(verify.status).toBe(200);

		const block = await request(
			staff,
			"POST",
			"/admin/users/customer-user/block",
			{ reason: "Abuse" },
		);
		expect(block.status).toBe(403);
		const customer = await db.query.user.findFirst({
			where: { id: { eq: "customer-user" } },
		});
		expect(customer?.status).toBe("active");

		const grant = await request(staff, "POST", "/admin/team", {
			email: "customer@example.com",
			role: "admin",
		});
		expect(grant.status).toBe(403);
	});

	it("revoking a role removes admin access", async () => {
		await db
			.insert(tables.adminMember)
			.values({ userId: "staff-user", role: "admin" });
		const staff = await signIn("staff@example.com");
		expect((await request(staff, "GET", "/admin/team")).status).toBe(200);

		await request(cookie, "DELETE", "/admin/team/staff-user");
		expect(
			(await request(staff, "GET", "/admin/users/customer-user")).status,
		).toBe(403);
		expect(
			(await (await request(staff, "GET", "/user/me")).json()).user,
		).toMatchObject({
			isAdmin: false,
			adminRole: null,
		});
	});
});
