import {
	and,
	CONTENT_FILTER_STATS_ALL_CATEGORY,
	db,
	eq,
	gte,
	isNotNull,
	sql,
	tables,
	type FraudRuleType,
	type FraudSubjectType,
} from "@llmgateway/db";

import { parseFraudRuleParams, type FraudRuleParams } from "./params.js";
import { DAY_MS, HOUR_MS, msBefore } from "./time.js";

export interface FraudMatch {
	subjectType: FraudSubjectType;
	subjectId: string;
	/** Short human-readable subject label (org name or email). */
	label: string;
	details: Record<string, unknown>;
}

const MAX_MATCHES = 500;

const notDeleted = () =>
	sql`${tables.organization.status} IS DISTINCT FROM 'deleted'`;

async function spendSpikeNewAccount(
	params: FraudRuleParams,
	now: Date,
): Promise<FraudMatch[]> {
	const since = msBefore(now, params.windowHours * HOUR_MS);
	const createdAfter = msBefore(now, params.maxAccountAgeDays * DAY_MS);
	const spend = sql<number>`coalesce(sum(${tables.projectHourlyStats.cost}), 0)::float`;
	const rows = await db
		.select({
			organizationId: tables.organization.id,
			name: tables.organization.name,
			createdAt: tables.organization.createdAt,
			spend,
		})
		.from(tables.projectHourlyStats)
		.innerJoin(
			tables.project,
			eq(tables.project.id, tables.projectHourlyStats.projectId),
		)
		.innerJoin(
			tables.organization,
			eq(tables.organization.id, tables.project.organizationId),
		)
		.where(
			and(
				gte(tables.projectHourlyStats.hourTimestamp, since),
				gte(tables.organization.createdAt, createdAfter),
				notDeleted(),
			),
		)
		.groupBy(
			tables.organization.id,
			tables.organization.name,
			tables.organization.createdAt,
		)
		.having(sql`${spend} >= ${params.minSpendUsd}`)
		.orderBy(sql`${spend} desc`)
		.limit(MAX_MATCHES);
	return rows.map((row) => ({
		subjectType: "org",
		subjectId: row.organizationId,
		label: row.name,
		details: {
			spendUsd: Math.round(row.spend * 100) / 100,
			windowHours: params.windowHours,
			accountAgeHours: Math.round(
				(now.getTime() - row.createdAt.getTime()) / HOUR_MS,
			),
		},
	}));
}

async function signupBurstSameIp(
	params: FraudRuleParams,
	now: Date,
): Promise<FraudMatch[]> {
	const since = msBefore(now, params.windowMinutes * 60_000);
	const s = tables.session;
	const userCount = sql<number>`count(distinct ${s.userId})::int`;
	const bursts = await db
		.select({
			ipAddress: sql<string>`${s.ipAddress}`,
			userIds: sql<string[]>`array_agg(distinct ${s.userId})`,
			accounts: userCount,
		})
		.from(s)
		.innerJoin(tables.user, eq(tables.user.id, s.userId))
		.where(
			and(
				gte(s.createdAt, since),
				gte(tables.user.createdAt, since),
				isNotNull(s.ipAddress),
			),
		)
		.groupBy(s.ipAddress)
		.having(sql`${userCount} >= ${params.minAccounts}`)
		.limit(MAX_MATCHES);
	if (bursts.length === 0) {
		return [];
	}
	const userIds = [...new Set(bursts.flatMap((b) => b.userIds))];
	const users = await db.query.user.findMany({
		where: { id: { in: userIds } },
		columns: { id: true, email: true },
	});
	const emailById = new Map(users.map((u) => [u.id, u.email]));
	return bursts.flatMap((burst) =>
		burst.userIds.map((userId) => ({
			subjectType: "user" as const,
			subjectId: userId,
			label: emailById.get(userId) ?? userId,
			details: {
				ipAddress: burst.ipAddress,
				accounts: burst.accounts,
				windowMinutes: params.windowMinutes,
				peerUserIds: burst.userIds.filter((id) => id !== userId).slice(0, 20),
			},
		})),
	);
}

async function apiKeyBurst(
	params: FraudRuleParams,
	now: Date,
): Promise<FraudMatch[]> {
	const since = msBefore(now, params.windowHours * HOUR_MS);
	const keys = sql<number>`count(*)::int`;
	const rows = await db
		.select({
			organizationId: tables.organization.id,
			name: tables.organization.name,
			keys,
		})
		.from(tables.apiKey)
		.innerJoin(tables.project, eq(tables.project.id, tables.apiKey.projectId))
		.innerJoin(
			tables.organization,
			eq(tables.organization.id, tables.project.organizationId),
		)
		.where(and(gte(tables.apiKey.createdAt, since), notDeleted()))
		.groupBy(tables.organization.id, tables.organization.name)
		.having(sql`${keys} >= ${params.minKeys}`)
		.limit(MAX_MATCHES);
	return rows.map((row) => ({
		subjectType: "org",
		subjectId: row.organizationId,
		label: row.name,
		details: { keysCreated: row.keys, windowHours: params.windowHours },
	}));
}

async function contentFilterAbuse(
	params: FraudRuleParams,
	now: Date,
): Promise<FraudMatch[]> {
	const since = msBefore(now, params.windowHours * HOUR_MS);
	const t = tables.contentFilterHourlyStats;
	const violations = sql<number>`coalesce(sum(${t.violationCount}), 0)::int`;
	const rows = await db
		.select({
			organizationId: t.organizationId,
			name: tables.organization.name,
			violations,
			blocked: sql<number>`coalesce(sum(${t.blockedCount}), 0)::int`,
			sampled: sql<number>`coalesce(sum(${t.sampledCount}), 0)::int`,
		})
		.from(t)
		.innerJoin(
			tables.organization,
			eq(tables.organization.id, t.organizationId),
		)
		.where(
			and(
				gte(t.hourTimestamp, since),
				eq(t.category, CONTENT_FILTER_STATS_ALL_CATEGORY),
				notDeleted(),
			),
		)
		.groupBy(t.organizationId, tables.organization.name)
		.having(sql`${violations} >= ${params.minViolations}`)
		.limit(MAX_MATCHES);
	return rows.map((row) => ({
		subjectType: "org",
		subjectId: row.organizationId,
		label: row.name,
		details: {
			violations: row.violations,
			blocked: row.blocked,
			sampled: row.sampled,
			windowHours: params.windowHours,
		},
	}));
}

function utcDayStart(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

async function topupVelocity(
	params: FraudRuleParams,
	now: Date,
): Promise<FraudMatch[]> {
	const since = msBefore(utcDayStart(now), (params.windowDays - 1) * DAY_MS);
	const t = tables.orgLimitHitDaily;
	const hits = sql<number>`coalesce(sum(${t.hitCount}), 0)::int`;
	const rows = await db
		.select({
			organizationId: t.organizationId,
			name: tables.organization.name,
			hits,
			blockedUsd: sql<string>`coalesce(sum(${t.blockedUsd}), 0)::text`,
		})
		.from(t)
		.innerJoin(
			tables.organization,
			eq(tables.organization.id, t.organizationId),
		)
		.where(
			and(gte(t.day, since), eq(t.limitType, "topup_velocity"), notDeleted()),
		)
		.groupBy(t.organizationId, tables.organization.name)
		.having(sql`${hits} >= ${params.minHits}`)
		.limit(MAX_MATCHES);
	return rows.map((row) => ({
		subjectType: "org",
		subjectId: row.organizationId,
		label: row.name,
		details: {
			rejectedTopUps: row.hits,
			blockedUsd: Number(row.blockedUsd),
			windowDays: params.windowDays,
		},
	}));
}

async function failedPayments(
	params: FraudRuleParams,
	now: Date,
): Promise<FraudMatch[]> {
	const since = msBefore(now, params.windowHours * HOUR_MS);
	const t = tables.paymentFailure;
	const failures = sql<number>`count(*)::int`;
	const rows = await db
		.select({
			organizationId: t.organizationId,
			name: tables.organization.name,
			failures,
			declineCodes: sql<
				(string | null)[]
			>`array_agg(distinct ${t.declineCode})`,
		})
		.from(t)
		.innerJoin(
			tables.organization,
			eq(tables.organization.id, t.organizationId),
		)
		.where(and(gte(t.createdAt, since), notDeleted()))
		.groupBy(t.organizationId, tables.organization.name)
		.having(sql`${failures} >= ${params.minFailures}`)
		.limit(MAX_MATCHES);
	return rows.map((row) => ({
		subjectType: "org",
		subjectId: row.organizationId,
		label: row.name,
		details: {
			failures: row.failures,
			declineCodes: row.declineCodes.filter(Boolean),
			windowHours: params.windowHours,
		},
	}));
}

const EVALUATORS: Record<
	FraudRuleType,
	(params: FraudRuleParams, now: Date) => Promise<FraudMatch[]>
> = {
	spend_spike_new_account: spendSpikeNewAccount,
	signup_burst_same_ip: signupBurstSameIp,
	api_key_burst: apiKeyBurst,
	content_filter_abuse: contentFilterAbuse,
	topup_velocity: topupVelocity,
	failed_payments: failedPayments,
};

/**
 * Subjects the rule matches right now. Read-only: reads aggregation tables
 * (and small entity tables), never `log`.
 */
export async function evaluateFraudRule(
	rule: { type: FraudRuleType; params: unknown },
	now: Date = new Date(),
): Promise<FraudMatch[]> {
	const params = parseFraudRuleParams(rule.type, rule.params);
	return await EVALUATORS[rule.type](params, now);
}
