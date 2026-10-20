import { redisClient } from "@llmgateway/cache";
import {
	and,
	CONTENT_FILTER_STATS_ALL_CATEGORY,
	db,
	eq,
	getPlatformConfig,
	gte,
	inArray,
	isNull,
	sql,
	tables,
} from "@llmgateway/db";

import { isBlockedDisposableEmail } from "./disposable.js";
import { countStrongLinks } from "./links.js";
import { DAY_MS, msBefore } from "./time.js";

export type FraudSignalKey =
	| "abuse_ip"
	| "rule_flag"
	| "disposable_email"
	| "new_account"
	| "linked_accounts"
	| "fraud_events"
	| "spend_spike"
	| "topup_velocity"
	| "limit_hits"
	| "content_filter"
	| "disputes"
	| "refunds"
	| "failed_payments";

export interface FraudSignal {
	key: FraudSignalKey;
	label: string;
	points: number;
	detail: string;
}

export interface FraudScoreOrg {
	id: string;
	name: string;
	status: string | null;
	riskFlagged: boolean;
}

export interface FraudScore {
	subjectType: "user" | "org";
	subjectId: string;
	/** Email for users, name for organizations. */
	label: string;
	score: number;
	signals: FraudSignal[];
	createdAt: string;
	/** Users only. */
	riskStatus: "none" | "flagged" | "approved" | null;
	/** Organizations the user belongs to, or the organization itself. */
	organizations: FraudScoreOrg[];
}

const SIGNAL_WINDOW_DAYS = 30;
const REFUND_WINDOW_DAYS = 90;
const CANDIDATE_LIMIT = 2000;

export const FRAUD_SCORE_CACHE_KEY = "fraud:scores:v1";
const FRAUD_SCORE_CACHE_TTL_SECONDS = 30 * 60;

interface UserFacts {
	id: string;
	email: string;
	createdAt: Date;
	riskStatus: "none" | "flagged" | "approved";
	riskFlagSource: string | null;
	linkedAccounts: number;
	openEvents: number;
}

interface OrgFacts {
	id: string;
	name: string;
	createdAt: Date;
	status: string | null;
	riskFlagged: boolean;
	spend24h: number;
	spendPrior7d: number;
	topUpHits: number;
	limitHits: number;
	violations: number;
	disputes: number;
	refunds: number;
	paymentFailures: number;
	openEvents: number;
}

function ageDays(createdAt: Date, now: Date): number {
	return (now.getTime() - createdAt.getTime()) / DAY_MS;
}

function newAccountSignal(createdAt: Date, now: Date): FraudSignal | null {
	const age = ageDays(createdAt, now);
	if (age < 1) {
		return {
			key: "new_account",
			label: "New account",
			points: 10,
			detail: "created in the last 24h",
		};
	}
	if (age < 7) {
		return {
			key: "new_account",
			label: "New account",
			points: 5,
			detail: `${Math.floor(age)} days old`,
		};
	}
	return null;
}

function eventsSignal(count: number): FraudSignal | null {
	return count > 0
		? {
				key: "fraud_events",
				label: "Open fraud events",
				points: Math.min(20, 10 * count),
				detail: `${count} open`,
			}
		: null;
}

export function userSignals(
	user: UserFacts,
	now: Date,
	disposableAllowlist: readonly string[],
): FraudSignal[] {
	const signals: (FraudSignal | null)[] = [];
	if (user.riskStatus === "flagged") {
		signals.push(
			user.riskFlagSource === "fraud_rule"
				? {
						key: "rule_flag",
						label: "Flagged by a fraud rule",
						points: 20,
						detail: "awaiting review",
					}
				: {
						key: "abuse_ip",
						label: "Abusive IP",
						points: 30,
						detail: `AbuseIPDB flag at ${user.riskFlagSource ?? "signup"}`,
					},
		);
	}
	if (isBlockedDisposableEmail(user.email, disposableAllowlist)) {
		signals.push({
			key: "disposable_email",
			label: "Disposable email",
			points: 15,
			detail: user.email.split("@")[1] ?? "",
		});
	}
	signals.push(newAccountSignal(user.createdAt, now));
	if (user.linkedAccounts > 0) {
		signals.push({
			key: "linked_accounts",
			label: "Linked accounts",
			points: Math.min(25, 6 * user.linkedAccounts),
			detail: `${user.linkedAccounts} sharing an IP or card`,
		});
	}
	signals.push(eventsSignal(user.openEvents));
	return signals.filter((s): s is FraudSignal => s !== null);
}

export function orgSignals(org: OrgFacts, now: Date): FraudSignal[] {
	const signals: (FraudSignal | null)[] = [];
	if (org.riskFlagged) {
		signals.push({
			key: "rule_flag",
			label: "Organization risk-flagged",
			points: 20,
			detail: "blocked from inference and purchases",
		});
	}
	signals.push(newAccountSignal(org.createdAt, now));
	const priorDailyAvg = org.spendPrior7d / 7;
	if (
		org.spend24h >= 25 &&
		(ageDays(org.createdAt, now) < 7 ||
			org.spend24h >= 5 * Math.max(1, priorDailyAvg))
	) {
		signals.push({
			key: "spend_spike",
			label: "Spend spike",
			points: org.spend24h >= 200 ? 20 : org.spend24h >= 50 ? 12 : 6,
			detail: `$${org.spend24h.toFixed(2)} in 24h vs $${priorDailyAvg.toFixed(2)}/day before`,
		});
	}
	if (org.topUpHits > 0) {
		signals.push({
			key: "topup_velocity",
			label: "Top-up velocity hits",
			points: Math.min(15, 5 * org.topUpHits),
			detail: `${org.topUpHits} rejected top-ups in ${SIGNAL_WINDOW_DAYS}d`,
		});
	}
	if (org.limitHits >= 10) {
		signals.push({
			key: "limit_hits",
			label: "Rate/spend limit hits",
			points: org.limitHits >= 1000 ? 10 : org.limitHits >= 100 ? 6 : 3,
			detail: `${org.limitHits} in ${SIGNAL_WINDOW_DAYS}d`,
		});
	}
	if (org.violations > 0) {
		signals.push({
			key: "content_filter",
			label: "Content-filter violations",
			points: org.violations >= 50 ? 20 : org.violations >= 10 ? 12 : 5,
			detail: `${org.violations} in ${SIGNAL_WINDOW_DAYS}d`,
		});
	}
	if (org.disputes > 0) {
		signals.push({
			key: "disputes",
			label: "Chargebacks / disputes",
			points: Math.min(40, 30 * org.disputes),
			detail: `${org.disputes} disputed payments`,
		});
	}
	if (org.refunds > 0) {
		signals.push({
			key: "refunds",
			label: "Refunds",
			points: Math.min(10, 5 * org.refunds),
			detail: `${org.refunds} in ${REFUND_WINDOW_DAYS}d`,
		});
	}
	if (org.paymentFailures > 0) {
		signals.push({
			key: "failed_payments",
			label: "Failed payments",
			points: org.paymentFailures >= 5 ? 10 : 4,
			detail: `${org.paymentFailures} in ${SIGNAL_WINDOW_DAYS}d`,
		});
	}
	signals.push(eventsSignal(org.openEvents));
	return signals.filter((s): s is FraudSignal => s !== null);
}

function total(signals: FraudSignal[]): number {
	return signals.reduce((sum, s) => sum + s.points, 0);
}

function textArray(values: string[]) {
	return sql`${sql.param(values)}::text[]`;
}

async function selectCandidates(now: Date): Promise<{
	userIds: string[];
	organizationIds: string[];
}> {
	const since = msBefore(now, SIGNAL_WINDOW_DAYS * DAY_MS);
	const sinceIso = since.toISOString();
	const refundSinceIso = msBefore(
		now,
		REFUND_WINDOW_DAYS * DAY_MS,
	).toISOString();
	const users = await db.execute<{ id: string }>(sql`
		SELECT id FROM ${tables.user}
		WHERE status = 'active' AND (
			created_at >= ${sinceIso}::timestamp
			OR risk_status = 'flagged'
			OR id IN (SELECT subject_id FROM ${tables.fraudEvent}
				WHERE subject_type = 'user' AND resolved_at IS NULL)
		)
		ORDER BY created_at DESC
		LIMIT ${CANDIDATE_LIMIT}
	`);
	const orgs = await db.execute<{ id: string }>(sql`
		SELECT id FROM ${tables.organization}
		WHERE status IS DISTINCT FROM 'deleted' AND (
			created_at >= ${sinceIso}::timestamp
			OR risk_flagged
			OR id IN (SELECT organization_id FROM ${tables.orgLimitHitDaily}
				WHERE day >= ${sinceIso}::timestamp)
			OR id IN (SELECT organization_id FROM ${tables.contentFilterHourlyStats}
				WHERE hour_timestamp >= ${sinceIso}::timestamp
					AND category = ${CONTENT_FILTER_STATS_ALL_CATEGORY}
					AND violation_count > 0)
			OR id IN (SELECT organization_id FROM ${tables.transaction}
				WHERE disputed_at IS NOT NULL
					OR (type = 'credit_refund' AND created_at >= ${refundSinceIso}::timestamp))
			OR id IN (SELECT organization_id FROM ${tables.paymentFailure}
				WHERE created_at >= ${sinceIso}::timestamp)
			OR id IN (SELECT subject_id FROM ${tables.fraudEvent}
				WHERE subject_type = 'org' AND resolved_at IS NULL)
		)
		ORDER BY created_at DESC
		LIMIT ${CANDIDATE_LIMIT}
	`);
	return {
		userIds: users.rows.map((r) => r.id),
		organizationIds: orgs.rows.map((r) => r.id),
	};
}

async function loadUserFacts(
	userIds: string[],
	now: Date,
): Promise<Map<string, UserFacts>> {
	const facts = new Map<string, UserFacts>();
	if (userIds.length === 0) {
		return facts;
	}
	const [users, links, events] = await Promise.all([
		db.query.user.findMany({
			where: { id: { in: userIds } },
			columns: {
				id: true,
				email: true,
				createdAt: true,
				riskStatus: true,
				riskFlagSource: true,
			},
		}),
		countStrongLinks(userIds, now),
		openEventCounts("user", userIds),
	]);
	for (const user of users) {
		facts.set(user.id, {
			...user,
			linkedAccounts: links.get(user.id) ?? 0,
			openEvents: events.get(user.id) ?? 0,
		});
	}
	return facts;
}

async function openEventCounts(
	subjectType: "user" | "org",
	subjectIds: string[],
): Promise<Map<string, number>> {
	const rows = await db
		.select({
			subjectId: tables.fraudEvent.subjectId,
			count: sql<number>`count(*)::int`,
		})
		.from(tables.fraudEvent)
		.where(
			and(
				eq(tables.fraudEvent.subjectType, subjectType),
				inArray(tables.fraudEvent.subjectId, subjectIds),
				isNull(tables.fraudEvent.resolvedAt),
			),
		)
		.groupBy(tables.fraudEvent.subjectId);
	return new Map(rows.map((r) => [r.subjectId, r.count]));
}

function countMap<T extends { id: string }>(
	rows: T[],
	pick: (row: T) => number | string,
): Map<string, number> {
	return new Map(rows.map((r) => [r.id, Number(pick(r))]));
}

async function loadOrgFacts(
	organizationIds: string[],
	now: Date,
): Promise<Map<string, OrgFacts>> {
	const facts = new Map<string, OrgFacts>();
	if (organizationIds.length === 0) {
		return facts;
	}
	const since = msBefore(now, SIGNAL_WINDOW_DAYS * DAY_MS);
	const refundSince = msBefore(now, REFUND_WINDOW_DAYS * DAY_MS);
	const dayAgo = msBefore(now, DAY_MS);
	const eightDaysAgo = msBefore(now, 8 * DAY_MS);
	const phs = tables.projectHourlyStats;
	const hits = tables.orgLimitHitDaily;
	const cf = tables.contentFilterHourlyStats;
	const txn = tables.transaction;

	const [orgs, spend, limitHits, violations, txns, failures, events] =
		await Promise.all([
			db.query.organization.findMany({
				where: { id: { in: organizationIds } },
				columns: {
					id: true,
					name: true,
					createdAt: true,
					status: true,
					riskFlagged: true,
				},
			}),
			db
				.select({
					id: tables.project.organizationId,
					spend24h: sql<number>`coalesce(sum(${phs.cost}) filter (where ${phs.hourTimestamp} >= ${dayAgo.toISOString()}::timestamp), 0)::float`,
					spendPrior7d: sql<number>`coalesce(sum(${phs.cost}) filter (where ${phs.hourTimestamp} < ${dayAgo.toISOString()}::timestamp), 0)::float`,
				})
				.from(phs)
				.innerJoin(tables.project, eq(tables.project.id, phs.projectId))
				.where(
					and(
						inArray(tables.project.organizationId, organizationIds),
						gte(phs.hourTimestamp, eightDaysAgo),
					),
				)
				.groupBy(tables.project.organizationId),
			db
				.select({
					id: hits.organizationId,
					topUpHits: sql<number>`coalesce(sum(${hits.hitCount}) filter (where ${hits.limitType} = 'topup_velocity'), 0)::int`,
					limitHits: sql<number>`coalesce(sum(${hits.hitCount}) filter (where ${hits.limitType} <> 'topup_velocity'), 0)::int`,
				})
				.from(hits)
				.where(
					and(
						inArray(hits.organizationId, organizationIds),
						gte(hits.day, since),
					),
				)
				.groupBy(hits.organizationId),
			db
				.select({
					id: cf.organizationId,
					violations: sql<number>`coalesce(sum(${cf.violationCount}), 0)::int`,
				})
				.from(cf)
				.where(
					and(
						inArray(cf.organizationId, organizationIds),
						gte(cf.hourTimestamp, since),
						eq(cf.category, CONTENT_FILTER_STATS_ALL_CATEGORY),
					),
				)
				.groupBy(cf.organizationId),
			db
				.select({
					id: txn.organizationId,
					disputes: sql<number>`count(*) filter (where ${txn.disputedAt} is not null)::int`,
					refunds: sql<number>`count(*) filter (where ${txn.type} = 'credit_refund' and ${txn.createdAt} >= ${refundSince.toISOString()}::timestamp)::int`,
				})
				.from(txn)
				.where(
					and(
						inArray(txn.organizationId, organizationIds),
						sql`(${txn.disputedAt} is not null or ${txn.type} = 'credit_refund')`,
					),
				)
				.groupBy(txn.organizationId),
			db
				.select({
					id: tables.paymentFailure.organizationId,
					failures: sql<number>`count(*)::int`,
				})
				.from(tables.paymentFailure)
				.where(
					and(
						inArray(tables.paymentFailure.organizationId, organizationIds),
						gte(tables.paymentFailure.createdAt, since),
					),
				)
				.groupBy(tables.paymentFailure.organizationId),
			openEventCounts("org", organizationIds),
		]);

	const spendById = new Map(spend.map((r) => [r.id, r]));
	const hitsById = new Map(limitHits.map((r) => [r.id, r]));
	const violationsById = countMap(violations, (r) => r.violations);
	const txnById = new Map(txns.map((r) => [r.id, r]));
	const failuresById = countMap(failures, (r) => r.failures);
	for (const org of orgs) {
		facts.set(org.id, {
			...org,
			spend24h: spendById.get(org.id)?.spend24h ?? 0,
			spendPrior7d: spendById.get(org.id)?.spendPrior7d ?? 0,
			topUpHits: hitsById.get(org.id)?.topUpHits ?? 0,
			limitHits: hitsById.get(org.id)?.limitHits ?? 0,
			violations: violationsById.get(org.id) ?? 0,
			disputes: txnById.get(org.id)?.disputes ?? 0,
			refunds: txnById.get(org.id)?.refunds ?? 0,
			paymentFailures: failuresById.get(org.id) ?? 0,
			openEvents: events.get(org.id) ?? 0,
		});
	}
	return facts;
}

function prefixed(signals: FraudSignal[], prefix: string): FraudSignal[] {
	return signals.map((s) => ({ ...s, detail: `${prefix}: ${s.detail}` }));
}

/**
 * Risk scores (0–100) from user and organization signals. A user's score adds
 * their riskiest organization's signals; an organization's adds its riskiest
 * member's. Without explicit ids, scores every recent or suspicious subject.
 */
export async function computeFraudScores(
	options: {
		userIds?: string[];
		organizationIds?: string[];
		now?: Date;
	} = {},
): Promise<FraudScore[]> {
	const now = options.now ?? new Date();
	const explicit =
		options.userIds !== undefined || options.organizationIds !== undefined;
	const candidates = explicit
		? {
				userIds: options.userIds ?? [],
				organizationIds: options.organizationIds ?? [],
			}
		: await selectCandidates(now);

	const memberships =
		candidates.userIds.length + candidates.organizationIds.length > 0
			? await db
					.select({
						userId: tables.userOrganization.userId,
						organizationId: tables.userOrganization.organizationId,
					})
					.from(tables.userOrganization)
					.where(
						sql`${tables.userOrganization.userId} = ANY(${textArray(candidates.userIds)}) OR ${tables.userOrganization.organizationId} = ANY(${textArray(candidates.organizationIds)})`,
					)
			: [];
	const allUserIds = [
		...new Set([...candidates.userIds, ...memberships.map((m) => m.userId)]),
	];
	const allOrgIds = [
		...new Set([
			...candidates.organizationIds,
			...memberships.map((m) => m.organizationId),
		]),
	];

	const config = await getPlatformConfig();
	const allowlist = config["abuse.disposableEmailAllowlist"];
	const [users, orgs] = await Promise.all([
		loadUserFacts(allUserIds, now),
		loadOrgFacts(allOrgIds, now),
	]);

	const userSignalCache = new Map(
		[...users.values()].map((u) => [u.id, userSignals(u, now, allowlist)]),
	);
	const orgSignalCache = new Map(
		[...orgs.values()].map((o) => [o.id, orgSignals(o, now)]),
	);
	const orgsOfUser = new Map<string, string[]>();
	const usersOfOrg = new Map<string, string[]>();
	for (const m of memberships) {
		orgsOfUser.set(m.userId, [
			...(orgsOfUser.get(m.userId) ?? []),
			m.organizationId,
		]);
		usersOfOrg.set(m.organizationId, [
			...(usersOfOrg.get(m.organizationId) ?? []),
			m.userId,
		]);
	}
	const orgSummary = (id: string): FraudScoreOrg | null => {
		const org = orgs.get(id);
		return org
			? {
					id: org.id,
					name: org.name,
					status: org.status,
					riskFlagged: org.riskFlagged,
				}
			: null;
	};
	const riskiest = (
		ids: string[],
		signalsOf: Map<string, FraudSignal[]>,
	): string | null => {
		let best: string | null = null;
		for (const id of ids) {
			const points = total(signalsOf.get(id) ?? []);
			if (points > 0 && (!best || points > total(signalsOf.get(best) ?? []))) {
				best = id;
			}
		}
		return best;
	};

	const scores: FraudScore[] = [];
	for (const userId of candidates.userIds) {
		const user = users.get(userId);
		if (!user) {
			continue;
		}
		const orgIds = orgsOfUser.get(userId) ?? [];
		const worstOrg = riskiest(orgIds, orgSignalCache);
		const signals = [
			...(userSignalCache.get(userId) ?? []),
			...(worstOrg
				? prefixed(
						orgSignalCache.get(worstOrg) ?? [],
						orgs.get(worstOrg)?.name ?? worstOrg,
					)
				: []),
		];
		scores.push({
			subjectType: "user",
			subjectId: userId,
			label: user.email,
			score: Math.min(100, total(signals)),
			signals,
			createdAt: user.createdAt.toISOString(),
			riskStatus: user.riskStatus,
			organizations: orgIds
				.map(orgSummary)
				.filter((o): o is FraudScoreOrg => o !== null),
		});
	}
	for (const orgId of candidates.organizationIds) {
		const org = orgs.get(orgId);
		if (!org || org.status === "deleted") {
			continue;
		}
		const worstUser = riskiest(usersOfOrg.get(orgId) ?? [], userSignalCache);
		const signals = [
			...(orgSignalCache.get(orgId) ?? []),
			...(worstUser
				? prefixed(
						userSignalCache.get(worstUser) ?? [],
						users.get(worstUser)?.email ?? worstUser,
					)
				: []),
		];
		scores.push({
			subjectType: "org",
			subjectId: orgId,
			label: org.name,
			score: Math.min(100, total(signals)),
			signals,
			createdAt: org.createdAt.toISOString(),
			riskStatus: null,
			organizations: [orgSummary(orgId)!],
		});
	}
	return scores.sort((a, b) => b.score - a.score);
}

export interface FraudScoreSnapshot {
	computedAt: string;
	scores: FraudScore[];
}

/** Recomputes every candidate's score and caches the non-zero ones. */
export async function refreshFraudScoreCache(
	now: Date = new Date(),
): Promise<FraudScoreSnapshot> {
	const snapshot: FraudScoreSnapshot = {
		computedAt: now.toISOString(),
		scores: (await computeFraudScores({ now })).filter((s) => s.score > 0),
	};
	await redisClient.set(
		FRAUD_SCORE_CACHE_KEY,
		JSON.stringify(snapshot),
		"EX",
		FRAUD_SCORE_CACHE_TTL_SECONDS,
	);
	return snapshot;
}

export async function readFraudScoreCache(): Promise<FraudScoreSnapshot | null> {
	const raw = await redisClient.get(FRAUD_SCORE_CACHE_KEY);
	return raw ? (JSON.parse(raw) as FraudScoreSnapshot) : null;
}
