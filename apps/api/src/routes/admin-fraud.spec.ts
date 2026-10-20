import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { FRAUD_SCORE_CACHE_KEY } from "@llmgateway/actions";
import { redisClient } from "@llmgateway/cache";
import {
	clearPlatformConfigMemo,
	db,
	eq,
	mergeStoredPlatformConfig,
	tables,
} from "@llmgateway/db";

const originalAdminEmails = process.env.ADMIN_EMAILS;
const DAY_MS = 86_400_000;

function daysAgo(days: number): Date {
	const offsetMs = days * DAY_MS;
	return new Date(Date.now() - offsetMs);
}

async function seedUser(
	id: string,
	email: string,
	extra: Partial<typeof tables.user.$inferInsert> = {},
) {
	await db.insert(tables.user).values({ id, email, ...extra });
}

async function seedOrg(
	id: string,
	members: string[],
	extra: Partial<typeof tables.organization.$inferInsert> = {},
) {
	await db.insert(tables.organization).values({
		id,
		name: `Org ${id}`,
		billingEmail: `${id}@fraud.test`,
		...extra,
	});
	for (const userId of members) {
		await db
			.insert(tables.userOrganization)
			.values({ userId, organizationId: id });
	}
}

let sessionCounter = 0;
async function seedSession(
	userId: string,
	ipAddress: string,
	createdAt?: Date,
) {
	sessionCounter++;
	await db.insert(tables.session).values({
		token: `fraud-session-${sessionCounter}`,
		userId,
		ipAddress,
		...(createdAt ? { createdAt } : {}),
	});
}

describe("admin fraud center", () => {
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

	async function asRole(role: "support" | "viewer") {
		await db
			.insert(tables.adminMember)
			.values({ userId: "test-user-id", role });
		process.env.ADMIN_EMAILS = "someone-else@example.com";
	}

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await redisClient.del(FRAUD_SCORE_CACHE_KEY);
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await redisClient.del(FRAUD_SCORE_CACHE_KEY);
		await deleteAll();
	});

	describe("linked accounts", () => {
		beforeEach(async () => {
			await seedUser("target", "target@acme-corp.test");
			await seedUser("ip-peer", "peer@elsewhere.test");
			await seedUser("domain-peer", "colleague@acme-corp.test");
			await seedUser("card-peer", "card@other.test");
			await seedUser("gmail-a", "a@gmail.com");
			await seedUser("gmail-b", "b@gmail.com");
			await seedUser("stranger", "stranger@nowhere.test");
			await seedSession("target", "203.0.113.10");
			await seedSession("ip-peer", "203.0.113.10");
			await seedSession("stranger", "198.51.100.200");
			// Older than the 90-day link window, but the stranger's signup IP.
			await seedSession("stranger", "203.0.113.10", daysAgo(120));
			await seedOrg("target-org", ["target"], {
				devPlanCardFingerprint: "fp_shared",
			});
			await seedOrg("card-org", ["card-peer"], {
				chatPlanCardFingerprint: "fp_shared",
			});
		});

		it("links by session IP, signup IP, card fingerprint and domain", async () => {
			const res = await call("GET", "/fraud/users/target/links");
			expect(res.status).toBe(200);
			const body = await res.json();
			const byUser = Object.fromEntries(
				body.links.map((l: { userId: string }) => [l.userId, l]),
			);
			expect(Object.keys(byUser).sort()).toEqual([
				"card-peer",
				"domain-peer",
				"ip-peer",
				"stranger",
			]);
			expect(byUser["ip-peer"].strength).toBe("strong");
			// Its shared session is outside the window; only signup IP remains.
			expect(
				byUser.stranger.links.map((l: { type: string }) => l.type),
			).toEqual(["signup_ip"]);
			expect(
				byUser["ip-peer"].links.map((l: { type: string }) => l.type).sort(),
			).toEqual(["shared_ip", "signup_ip"]);
			expect(byUser["card-peer"].links[0]).toMatchObject({
				type: "payment_fingerprint",
				strength: "strong",
			});
			expect(byUser["domain-peer"]).toMatchObject({
				strength: "weak",
				links: [{ type: "email_domain", detail: "acme-corp.test" }],
			});
			expect(body.score.subjectId).toBe("target");
			expect(body.score.signals.map((s: { key: string }) => s.key)).toContain(
				"linked_accounts",
			);
		});

		it("ignores shared webmail domains and 404s unknown users", async () => {
			const res = await call("GET", "/fraud/users/gmail-a/links");
			expect((await res.json()).links).toEqual([]);
			expect((await call("GET", "/fraud/users/nope/links")).status).toBe(404);
		});

		it("lists IP clusters and marks blocked IPs", async () => {
			await seedSession("domain-peer", "203.0.113.10");
			await mergeStoredPlatformConfig({
				"abuse.blockedIps": ["203.0.113.0/24"],
			});
			const res = await call("GET", "/fraud/clusters?minAccounts=3");
			expect(res.status).toBe(200);
			const { clusters } = await res.json();
			expect(clusters).toHaveLength(1);
			expect(clusters[0]).toMatchObject({
				ipAddress: "203.0.113.10",
				accounts: 3,
				blocked: true,
			});
			expect(clusters[0].users.map((u: { id: string }) => u.id).sort()).toEqual(
				["domain-peer", "ip-peer", "target"],
			);
		});
	});

	describe("review queue", () => {
		it("ranks users by score with the signal breakdown", async () => {
			await seedUser("risky", "risky@mailinator.com", {
				riskStatus: "flagged",
				riskFlagSource: "signup",
			});
			await seedUser("calm", "calm@company.test", {
				createdAt: daysAgo(20),
			});
			await seedOrg("risky-org", ["risky"]);
			await db.insert(tables.orgLimitHitDaily).values({
				organizationId: "risky-org",
				day: new Date(),
				limitType: "topup_velocity",
				hitCount: 2,
			});
			await db.insert(tables.transaction).values({
				organizationId: "risky-org",
				type: "credit_topup",
				amount: "50",
				creditAmount: "50",
				disputedAt: new Date(),
			});

			const res = await call(
				"GET",
				"/fraud/review-queue?minScore=0&refresh=true",
			);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.entries[0]).toMatchObject({
				subjectType: "user",
				subjectId: "risky",
				score: 100,
			});
			expect(
				body.entries[0].signals.map((s: { key: string }) => s.key).sort(),
			).toEqual([
				"abuse_ip",
				"disposable_email",
				"disputes",
				"new_account",
				"new_account",
				"topup_velocity",
			]);
			expect(
				body.entries.some((e: { subjectId: string }) => e.subjectId === "calm"),
			).toBe(false);

			const orgs = await (
				await call("GET", "/fraud/review-queue?subjectType=org&minScore=50")
			).json();
			expect(
				orgs.entries.map((e: { subjectId: string }) => e.subjectId),
			).toEqual(["risky-org"]);
			expect(orgs.computedAt).toBe(body.computedAt);
		});

		it("respects the disposable allowlist", async () => {
			await seedUser("listed", "x@mailinator.com");
			await mergeStoredPlatformConfig({
				"abuse.disposableEmailAllowlist": ["mailinator.com"],
			});
			const body = await (
				await call("GET", "/fraud/review-queue?minScore=0&refresh=true")
			).json();
			const entry = body.entries.find(
				(e: { subjectId: string }) => e.subjectId === "listed",
			);
			expect(entry.signals.map((s: { key: string }) => s.key)).toEqual([
				"new_account",
			]);
		});
	});

	describe("rules and events", () => {
		it("validates, previews, updates and deletes rules", async () => {
			const types = await (await call("GET", "/fraud/rule-types")).json();
			expect(types.types).toHaveLength(6);

			const bad = await call("POST", "/fraud/rules", {
				name: "Bad",
				type: "api_key_burst",
				params: { minKeys: 1 },
				action: "flag",
			});
			expect(bad.status).toBe(400);
			const unknown = await call("POST", "/fraud/rules", {
				name: "Bad",
				type: "api_key_burst",
				params: { bogus: 3 },
				action: "flag",
			});
			expect(unknown.status).toBe(400);

			const created = await call("POST", "/fraud/rules", {
				name: "Topup abuse",
				type: "topup_velocity",
				params: { minHits: 2 },
				action: "notify",
			});
			expect(created.status).toBe(200);
			const rule = await created.json();
			expect(rule.params).toEqual({ windowDays: 1, minHits: 2 });

			await seedOrg("velocity-org", []);
			await db.insert(tables.orgLimitHitDaily).values({
				organizationId: "velocity-org",
				day: new Date(),
				limitType: "topup_velocity",
				hitCount: 5,
			});
			const preview = await (
				await call("GET", `/fraud/rules/${rule.id}/preview`)
			).json();
			expect(preview.matches).toEqual([
				expect.objectContaining({
					subjectType: "org",
					subjectId: "velocity-org",
				}),
			]);
			expect(await db.$count(tables.fraudEvent)).toBe(0);

			const updated = await (
				await call("PATCH", `/fraud/rules/${rule.id}`, {
					enabled: false,
					params: { minHits: 10 },
				})
			).json();
			expect(updated).toMatchObject({
				enabled: false,
				params: { windowDays: 1, minHits: 10 },
			});
			expect((await call("DELETE", `/fraud/rules/${rule.id}`)).status).toBe(
				200,
			);
			expect((await call("GET", "/fraud/rules")).status).toBe(200);
			expect((await call("DELETE", `/fraud/rules/${rule.id}`)).status).toBe(
				404,
			);
		});

		it("lists and resolves events, clearing the flag on request", async () => {
			await seedOrg("event-org", [], { riskFlagged: true });
			await seedUser("event-user", "event@fraud.test", {
				riskStatus: "flagged",
				riskFlagSource: "fraud_rule",
			});
			const [orgEvent, userEvent] = await db
				.insert(tables.fraudEvent)
				.values([
					{
						ruleType: "content_filter_abuse",
						subjectType: "org",
						subjectId: "event-org",
						actionTaken: "flagged",
						details: { violations: 40 },
					},
					{
						ruleType: "signup_burst_same_ip",
						subjectType: "user",
						subjectId: "event-user",
						actionTaken: "flagged",
					},
				])
				.returning();

			const open = await (await call("GET", "/fraud/events")).json();
			expect(open.openCount).toBe(2);
			expect(
				open.events.map((e: { subjectLabel: string }) => e.subjectLabel).sort(),
			).toEqual(["Org event-org", "event@fraud.test"]);

			const resolve = await call(
				"POST",
				`/fraud/events/${orgEvent.id}/resolve`,
				{ note: "Verified customer", clearFlag: true },
			);
			expect(resolve.status).toBe(200);
			const org = await db.query.organization.findFirst({
				where: { id: { eq: "event-org" } },
			});
			expect(org?.riskFlagged).toBe(false);
			expect(
				(
					await call("POST", `/fraud/events/${orgEvent.id}/resolve`, {
						note: "again",
					})
				).status,
			).toBe(409);

			await call("POST", `/fraud/events/${userEvent.id}/resolve`, {
				note: "Legit signup",
				clearFlag: true,
			});
			const user = await db.query.user.findFirst({
				where: { id: { eq: "event-user" } },
			});
			expect(user?.riskStatus).toBe("approved");

			const resolved = await (
				await call("GET", "/fraud/events?status=resolved")
			).json();
			expect(resolved.events[0]).toMatchObject({
				resolvedByEmail: "admin@example.com",
			});
			expect(resolved.openCount).toBe(0);
		});

		it("lifts a rule suspension on resolve, admins only", async () => {
			await seedOrg("suspended-org", [], {
				suspendedUntil: new Date(Date.now() + DAY_MS),
				suspendReason: "Fraud rule: test",
			});
			const [event] = await db
				.insert(tables.fraudEvent)
				.values({
					ruleType: "signup_burst_same_ip",
					subjectType: "user",
					subjectId: "nobody",
					actionTaken: "suspended",
					details: { suspendedOrganizationIds: ["suspended-org"] },
				})
				.returning();

			await asRole("support");
			const denied = await call("POST", `/fraud/events/${event.id}/resolve`, {
				note: "legit",
				clearFlag: true,
			});
			expect(denied.status).toBe(403);

			await db.delete(tables.adminMember);
			process.env.ADMIN_EMAILS = "admin@example.com";
			const ok = await call("POST", `/fraud/events/${event.id}/resolve`, {
				note: "legit",
				clearFlag: true,
			});
			expect(ok.status).toBe(200);
			const org = await db.query.organization.findFirst({
				where: { id: { eq: "suspended-org" } },
			});
			expect(org).toMatchObject({ suspendedUntil: null, suspendReason: null });
		});
	});

	describe("disputes", () => {
		beforeEach(async () => {
			await seedOrg("dispute-org", [], { credits: "30" });
			await db.insert(tables.transaction).values([
				{
					id: "txn-topup",
					organizationId: "dispute-org",
					type: "credit_topup",
					amount: "52.5",
					creditAmount: "50",
				},
				{
					id: "txn-gift",
					organizationId: "dispute-org",
					type: "credit_gift",
					creditAmount: "10",
				},
			]);
		});

		it("marks the payment disputed and claws back credits", async () => {
			const res = await call(
				"POST",
				"/organizations/dispute-org/transactions/txn-topup/dispute",
				{ reason: "Card issuer chargeback", clawback: true },
			);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toMatchObject({ balance: -20, organizationFlagged: true });

			const txn = await db.query.transaction.findFirst({
				where: { id: { eq: "txn-topup" } },
			});
			expect(txn?.disputeReason).toBe("Card issuer chargeback");
			const adjustment = await db.query.transaction.findFirst({
				where: { id: { eq: body.clawbackTransactionId } },
			});
			expect(adjustment).toMatchObject({
				type: "credit_adjustment",
				creditAmount: "-50",
				relatedTransactionId: "txn-topup",
			});
			const org = await db.query.organization.findFirst({
				where: { id: { eq: "dispute-org" } },
			});
			expect(org).toMatchObject({ credits: "-20", riskFlagged: true });

			const listed = await (
				await call("GET", "/organizations/dispute-org/transactions")
			).json();
			expect(
				listed.transactions.find((t: { id: string }) => t.id === "txn-topup")
					.disputeReason,
			).toBe("Card issuer chargeback");

			expect(
				(
					await call(
						"POST",
						"/organizations/dispute-org/transactions/txn-topup/dispute",
						{ reason: "again", clawback: false },
					)
				).status,
			).toBe(409);
		});

		it("rejects non-payments and leaves credits without clawback", async () => {
			expect(
				(
					await call(
						"POST",
						"/organizations/dispute-org/transactions/txn-gift/dispute",
						{ reason: "Not a payment" },
					)
				).status,
			).toBe(400);
			const res = await call(
				"POST",
				"/organizations/dispute-org/transactions/txn-topup/dispute",
				{ reason: "Inquiry only" },
			);
			expect(await res.json()).toMatchObject({
				clawbackTransactionId: null,
				organizationFlagged: false,
			});
			const org = await db.query.organization.findFirst({
				where: { id: { eq: "dispute-org" } },
			});
			expect(org).toMatchObject({ credits: "30", riskFlagged: false });
		});
	});

	describe("role policy", () => {
		async function seedEvent(subjectType: "user" | "org") {
			const [event] = await db
				.insert(tables.fraudEvent)
				.values({
					ruleType: "api_key_burst",
					subjectType,
					subjectId: "subject",
					actionTaken: "notified",
				})
				.returning();
			return event.id;
		}

		it("lets support read and resolve but not write rules or dispute", async () => {
			const eventId = await seedEvent("org");
			const orgEventId = await seedEvent("org");
			await asRole("support");

			expect((await call("GET", "/fraud/review-queue")).status).toBe(200);
			expect((await call("GET", "/fraud/rules")).status).toBe(200);
			expect(
				(
					await call("POST", "/fraud/rules", {
						name: "x",
						type: "api_key_burst",
						action: "notify",
					})
				).status,
			).toBe(403);
			expect(
				(
					await call("POST", "/organizations/o/transactions/t/dispute", {
						reason: "nope",
					})
				).status,
			).toBe(403);
			expect(
				(
					await call("POST", `/fraud/events/${eventId}/resolve`, {
						note: "handled",
					})
				).status,
			).toBe(200);
			expect(
				(
					await call("POST", `/fraud/events/${orgEventId}/resolve`, {
						note: "handled",
						clearFlag: true,
					})
				).status,
			).toBe(403);
		});

		it("keeps viewers read-only", async () => {
			const eventId = await seedEvent("user");
			await asRole("viewer");
			expect((await call("GET", "/fraud/events")).status).toBe(200);
			expect(
				(
					await call("POST", `/fraud/events/${eventId}/resolve`, {
						note: "handled",
					})
				).status,
			).toBe(403);
		});
	});

	it("rejects invalid blocked IP settings", async () => {
		clearPlatformConfigMemo();
		const res = await call("PUT", "/settings/config", {
			values: { "abuse.blockedIps": ["not-an-ip"] },
		});
		expect(res.status).toBe(400);
		const ok = await call("PUT", "/settings/config", {
			values: { "abuse.blockedIps": ["203.0.113.0/24", "2001:db8::1"] },
		});
		expect(ok.status).toBe(200);
		const stored = await db.query.systemSetting.findFirst({
			where: { id: { eq: "platform_config" } },
		});
		expect(JSON.parse(stored?.value ?? "{}")["abuse.blockedIps"]).toEqual([
			"203.0.113.0/24",
			"2001:db8::1",
		]);
		await db
			.delete(tables.systemSetting)
			.where(eq(tables.systemSetting.id, "platform_config"));
	});
});
