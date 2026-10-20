import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiAuth } from "@/auth/config.js";
import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, eq, tables } from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

const originalAdminEmails = process.env.ADMIN_EMAILS;

// Hash of "admin@example.com1A", the password every spec account uses.
const PASSWORD_HASH =
	"c11ef27a7f9264be08db228ebb650888:a4d985a9c6bd98608237fd507534424950aa7fc255930d972242b81cbe78594f8568feb0d067e95ddf7be242ad3e9d013f695f4414fce68bfff091079f1dc460";

const HOUR = 3_600_000;
function inHours(hours: number): string {
	const offset = hours * HOUR;
	return new Date(Date.now() + offset).toISOString();
}

async function insertUser(
	id: string,
	email: string,
	values: Partial<typeof tables.user.$inferInsert> = {},
) {
	await db
		.insert(tables.user)
		.values({ id, name: id, email, emailVerified: true, ...values });
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

async function insertKey(id: string, projectId: string, createdBy: string) {
	await db.insert(tables.apiKey).values({
		id,
		...hashApiKeyForStorage(`token-${id}`),
		projectId,
		description: id,
		createdBy,
	});
}

async function keyStatus(id: string) {
	return (await db.query.apiKey.findFirst({ where: { id: { eq: id } } }))
		?.status;
}

async function getOrg(id: string) {
	return await db.query.organization.findFirst({ where: { id: { eq: id } } });
}

describe("admin account controls", () => {
	let cookie: string;

	async function call(
		method: string,
		path: string,
		body?: unknown,
		as = cookie,
	) {
		return await app.request(`/admin${path}`, {
			method,
			headers: {
				Cookie: as,
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	}

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await insertUser("owner", "owner@ctl.test");
		await insertUser("member", "member@ctl.test");
		await insertUser("outsider", "outsider@ctl.test");
		await db.insert(tables.organization).values([
			{ id: "org", name: "Ctl Org", billingEmail: "owner@ctl.test" },
			{
				id: "rich-org",
				name: "Rich Org",
				billingEmail: "owner@ctl.test",
				credits: "42.50",
			},
		]);
		await db.insert(tables.userOrganization).values([
			{ userId: "owner", organizationId: "org", role: "owner" },
			{ userId: "member", organizationId: "org", role: "admin" },
			{ userId: "owner", organizationId: "rich-org", role: "owner" },
		]);
		await db.insert(tables.project).values([
			{ id: "project", name: "Default", organizationId: "org" },
			{ id: "rich-project", name: "Default", organizationId: "rich-org" },
		]);
		await insertKey("key-owner", "project", "owner");
		await insertKey("key-member", "project", "member");
		await insertKey("key-rich", "rich-project", "owner");
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await deleteAll();
	});

	describe("organization delete", () => {
		it("soft-deletes, revokes keys and keeps members", async () => {
			const res = await call("DELETE", "/organizations/org", {
				reason: "Abuse",
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toMatchObject({
				revokedApiKeys: 2,
				forfeitedCredits: null,
			});
			expect((await getOrg("org"))?.status).toBe("deleted");
			expect(await keyStatus("key-owner")).toBe("deleted");
			expect(
				await db.query.user.findFirst({ where: { id: { eq: "member" } } }),
			).toMatchObject({ status: "active" });
			expect(
				await db.query.auditLog.findFirst({
					where: {
						organizationId: { eq: "org" },
						action: { eq: "organization.delete" },
					},
				}),
			).toBeDefined();

			const again = await call("DELETE", "/organizations/org", {
				reason: "Abuse",
			});
			expect(again.status).toBe(409);
		});

		it("requires forfeitBalance for a positive balance and zeroes it", async () => {
			const refused = await call("DELETE", "/organizations/rich-org", {
				reason: "Closed",
			});
			expect(refused.status).toBe(409);
			expect((await getOrg("rich-org"))?.status).toBe("active");

			const res = await call("DELETE", "/organizations/rich-org", {
				reason: "Closed",
				forfeitBalance: true,
			});
			expect(res.status).toBe(200);
			expect((await res.json()).forfeitedCredits).toBe("42.5");
			const org = await getOrg("rich-org");
			expect(org?.status).toBe("deleted");
			expect(Number(org?.credits)).toBe(0);
			const adjustment = await db.query.transaction.findFirst({
				where: {
					organizationId: { eq: "rich-org" },
					type: { eq: "credit_adjustment" },
				},
			});
			expect(Number(adjustment?.creditAmount)).toBe(-42.5);
			expect(adjustment?.description).toContain("Closed");
		});

		it("bulk deletes with per-id skip reasons", async () => {
			await db.insert(tables.organization).values({
				id: "admin-org",
				name: "Admin Org",
				billingEmail: "admin@example.com",
			});
			await db.insert(tables.userOrganization).values({
				userId: "test-user-id",
				organizationId: "admin-org",
				role: "owner",
			});

			const res = await call("POST", "/organizations/bulk-delete", {
				ids: ["org", "rich-org", "admin-org", "missing", "org"],
				reason: "Cleanup",
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.deleted).toEqual(["org"]);
			expect(body.skipped).toEqual([
				{ id: "rich-org", reason: expect.stringContaining("positive balance") },
				{ id: "admin-org", reason: "You are a member of this organization" },
				{ id: "missing", reason: "Organization not found" },
			]);
			const logged = await db.query.adminActionLog.findFirst({
				where: { path: { eq: "/admin/organizations/bulk-delete" } },
			});
			expect(logged?.targetOrganizationId).toBeNull();

			const tooMany = await call("POST", "/organizations/bulk-delete", {
				ids: Array.from({ length: 201 }, (_, i) => `o${i}`),
				reason: "Cleanup",
			});
			expect(tooMany.status).toBe(400);
		});

		it("restores a deleted organization without its keys", async () => {
			expect(
				(await call("POST", "/organizations/org/restore", { reason: "Oops" }))
					.status,
			).toBe(409);
			await call("DELETE", "/organizations/org", { reason: "Abuse" });
			const res = await call("POST", "/organizations/org/restore", {
				reason: "Appeal granted",
			});
			expect(res.status).toBe(200);
			expect((await getOrg("org"))?.status).toBe("active");
			expect(await keyStatus("key-owner")).toBe("deleted");
		});
	});

	it("bulk deletes users, skipping the caller, staff and unknown ids", async () => {
		await insertUser("staff", "staff@ctl.test");
		await db.insert(tables.adminMember).values({
			userId: "staff",
			role: "viewer",
		});
		const res = await call("POST", "/users/bulk-delete", {
			ids: ["outsider", "test-user-id", "staff", "nope"],
			reason: "Spam",
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.deleted).toEqual(["outsider"]);
		expect(body.skipped).toEqual([
			{ id: "test-user-id", reason: "You cannot delete yourself" },
			{
				id: "staff",
				reason: "Admins cannot be deleted. Remove their admin role first.",
			},
			{ id: "nope", reason: "User not found" },
		]);
		expect(
			await db.query.user.findFirst({ where: { id: { eq: "outsider" } } }),
		).toBeUndefined();
	});

	describe("suspension", () => {
		it("blocks a suspended user at the API until the suspension expires", async () => {
			const signedIn = await signIn("outsider@ctl.test");
			expect(signedIn.status).toBe(200);
			const userCookie = signedIn.headers.get("set-cookie")!;

			const res = await call("POST", "/users/outsider/suspend", {
				until: inHours(2),
				reason: "Chargeback review",
			});
			expect(res.status).toBe(200);

			const me = await app.request("/user/me", {
				headers: { Cookie: userCookie },
			});
			expect(me.status).toBe(403);
			const meBody = await me.json();
			expect(meBody.message).toContain("suspended until");
			expect(meBody.message).toContain("Chargeback review");
			expect(meBody.suspendedUntil).toBeTruthy();

			const login = await signIn("outsider@ctl.test");
			expect(login.status).toBe(403);
			expect((await login.json()).error).toBe("account_suspended");

			const detail = await call("GET", "/users/outsider");
			expect((await detail.json()).user).toMatchObject({
				suspendReason: "Chargeback review",
				suspendedUntil: expect.any(String),
			});

			// Expiry is read-time: a past timestamp lifts it without a cron.
			await db
				.update(tables.user)
				.set({ suspendedUntil: new Date(Date.now() - 1000) })
				.where(eq(tables.user.id, "outsider"));
			const after = await app.request("/user/me", {
				headers: { Cookie: userCookie },
			});
			expect(after.status).toBe(200);
			expect((await call("GET", "/users/outsider")).status).toBe(200);
			expect(
				(await (await call("GET", "/users/outsider")).json()).user
					.suspendedUntil,
			).toBeNull();
		});

		it("unsuspends and validates targets and times", async () => {
			await call("POST", "/users/outsider/suspend", {
				until: inHours(1),
				reason: "Review",
			});
			expect((await call("POST", "/users/outsider/unsuspend")).status).toBe(
				200,
			);
			const user = await db.query.user.findFirst({
				where: { id: { eq: "outsider" } },
			});
			expect(user?.suspendedUntil).toBeNull();

			expect(
				(
					await call("POST", "/users/test-user-id/suspend", {
						until: inHours(1),
						reason: "x",
					})
				).status,
			).toBe(400);
			expect(
				(
					await call("POST", "/users/outsider/suspend", {
						until: inHours(-1),
						reason: "x",
					})
				).status,
			).toBe(400);
			expect(
				(
					await call("POST", "/users/outsider/suspend", {
						until: inHours(24 * 400),
						reason: "x",
					})
				).status,
			).toBe(400);
		});

		it("suspends and unsuspends an organization", async () => {
			const res = await call("POST", "/organizations/org/suspend", {
				until: inHours(3),
				reason: "Payment dispute",
			});
			expect(res.status).toBe(200);
			const controls = await (
				await call("GET", "/organizations/org/controls")
			).json();
			expect(controls).toMatchObject({
				suspendReason: "Payment dispute",
				suspendedUntil: expect.any(String),
				activeApiKeys: 2,
			});

			expect((await call("POST", "/organizations/org/unsuspend")).status).toBe(
				200,
			);
			expect((await getOrg("org"))?.suspendedUntil).toBeNull();
		});
	});

	describe("lockdown", () => {
		it("revokes a user's sessions and keys and optionally suspends", async () => {
			expect((await signIn("owner@ctl.test")).status).toBe(200);
			expect((await signIn("owner@ctl.test")).status).toBe(200);

			const res = await call("POST", "/users/owner/lockdown", {
				reason: "Compromised",
				suspendUntil: inHours(1),
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toMatchObject({
				sessionsRevoked: 2,
				apiKeysDeactivated: 2,
				suspendedUntil: expect.any(String),
			});
			expect(await keyStatus("key-owner")).toBe("inactive");
			expect(await keyStatus("key-rich")).toBe("inactive");
			expect(await keyStatus("key-member")).toBe("active");

			expect(
				(await call("POST", "/users/test-user-id/lockdown", { reason: "x" }))
					.status,
			).toBe(400);
		});

		it("revokes org keys and member sessions, sparing staff", async () => {
			await db.insert(tables.userOrganization).values({
				userId: "test-user-id",
				organizationId: "org",
				role: "developer",
			});
			expect((await signIn("member@ctl.test")).status).toBe(200);

			const res = await call("POST", "/organizations/org/lockdown", {
				reason: "Leaked keys",
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				apiKeysDeactivated: 2,
				sessionsRevoked: 1,
				membersSignedOut: 2,
				staffMembersSkipped: 1,
				suspendedUntil: null,
			});
			expect(await keyStatus("key-member")).toBe("inactive");
			expect(await keyStatus("key-rich")).toBe("active");
			// The acting admin's own session survives.
			expect((await call("GET", "/organizations/org/controls")).status).toBe(
				200,
			);
		});
	});

	describe("membership", () => {
		it("adds an existing verified user", async () => {
			const res = await call("POST", "/organizations/org/members", {
				email: "OUTSIDER@ctl.test",
				role: "admin",
			});
			expect(res.status).toBe(200);
			expect(
				await db.query.userOrganization.findFirst({
					where: { userId: { eq: "outsider" }, organizationId: { eq: "org" } },
				}),
			).toMatchObject({ role: "admin" });

			expect(
				(
					await call("POST", "/organizations/org/members", {
						email: "outsider@ctl.test",
						role: "admin",
					})
				).status,
			).toBe(409);
			expect(
				(
					await call("POST", "/organizations/org/members", {
						email: "ghost@ctl.test",
						role: "admin",
					})
				).status,
			).toBe(404);
		});

		it("refuses unverified users and full organizations", async () => {
			await insertUser("unverified", "unverified@ctl.test", {
				emailVerified: false,
			});
			expect(
				(
					await call("POST", "/organizations/org/members", {
						email: "unverified@ctl.test",
						role: "admin",
					})
				).status,
			).toBe(400);

			await db
				.update(tables.organization)
				.set({ seats: 2 })
				.where(eq(tables.organization.id, "org"));
			const full = await call("POST", "/organizations/org/members", {
				email: "outsider@ctl.test",
				role: "admin",
			});
			expect(full.status).toBe(409);
			expect((await full.json()).message).toContain("seat limit");
		});

		it("transfers ownership and demotes the previous owner", async () => {
			const res = await call("POST", "/organizations/org/transfer-ownership", {
				userId: "member",
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				ownerUserId: "member",
				demotedUserIds: ["owner"],
			});
			const roles = await db.query.userOrganization.findMany({
				where: { organizationId: { eq: "org" } },
				columns: { userId: true, role: true },
			});
			expect(Object.fromEntries(roles.map((r) => [r.userId, r.role]))).toEqual({
				owner: "admin",
				member: "owner",
			});

			expect(
				(
					await call("POST", "/organizations/org/transfer-ownership", {
						userId: "outsider",
					})
				).status,
			).toBe(404);
			expect(
				(
					await call("POST", "/organizations/org/transfer-ownership", {
						userId: "member",
					})
				).status,
			).toBe(400);
		});
	});

	describe("boost", () => {
		it("sets, reports and clears a temporary trust tier", async () => {
			const until = inHours(48);
			const res = await call("POST", "/organizations/org/boost", {
				trustTier: 3,
				until,
				reason: "Launch week",
			});
			expect(res.status).toBe(200);
			const org = await getOrg("org");
			expect(org?.trustTierOverride).toBe(3);
			expect(org?.trustTierOverrideUntil?.toISOString()).toBe(until);

			const controls = await (
				await call("GET", "/organizations/org/controls")
			).json();
			expect(controls.boost).toEqual({ trustTier: 3, until });
			const detail = await (await call("GET", "/organizations/org")).json();
			expect(detail.trustTier).toMatchObject({ tier: 3, overridden: true });

			expect((await call("DELETE", "/organizations/org/boost")).status).toBe(
				200,
			);
			expect((await getOrg("org"))?.trustTierOverride).toBeNull();
			expect((await call("DELETE", "/organizations/org/boost")).status).toBe(
				409,
			);
		});

		it("stops applying once expired", async () => {
			await db
				.update(tables.organization)
				.set({
					trustTierOverride: 4,
					trustTierOverrideUntil: new Date(Date.now() - 1000),
				})
				.where(eq(tables.organization.id, "org"));
			const detail = await (await call("GET", "/organizations/org")).json();
			expect(detail.trustTier.overridden).toBe(false);
			const controls = await (
				await call("GET", "/organizations/org/controls")
			).json();
			expect(controls.boost).toBeNull();
		});
	});

	describe("resend verification", () => {
		it("refuses verified users and deployments without verification email", async () => {
			expect(
				(await call("POST", "/users/outsider/resend-verification")).status,
			).toBe(400);
			await insertUser("pending", "pending@ctl.test", {
				emailVerified: false,
			});
			const disabled = await call("POST", "/users/pending/resend-verification");
			expect(disabled.status).toBe(400);
			expect((await disabled.json()).message).toContain("disabled");
		});

		it("sends through better-auth when enabled", async () => {
			await insertUser("pending", "pending@ctl.test", {
				emailVerified: false,
			});
			const options = apiAuth.options.emailVerification;
			const original = options?.sendVerificationEmail;
			const send = vi
				.spyOn(apiAuth.api, "sendVerificationEmail")
				.mockResolvedValue({ status: true });
			if (options) {
				options.sendVerificationEmail = async () => {};
			}
			try {
				const res = await call("POST", "/users/pending/resend-verification");
				expect(res.status).toBe(200);
				expect(send).toHaveBeenCalledWith({
					body: expect.objectContaining({ email: "pending@ctl.test" }),
				});
			} finally {
				if (options) {
					options.sendVerificationEmail = original;
				}
			}
		});
	});

	describe("request lookup", () => {
		async function insertLog(
			id: string,
			organizationId: string,
			values: Partial<typeof tables.log.$inferInsert> = {},
		) {
			await db.insert(tables.log).values({
				id,
				requestId: "req-123",
				organizationId,
				projectId: organizationId === "org" ? "project" : "rich-project",
				apiKeyId: organizationId === "org" ? "key-owner" : "key-rich",
				duration: 420,
				requestedModel: "gpt-4o-mini",
				usedModel: "openai/gpt-4o-mini",
				usedProvider: "openai",
				responseSize: 10,
				mode: "credits",
				usedMode: "credits",
				content: "hello",
				messages: [{ role: "user", content: "hi" }],
				...values,
			});
		}

		it("returns the final attempt with names and hides unretained payloads", async () => {
			await insertLog("log-1", "org", {
				createdAt: new Date(Date.now() - 1000),
				retried: true,
				hasError: true,
				unifiedFinishReason: "upstream_error",
				usedProvider: "groq",
			});
			await insertLog("log-2", "org", { cost: 0.0012 });

			const res = await call("GET", "/requests/req-123");
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.request).toMatchObject({
				id: "log-2",
				organization: { id: "org", name: "Ctl Org", retentionLevel: "none" },
				project: { id: "project", name: "Default" },
				apiKey: { id: "key-owner", description: "key-owner" },
				usedProvider: "openai",
				cost: 0.0012,
				payloadRetained: false,
				payload: null,
			});
			expect(body.attempts.map((a: { id: string }) => a.id)).toEqual([
				"log-2",
				"log-1",
			]);

			expect((await call("GET", "/requests/unknown")).status).toBe(404);
		});

		it("includes the payload when the organization retains it", async () => {
			await db
				.update(tables.organization)
				.set({ retentionLevel: "retain" })
				.where(eq(tables.organization.id, "org"));
			await insertLog("log-3", "org");
			const body = await (await call("GET", "/requests/req-123")).json();
			expect(body.request.payloadRetained).toBe(true);
			expect(body.request.payload).toEqual({
				messages: [{ role: "user", content: "hi" }],
				content: "hello",
				reasoningContent: null,
			});
		});
	});

	describe("role policy", () => {
		it("lets support resend verification but not suspend or delete", async () => {
			await insertUser("support", "support@ctl.test");
			await db.insert(tables.adminMember).values({
				userId: "support",
				role: "support",
			});
			await insertUser("pending", "pending@ctl.test", {
				emailVerified: false,
			});
			const supportCookie = (await signIn("support@ctl.test")).headers.get(
				"set-cookie",
			)!;

			const resend = await call(
				"POST",
				"/users/pending/resend-verification",
				undefined,
				supportCookie,
			);
			// Allowed by policy; refused only because this deployment sends none.
			expect(resend.status).toBe(400);
			for (const [method, path, body] of [
				["POST", "/users/outsider/suspend", { until: inHours(1), reason: "x" }],
				["POST", "/users/outsider/lockdown", { reason: "x" }],
				["DELETE", "/organizations/org", { reason: "x" }],
				["POST", "/organizations/bulk-delete", { ids: ["org"], reason: "x" }],
				[
					"POST",
					"/organizations/org/boost",
					{ trustTier: 1, until: inHours(1), reason: "x" },
				],
			] as const) {
				expect(
					(await call(method, path, body, supportCookie)).status,
					`${method} ${path}`,
				).toBe(403);
			}
			const lookup = await call(
				"GET",
				"/requests/unknown",
				undefined,
				supportCookie,
			);
			expect(lookup.status).toBe(404);
		});
	});
});
