import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, eq, tables } from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

const originalAdminEmails = process.env.ADMIN_EMAILS;

describe("admin user and organization management", () => {
	let cookie: string;

	async function call(method: string, path: string, body?: unknown) {
		return await app.request(`/admin${path}`, {
			method,
			headers: {
				Cookie: cookie,
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	}

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await db.insert(tables.user).values([
			{
				id: "mgmt-owner",
				name: "Owner",
				email: "owner@mgmt.test",
				emailVerified: true,
			},
			{
				id: "mgmt-member",
				name: "Member",
				email: "member@mgmt.test",
				emailVerified: true,
			},
		]);
		await db.insert(tables.organization).values([
			{ id: "mgmt-org", name: "Mgmt Org", billingEmail: "owner@mgmt.test" },
			{
				id: "mgmt-solo-org",
				name: "Member Solo",
				billingEmail: "member@mgmt.test",
			},
		]);
		await db.insert(tables.userOrganization).values([
			{ userId: "mgmt-owner", organizationId: "mgmt-org", role: "owner" },
			{ userId: "mgmt-member", organizationId: "mgmt-org", role: "developer" },
			{
				userId: "mgmt-member",
				organizationId: "mgmt-solo-org",
				role: "owner",
			},
		]);
		await db.insert(tables.project).values({
			id: "mgmt-project",
			name: "Default Project",
			organizationId: "mgmt-org",
		});
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await deleteAll();
	});

	it("rejects non-admins", async () => {
		process.env.ADMIN_EMAILS = "someone-else@example.com";
		expect((await call("DELETE", "/users/mgmt-member/passkeys")).status).toBe(
			403,
		);
	});

	it("changes a user's email", async () => {
		const res = await call("PATCH", "/users/mgmt-member/email", {
			email: "New@Mgmt.test",
		});
		expect(res.status).toBe(200);
		expect((await res.json()).user).toEqual({
			id: "mgmt-member",
			email: "new@mgmt.test",
			emailVerified: false,
		});

		const verified = await call("PATCH", "/users/mgmt-member/email", {
			email: "member2@mgmt.test",
			markVerified: true,
		});
		expect((await verified.json()).user.emailVerified).toBe(true);

		expect(
			(
				await call("PATCH", "/users/mgmt-member/email", {
					email: "owner@mgmt.test",
				})
			).status,
		).toBe(409);
		expect(
			(
				await call("PATCH", "/users/test-user-id/email", {
					email: "x@mgmt.test",
				})
			).status,
		).toBe(400);
	});

	it("sends a password reset and removes passkeys", async () => {
		const reset = await call("POST", "/users/mgmt-member/password-reset");
		expect(reset.status).toBe(200);
		expect(await reset.json()).toEqual({ sent: true });

		await db.insert(tables.passkey).values([
			{
				userId: "mgmt-member",
				publicKey: "pk-1",
				credentialID: "cred-1",
				counter: 0,
			},
			{
				userId: "mgmt-member",
				publicKey: "pk-2",
				credentialID: "cred-2",
				counter: 0,
			},
		]);
		const removed = await call("DELETE", "/users/mgmt-member/passkeys");
		expect(await removed.json()).toEqual({ deleted: 2 });
	});

	it("deletes a user and closes their sole-member orgs", async () => {
		expect(
			(await call("DELETE", "/users/test-user-id", { reason: "x" })).status,
		).toBe(400);

		const res = await call("DELETE", "/users/mgmt-member", {
			reason: "Fraud",
		});
		expect(res.status).toBe(200);
		expect(
			await db.query.user.findFirst({ where: { id: { eq: "mgmt-member" } } }),
		).toBeUndefined();
		const solo = await db.query.organization.findFirst({
			where: { id: { eq: "mgmt-solo-org" } },
		});
		expect(solo?.status).toBe("deleted");
		const shared = await db.query.organization.findFirst({
			where: { id: { eq: "mgmt-org" } },
		});
		expect(shared?.status).not.toBe("deleted");
	});

	it("changes member roles and removes members, keeping an owner", async () => {
		const promoted = await call(
			"PATCH",
			"/organizations/mgmt-org/members/mgmt-member",
			{ role: "admin" },
		);
		expect((await promoted.json()).member).toEqual({
			userId: "mgmt-member",
			role: "admin",
		});
		expect(
			(
				await call("PATCH", "/organizations/mgmt-org/members/mgmt-owner", {
					role: "developer",
				})
			).status,
		).toBe(400);
		expect(
			(await call("DELETE", "/organizations/mgmt-org/members/mgmt-owner"))
				.status,
		).toBe(400);

		expect(
			(await call("DELETE", "/organizations/mgmt-org/members/mgmt-member"))
				.status,
		).toBe(200);
		expect(
			(await call("DELETE", "/organizations/mgmt-org/members/mgmt-member"))
				.status,
		).toBe(404);

		const audit = await db
			.select()
			.from(tables.auditLog)
			.where(eq(tables.auditLog.organizationId, "mgmt-org"));
		expect(audit.map((a) => a.action).sort()).toEqual([
			"team_member.remove",
			"team_member.update",
		]);
	});

	it("creates an organization for a user", async () => {
		const res = await call("POST", "/organizations", {
			name: "Fresh Org",
			ownerEmail: "Member@mgmt.test",
		});
		expect(res.status).toBe(200);
		const { organization } = await res.json();
		expect(organization.name).toBe("Fresh Org");
		const membership = await db.query.userOrganization.findFirst({
			where: { organizationId: { eq: organization.id } },
		});
		expect(membership).toMatchObject({ userId: "mgmt-member", role: "owner" });
		const project = await db.query.project.findFirst({
			where: { organizationId: { eq: organization.id } },
		});
		expect(project?.name).toBe("Default Project");

		expect(
			(
				await call("POST", "/organizations", {
					name: "Ghost",
					ownerEmail: "nobody@mgmt.test",
				})
			).status,
		).toBe(404);
	});

	it("creates an org API key owned by the org owner", async () => {
		const res = await call("POST", "/organizations/mgmt-org/api-keys", {
			description: "Issued by support",
			usageLimit: "25",
		});
		expect(res.status).toBe(200);
		const { apiKey } = await res.json();
		expect(apiKey).toMatchObject({
			description: "Issued by support",
			projectId: "mgmt-project",
		});
		expect(apiKey.token.length).toBeGreaterThan(20);

		const stored = await db.query.apiKey.findFirst({
			where: { id: { eq: apiKey.id } },
		});
		expect(stored).toMatchObject({
			createdBy: "mgmt-owner",
			usageLimit: "25",
			tokenHash: hashApiKeyForStorage(apiKey.token).tokenHash,
		});

		expect(
			(
				await call("POST", "/organizations/mgmt-org/api-keys", {
					description: "x",
					projectId: "other-project",
				})
			).status,
		).toBe(404);
	});
});
