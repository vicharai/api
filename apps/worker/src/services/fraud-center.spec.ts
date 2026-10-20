import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	evaluateFraudRule,
	FRAUD_SCORE_CACHE_KEY,
	readFraudScoreCache,
	runFraudRules,
} from "@llmgateway/actions";
import { redisClient } from "@llmgateway/cache";
import {
	clearPlatformConfigMemo,
	db,
	tables,
	type FraudRuleAction,
	type FraudRuleType,
} from "@llmgateway/db";

import { runFraudCenterCycle } from "./fraud-center.js";

const NOW = new Date();
const HOUR_MS = 3_600_000;
const WEBHOOK = "https://discord.com/api/webhooks/1/fraud";

function hoursAgo(hours: number): Date {
	const offsetMs = hours * HOUR_MS;
	return new Date(NOW.getTime() - offsetMs);
}

async function clearRedis() {
	const keys = await redisClient.keys("fraud-rule:*");
	if (keys.length) {
		await redisClient.del(...keys);
	}
	await redisClient.del(FRAUD_SCORE_CACHE_KEY);
}

async function cleanup() {
	await db.delete(tables.fraudEvent);
	await db.delete(tables.fraudRule);
	await db.delete(tables.projectHourlyStats);
	await db.delete(tables.contentFilterHourlyStats);
	await db.delete(tables.orgLimitHitDaily);
	await db.delete(tables.paymentFailure);
	await db.delete(tables.apiKey);
	await db.delete(tables.session);
	await db.delete(tables.userOrganization);
	await db.delete(tables.project);
	await db.delete(tables.organization);
	await db.delete(tables.user);
	await db.delete(tables.systemSetting);
	clearPlatformConfigMemo();
	await clearRedis();
}

async function seedOrg(
	id: string,
	options: { createdAt?: Date; ownerId?: string } = {},
) {
	await db.insert(tables.organization).values({
		id,
		name: `Org ${id}`,
		billingEmail: `${id}@fraud.test`,
		createdAt: options.createdAt ?? NOW,
	});
	await db.insert(tables.project).values({
		id: `${id}-project`,
		name: "Default",
		organizationId: id,
	});
	if (options.ownerId) {
		await db.insert(tables.user).values({
			id: options.ownerId,
			email: `${options.ownerId}@fraud.test`,
		});
		await db.insert(tables.userOrganization).values({
			userId: options.ownerId,
			organizationId: id,
		});
	}
}

async function addRule(
	type: FraudRuleType,
	action: FraudRuleAction,
	params: Record<string, number> = {},
) {
	const [rule] = await db
		.insert(tables.fraudRule)
		.values({ name: `${type} rule`, type, action, params })
		.returning();
	return rule;
}

describe("fraud rules engine", () => {
	beforeEach(cleanup);
	afterEach(async () => {
		vi.unstubAllGlobals();
		await cleanup();
	});

	it("spend_spike_new_account matches young orgs over the spend threshold", async () => {
		await seedOrg("young");
		await seedOrg("old", { createdAt: hoursAgo(24 * 60) });
		await seedOrg("cheap");
		await db.insert(tables.projectHourlyStats).values([
			{ projectId: "young-project", hourTimestamp: hoursAgo(2), cost: 80 },
			{ projectId: "old-project", hourTimestamp: hoursAgo(2), cost: 500 },
			{ projectId: "cheap-project", hourTimestamp: hoursAgo(2), cost: 5 },
			// Outside the 24h window.
			{ projectId: "cheap-project", hourTimestamp: hoursAgo(48), cost: 500 },
		]);

		const matches = await evaluateFraudRule(
			{ type: "spend_spike_new_account", params: { minSpendUsd: 50 } },
			NOW,
		);
		expect(matches.map((m) => m.subjectId)).toEqual(["young"]);
		expect(matches[0].details).toMatchObject({ spendUsd: 80 });
	});

	it("signup_burst_same_ip matches each new account sharing an IP", async () => {
		for (const id of ["burst-a", "burst-b", "burst-c", "lone"]) {
			await db.insert(tables.user).values({ id, email: `${id}@fraud.test` });
		}
		await db.insert(tables.session).values([
			{ token: "t1", userId: "burst-a", ipAddress: "203.0.113.7" },
			{ token: "t2", userId: "burst-b", ipAddress: "203.0.113.7" },
			{ token: "t3", userId: "burst-c", ipAddress: "203.0.113.7" },
			{ token: "t4", userId: "lone", ipAddress: "198.51.100.1" },
		]);

		const matches = await evaluateFraudRule(
			{ type: "signup_burst_same_ip", params: { minAccounts: 3 } },
			NOW,
		);
		expect(matches.map((m) => m.subjectId).sort()).toEqual([
			"burst-a",
			"burst-b",
			"burst-c",
		]);
		expect(matches[0]).toMatchObject({
			subjectType: "user",
			details: { ipAddress: "203.0.113.7", accounts: 3 },
		});
	});

	it("api_key_burst counts keys created in the window per org", async () => {
		await seedOrg("keys", { ownerId: "keys-owner" });
		await seedOrg("few", { ownerId: "few-owner" });
		const key = (id: string, projectId: string, createdBy: string) => ({
			id,
			tokenHash: id,
			tokenMasked: "sk-…",
			description: id,
			projectId,
			createdBy,
		});
		await db
			.insert(tables.apiKey)
			.values([
				key("k1", "keys-project", "keys-owner"),
				key("k2", "keys-project", "keys-owner"),
				key("k3", "keys-project", "keys-owner"),
				key("k4", "few-project", "few-owner"),
			]);

		const matches = await evaluateFraudRule(
			{ type: "api_key_burst", params: { minKeys: 3 } },
			NOW,
		);
		expect(matches.map((m) => m.subjectId)).toEqual(["keys"]);
		expect(matches[0].details).toMatchObject({ keysCreated: 3 });
	});

	it("content_filter_abuse sums the all-category violations", async () => {
		await seedOrg("abuser");
		await db.insert(tables.contentFilterHourlyStats).values([
			{
				hourTimestamp: hoursAgo(1),
				organizationId: "abuser",
				projectId: "abuser-project",
				category: "all",
				sampledCount: 40,
				violationCount: 25,
				blockedCount: 20,
			},
			// Category rows must not be double counted.
			{
				hourTimestamp: hoursAgo(1),
				organizationId: "abuser",
				projectId: "abuser-project",
				category: "violence",
				violationCount: 25,
			},
		]);

		const matches = await evaluateFraudRule(
			{ type: "content_filter_abuse", params: { minViolations: 20 } },
			NOW,
		);
		expect(matches).toHaveLength(1);
		expect(matches[0].details).toMatchObject({ violations: 25, blocked: 20 });
		expect(
			await evaluateFraudRule(
				{ type: "content_filter_abuse", params: { minViolations: 26 } },
				NOW,
			),
		).toEqual([]);
	});

	it("topup_velocity and failed_payments read their aggregate tables", async () => {
		await seedOrg("velocity");
		await db.insert(tables.orgLimitHitDaily).values({
			organizationId: "velocity",
			day: new Date(
				Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()),
			),
			limitType: "topup_velocity",
			hitCount: 4,
			blockedUsd: "400",
		});
		await db.insert(tables.paymentFailure).values(
			[1, 2, 3].map((n) => ({
				organizationId: "velocity",
				declineCode: n === 1 ? "stolen_card" : "insufficient_funds",
				stripePaymentIntentId: `pi_${n}`,
			})),
		);

		const velocity = await evaluateFraudRule(
			{ type: "topup_velocity", params: { minHits: 3 } },
			NOW,
		);
		expect(velocity[0]).toMatchObject({
			subjectId: "velocity",
			details: { rejectedTopUps: 4, blockedUsd: 400 },
		});
		const failures = await evaluateFraudRule(
			{ type: "failed_payments", params: { minFailures: 3 } },
			NOW,
		);
		expect(failures[0].details).toMatchObject({ failures: 3 });
		expect((failures[0].details.declineCodes as string[]).sort()).toEqual([
			"insufficient_funds",
			"stolen_card",
		]);
	});

	it("applies actions, dedupes per window and posts to Discord", async () => {
		await db.insert(tables.systemSetting).values({
			id: "model_error_rate_alerts",
			enabled: true,
			value: JSON.stringify({
				enabled: false,
				thresholdPercent: 20,
				minRequests: 10,
				windowMinutes: 15,
				cooldownMinutes: 60,
				webhookUrl: WEBHOOK,
			}),
		});
		const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);

		await seedOrg("flag-me", { ownerId: "owner-1" });
		await seedOrg("block-me");
		await seedOrg("notify-me");
		for (const org of ["flag-me", "block-me", "notify-me"]) {
			await db.insert(tables.projectHourlyStats).values({
				projectId: `${org}-project`,
				hourTimestamp: hoursAgo(1),
				cost: 100,
			});
		}
		await addRule("spend_spike_new_account", "flag");
		await addRule("spend_spike_new_account", "block_org", {
			minSpendUsd: 100,
		});
		await addRule("spend_spike_new_account", "notify", { minSpendUsd: 100 });

		const created = await runFraudRules(NOW);
		expect(created).toHaveLength(9);
		const taken = (action: FraudRuleAction) =>
			created.filter((e) => e.action === action).map((e) => e.actionTaken);
		for (const actionTaken of taken("flag")) {
			expect(["flagged", "already_flagged"]).toContain(actionTaken);
		}
		for (const actionTaken of taken("block_org")) {
			expect(actionTaken).toMatch(/^(already_)?flagged_pending_block_org$/);
		}
		expect(taken("notify")).toEqual(Array(3).fill("notified"));
		expect(
			created.find((e) => e.action === "block_org")?.details,
		).toMatchObject({ intendedAction: "block_org" });

		const orgs = await db.query.organization.findMany({
			columns: { riskFlagged: true },
		});
		expect(orgs.every((o) => o.riskFlagged)).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe(WEBHOOK);
		expect(JSON.parse(init.body as string).embeds).toHaveLength(9);

		// Same window: deduped, no new events or posts.
		expect(await runFraudRules(NOW)).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(await db.$count(tables.fraudEvent)).toBe(9);
	});

	it("flags users and their sole organizations but skips approved users", async () => {
		await seedOrg("solo", { ownerId: "solo-user" });
		await db.insert(tables.user).values({
			id: "approved-user",
			email: "approved-user@fraud.test",
			riskStatus: "approved",
		});
		await db.insert(tables.session).values([
			{ token: "s1", userId: "solo-user", ipAddress: "203.0.113.9" },
			{ token: "s2", userId: "approved-user", ipAddress: "203.0.113.9" },
		]);
		await addRule("signup_burst_same_ip", "flag", { minAccounts: 2 });

		const created = await runFraudRules(NOW);
		const outcome = Object.fromEntries(
			created.map((e) => [e.subjectId, e.actionTaken]),
		);
		expect(outcome).toEqual({
			"solo-user": "flagged",
			"approved-user": "skipped_approved",
		});
		const user = await db.query.user.findFirst({
			where: { id: { eq: "solo-user" } },
		});
		expect(user).toMatchObject({
			riskStatus: "flagged",
			riskFlagSource: "fraud_rule",
		});
		const org = await db.query.organization.findFirst({
			where: { id: { eq: "solo" } },
		});
		expect(org?.riskFlagged).toBe(true);
	});

	it("caches review-queue scores in the cycle", async () => {
		await seedOrg("scored", { ownerId: "scored-user" });
		await db.insert(tables.contentFilterHourlyStats).values({
			hourTimestamp: hoursAgo(1),
			organizationId: "scored",
			projectId: "scored-project",
			category: "all",
			sampledCount: 60,
			violationCount: 60,
		});

		const result = await runFraudCenterCycle(NOW);
		expect(result.events).toBe(0);
		const snapshot = await readFraudScoreCache();
		const user = snapshot?.scores.find((s) => s.subjectId === "scored-user");
		expect(user?.signals.map((s) => s.key).sort()).toEqual([
			"content_filter",
			"new_account",
			"new_account",
		]);
		expect(user?.score).toBe(40);
	});
});
