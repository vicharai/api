import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { logAuditEvent } from "@vichar/audit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { approveHighRiskUser } from "@/lib/account-risk.js";
import { applyBalanceAdjustment } from "@/lib/balance-adjustment.js";
import { getFraudScoreSnapshot, getUserFraudScore } from "@/lib/fraud-score.js";
import { adminMiddleware } from "@/middleware/admin.js";

import {
	evaluateFraudRule,
	findIpClusters,
	findLinkedAccounts,
	FRAUD_RULE_TYPE_SPECS,
	liftOrganizationSuspensions,
	safeParseFraudRuleParams,
	setOrganizationRiskFlag,
} from "@llmgateway/actions";
import {
	and,
	db,
	desc,
	eq,
	fraudRuleActions,
	fraudRuleTypes,
	fraudSubjectTypes,
	getPlatformConfig,
	inArray,
	isNotNull,
	isNull,
	sql,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import { isIpBlocked } from "@llmgateway/shared/ip-rules";

import type { ServerTypes } from "@/vars.js";

export const adminFraud = new OpenAPIHono<ServerTypes>();

adminFraud.use("/*", adminMiddleware);

const riskStatusSchema = z.enum(["none", "flagged", "approved"]);
const ruleTypeSchema = z.enum(fraudRuleTypes);
const ruleActionSchema = z.enum(fraudRuleActions);
const subjectTypeSchema = z.enum(fraudSubjectTypes);
const strengthSchema = z.enum(["strong", "medium", "weak"]);

const signalSchema = z.object({
	key: z.string(),
	label: z.string(),
	points: z.number(),
	detail: z.string(),
});

const scoreSchema = z.object({
	subjectType: subjectTypeSchema,
	subjectId: z.string(),
	label: z.string(),
	score: z.number(),
	signals: z.array(signalSchema),
	createdAt: z.string(),
	riskStatus: riskStatusSchema.nullable(),
	organizations: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			status: z.string().nullable(),
			riskFlagged: z.boolean(),
		}),
	),
});

const linkedAccountSchema = z.object({
	userId: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	createdAt: z.string(),
	status: z.enum(["active", "deactivated"]),
	riskStatus: riskStatusSchema,
	strength: strengthSchema,
	links: z.array(
		z.object({
			type: z.enum([
				"shared_ip",
				"signup_ip",
				"email_domain",
				"payment_fingerprint",
			]),
			strength: strengthSchema,
			detail: z.string(),
		}),
	),
});

const paramSpecSchema = z.object({
	key: z.string(),
	label: z.string(),
	unit: z.string(),
	default: z.number(),
	min: z.number(),
	max: z.number(),
});

const ruleSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: ruleTypeSchema,
	params: z.record(z.string(), z.number()),
	action: ruleActionSchema,
	enabled: z.boolean(),
	createdBy: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	openEvents: z.number(),
	lastEventAt: z.string().nullable(),
});

const eventSchema = z.object({
	id: z.string(),
	createdAt: z.string(),
	ruleId: z.string().nullable(),
	ruleName: z.string().nullable(),
	ruleType: ruleTypeSchema,
	subjectType: subjectTypeSchema,
	subjectId: z.string(),
	subjectLabel: z.string().nullable(),
	details: z.record(z.string(), z.unknown()),
	actionTaken: z.string(),
	resolvedAt: z.string().nullable(),
	resolvedByEmail: z.string().nullable(),
	resolutionNote: z.string().nullable(),
});

const matchSchema = z.object({
	subjectType: subjectTypeSchema,
	subjectId: z.string(),
	label: z.string(),
	details: z.record(z.string(), z.unknown()),
});

const errorSchema = z.object({ message: z.string() });

// --- Linked accounts ---

const userLinksRoute = createRoute({
	operationId: "admin_fraud_user_links",
	method: "get",
	path: "/fraud/users/{userId}/links",
	request: { params: z.object({ userId: z.string() }) },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						userId: z.string(),
						score: scoreSchema.nullable(),
						links: z.array(linkedAccountSchema),
					}),
				},
			},
			description:
				"Accounts linked by shared session IPs (90 days), signup IP, stored card fingerprint or email domain, plus the user's live risk score.",
		},
		404: {
			content: { "application/json": { schema: errorSchema } },
			description: "User not found.",
		},
	},
});

adminFraud.openapi(userLinksRoute, async (c) => {
	const { userId } = c.req.valid("param");
	const links = await findLinkedAccounts(userId);
	if (!links) {
		throw new HTTPException(404, { message: "User not found" });
	}
	return c.json(
		{
			userId,
			score: await getUserFraudScore(userId),
			links: links.map((link) => ({
				...link,
				createdAt: link.createdAt.toISOString(),
			})),
		},
		200,
	);
});

const clustersRoute = createRoute({
	operationId: "admin_fraud_clusters",
	method: "get",
	path: "/fraud/clusters",
	request: {
		query: z.object({
			minAccounts: z.coerce.number().int().min(2).max(1000).default(3),
			days: z.coerce.number().int().min(1).max(90).default(30),
			limit: z.coerce.number().int().min(1).max(200).default(50),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						clusters: z.array(
							z.object({
								ipAddress: z.string(),
								accounts: z.number(),
								firstSeenAt: z.string(),
								lastSeenAt: z.string(),
								blocked: z.boolean(),
								flaggedAccounts: z.number(),
								users: z.array(
									z.object({
										id: z.string(),
										email: z.string(),
										status: z.enum(["active", "deactivated"]),
										riskStatus: riskStatusSchema,
										createdAt: z.string(),
									}),
								),
							}),
						),
					}),
				},
			},
			description:
				"Session IPs shared by many distinct accounts, most accounts first.",
		},
	},
});

adminFraud.openapi(clustersRoute, async (c) => {
	const query = c.req.valid("query");
	const [clusters, config] = await Promise.all([
		findIpClusters(query),
		getPlatformConfig(),
	]);
	const userIds = [...new Set(clusters.flatMap((cl) => cl.userIds))];
	const users = userIds.length
		? await db.query.user.findMany({
				where: { id: { in: userIds } },
				columns: {
					id: true,
					email: true,
					status: true,
					riskStatus: true,
					createdAt: true,
				},
			})
		: [];
	const byId = new Map(users.map((u) => [u.id, u]));
	const blockedIps = config["abuse.blockedIps"];
	return c.json({
		clusters: clusters.map((cluster) => {
			const members = cluster.userIds.flatMap((id) => {
				const user = byId.get(id);
				return user
					? [{ ...user, createdAt: user.createdAt.toISOString() }]
					: [];
			});
			return {
				ipAddress: cluster.ipAddress,
				accounts: cluster.accounts,
				firstSeenAt: cluster.firstSeenAt.toISOString(),
				lastSeenAt: cluster.lastSeenAt.toISOString(),
				blocked: isIpBlocked(cluster.ipAddress, blockedIps),
				flaggedAccounts: members.filter((m) => m.riskStatus === "flagged")
					.length,
				users: members,
			};
		}),
	});
});

// --- Review queue ---

const reviewQueueRoute = createRoute({
	operationId: "admin_fraud_review_queue",
	method: "get",
	path: "/fraud/review-queue",
	request: {
		query: z.object({
			minScore: z.coerce.number().min(0).max(100).default(20),
			subjectType: z.enum(["user", "org", "all"]).default("user"),
			limit: z.coerce.number().int().min(1).max(200).default(50),
			offset: z.coerce.number().int().min(0).default(0),
			refresh: z
				.enum(["true", "false"])
				.default("false")
				.transform((value) => value === "true"),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						computedAt: z.string(),
						total: z.number(),
						entries: z.array(scoreSchema),
					}),
				},
			},
			description:
				"Users or organizations ranked by risk score with the signals behind it.",
		},
	},
});

adminFraud.openapi(reviewQueueRoute, async (c) => {
	const { minScore, subjectType, limit, offset, refresh } =
		c.req.valid("query");
	const snapshot = await getFraudScoreSnapshot(refresh);
	const matching = snapshot.scores.filter(
		(s) =>
			s.score >= minScore &&
			(subjectType === "all" || s.subjectType === subjectType),
	);
	return c.json({
		computedAt: snapshot.computedAt,
		total: matching.length,
		entries: matching.slice(offset, offset + limit),
	});
});

// --- Rules ---

const ruleTypesRoute = createRoute({
	operationId: "admin_fraud_rule_types",
	method: "get",
	path: "/fraud/rule-types",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						types: z.array(
							z.object({
								type: ruleTypeSchema,
								label: z.string(),
								description: z.string(),
								subjectType: subjectTypeSchema,
								params: z.array(paramSpecSchema),
							}),
						),
						actions: z.array(ruleActionSchema),
					}),
				},
			},
			description: "Rule types with their parameter specs, for rule forms.",
		},
	},
});

adminFraud.openapi(ruleTypesRoute, (c) =>
	c.json({
		types: fraudRuleTypes.map((type) => FRAUD_RULE_TYPE_SPECS[type]),
		actions: [...fraudRuleActions],
	}),
);

type RuleRow = typeof tables.fraudRule.$inferSelect;

async function serializeRules(rules: RuleRow[]) {
	const ids = rules.map((r) => r.id);
	const stats = ids.length
		? await db
				.select({
					ruleId: tables.fraudEvent.ruleId,
					openEvents: sql<number>`count(*) filter (where ${tables.fraudEvent.resolvedAt} is null)::int`,
					lastEventAt: sql<
						string | null
					>`max(${tables.fraudEvent.createdAt})::text`,
				})
				.from(tables.fraudEvent)
				.where(inArray(tables.fraudEvent.ruleId, ids))
				.groupBy(tables.fraudEvent.ruleId)
		: [];
	const byRule = new Map(stats.map((s) => [s.ruleId, s]));
	return rules.map((rule) => {
		const stat = byRule.get(rule.id);
		return {
			id: rule.id,
			name: rule.name,
			type: rule.type,
			params: rule.params,
			action: rule.action,
			enabled: rule.enabled,
			createdBy: rule.createdBy,
			createdAt: rule.createdAt.toISOString(),
			updatedAt: rule.updatedAt.toISOString(),
			openEvents: stat?.openEvents ?? 0,
			lastEventAt: stat?.lastEventAt
				? new Date(`${stat.lastEventAt.replace(" ", "T")}Z`).toISOString()
				: null,
		};
	});
}

function validateParams(
	type: (typeof fraudRuleTypes)[number],
	params: unknown,
) {
	const parsed = safeParseFraudRuleParams(type, params);
	if (!parsed.ok) {
		throw new HTTPException(400, { message: parsed.message });
	}
	return parsed.params;
}

async function findRuleOrThrow(id: string): Promise<RuleRow> {
	const rule = await db.query.fraudRule.findFirst({
		where: { id: { eq: id } },
	});
	if (!rule) {
		throw new HTTPException(404, { message: "Rule not found" });
	}
	return rule;
}

const listRulesRoute = createRoute({
	operationId: "admin_fraud_list_rules",
	method: "get",
	path: "/fraud/rules",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ rules: z.array(ruleSchema) }),
				},
			},
			description: "Fraud rules, newest first.",
		},
	},
});

adminFraud.openapi(listRulesRoute, async (c) => {
	const rules = await db.query.fraudRule.findMany({
		orderBy: { createdAt: "desc" },
	});
	return c.json({ rules: await serializeRules(rules) });
});

const ruleBodySchema = z.object({
	name: z.string().trim().min(1).max(120),
	type: ruleTypeSchema,
	params: z.record(z.string(), z.number()).default({}),
	action: ruleActionSchema,
	enabled: z.boolean().default(true),
});

const createRuleRoute = createRoute({
	operationId: "admin_fraud_create_rule",
	method: "post",
	path: "/fraud/rules",
	request: {
		body: { content: { "application/json": { schema: ruleBodySchema } } },
	},
	responses: {
		200: {
			content: { "application/json": { schema: ruleSchema } },
			description: "Rule created.",
		},
		400: {
			content: { "application/json": { schema: errorSchema } },
			description: "Invalid parameters.",
		},
	},
});

adminFraud.openapi(createRuleRoute, async (c) => {
	const admin = c.get("user")!;
	const body = c.req.valid("json");
	const params = validateParams(body.type, body.params);
	const [rule] = await db
		.insert(tables.fraudRule)
		.values({ ...body, params, createdBy: admin.id })
		.returning();
	const [serialized] = await serializeRules([rule]);
	return c.json(serialized, 200);
});

const updateRuleRoute = createRoute({
	operationId: "admin_fraud_update_rule",
	method: "patch",
	path: "/fraud/rules/{id}",
	request: {
		params: z.object({ id: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: ruleBodySchema.omit({ type: true }).partial(),
				},
			},
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: ruleSchema } },
			description: "Rule updated.",
		},
		400: {
			content: { "application/json": { schema: errorSchema } },
			description: "Invalid parameters.",
		},
		404: {
			content: { "application/json": { schema: errorSchema } },
			description: "Rule not found.",
		},
	},
});

adminFraud.openapi(updateRuleRoute, async (c) => {
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	const existing = await findRuleOrThrow(id);
	const params =
		body.params === undefined
			? undefined
			: validateParams(existing.type, body.params);
	const [rule] = await db
		.update(tables.fraudRule)
		.set({ ...body, params })
		.where(eq(tables.fraudRule.id, id))
		.returning();
	const [serialized] = await serializeRules([rule]);
	return c.json(serialized, 200);
});

const deleteRuleRoute = createRoute({
	operationId: "admin_fraud_delete_rule",
	method: "delete",
	path: "/fraud/rules/{id}",
	request: { params: z.object({ id: z.string() }) },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ success: z.literal(true) }),
				},
			},
			description: "Rule deleted; its events are kept.",
		},
		404: {
			content: { "application/json": { schema: errorSchema } },
			description: "Rule not found.",
		},
	},
});

adminFraud.openapi(deleteRuleRoute, async (c) => {
	const { id } = c.req.valid("param");
	await findRuleOrThrow(id);
	await db.delete(tables.fraudRule).where(eq(tables.fraudRule.id, id));
	return c.json({ success: true as const }, 200);
});

const previewRuleRoute = createRoute({
	operationId: "admin_fraud_preview_rule",
	method: "get",
	path: "/fraud/rules/{id}/preview",
	request: { params: z.object({ id: z.string() }) },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						evaluatedAt: z.string(),
						matches: z.array(matchSchema),
					}),
				},
			},
			description:
				"Subjects the rule would match now. Read-only: no events, actions or dedupe.",
		},
		404: {
			content: { "application/json": { schema: errorSchema } },
			description: "Rule not found.",
		},
	},
});

adminFraud.openapi(previewRuleRoute, async (c) => {
	const { id } = c.req.valid("param");
	const rule = await findRuleOrThrow(id);
	const now = new Date();
	return c.json(
		{
			evaluatedAt: now.toISOString(),
			matches: await evaluateFraudRule(rule, now),
		},
		200,
	);
});

// --- Events ---

const listEventsRoute = createRoute({
	operationId: "admin_fraud_list_events",
	method: "get",
	path: "/fraud/events",
	request: {
		query: z.object({
			status: z.enum(["open", "resolved", "all"]).default("open"),
			ruleId: z.string().optional(),
			subjectId: z.string().optional(),
			limit: z.coerce.number().int().min(1).max(200).default(50),
			offset: z.coerce.number().int().min(0).default(0),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						events: z.array(eventSchema),
						total: z.number(),
						openCount: z.number(),
					}),
				},
			},
			description: "Fraud events, newest first.",
		},
	},
});

adminFraud.openapi(listEventsRoute, async (c) => {
	const { status, ruleId, subjectId, limit, offset } = c.req.valid("query");
	const e = tables.fraudEvent;
	const where = and(
		status === "open"
			? isNull(e.resolvedAt)
			: status === "resolved"
				? isNotNull(e.resolvedAt)
				: undefined,
		ruleId ? eq(e.ruleId, ruleId) : undefined,
		subjectId ? eq(e.subjectId, subjectId) : undefined,
	);
	const [rows, [{ total }], [{ openCount }]] = await Promise.all([
		db
			.select({
				event: e,
				ruleName: tables.fraudRule.name,
				resolvedByEmail: tables.user.email,
			})
			.from(e)
			.leftJoin(tables.fraudRule, eq(tables.fraudRule.id, e.ruleId))
			.leftJoin(tables.user, eq(tables.user.id, e.resolvedBy))
			.where(where)
			.orderBy(desc(e.createdAt))
			.limit(limit)
			.offset(offset),
		db
			.select({ total: sql<number>`count(*)::int` })
			.from(e)
			.where(where),
		db
			.select({ openCount: sql<number>`count(*)::int` })
			.from(e)
			.where(isNull(e.resolvedAt)),
	]);

	const userIds = rows
		.filter((r) => r.event.subjectType === "user")
		.map((r) => r.event.subjectId);
	const orgIds = rows
		.filter((r) => r.event.subjectType === "org")
		.map((r) => r.event.subjectId);
	const [users, orgs] = await Promise.all([
		userIds.length
			? db.query.user.findMany({
					where: { id: { in: userIds } },
					columns: { id: true, email: true },
				})
			: [],
		orgIds.length
			? db.query.organization.findMany({
					where: { id: { in: orgIds } },
					columns: { id: true, name: true },
				})
			: [],
	]);
	const labels = new Map<string, string>([
		...users.map((u): [string, string] => [`user:${u.id}`, u.email]),
		...orgs.map((o): [string, string] => [`org:${o.id}`, o.name]),
	]);

	return c.json({
		events: rows.map(({ event, ruleName, resolvedByEmail }) => ({
			id: event.id,
			createdAt: event.createdAt.toISOString(),
			ruleId: event.ruleId,
			ruleName,
			ruleType: event.ruleType,
			subjectType: event.subjectType,
			subjectId: event.subjectId,
			subjectLabel:
				labels.get(`${event.subjectType}:${event.subjectId}`) ?? null,
			details: event.details,
			actionTaken: event.actionTaken,
			resolvedAt: event.resolvedAt?.toISOString() ?? null,
			resolvedByEmail: event.resolvedAt ? resolvedByEmail : null,
			resolutionNote: event.resolutionNote,
		})),
		total,
		openCount,
	});
});

const resolveEventRoute = createRoute({
	operationId: "admin_fraud_resolve_event",
	method: "post",
	path: "/fraud/events/{id}/resolve",
	request: {
		params: z.object({ id: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						note: z.string().trim().min(3, "A note is required").max(1000),
						// Also undo the rule's action: approves a user, unflags an
						// organization and lifts a suspension the rule set.
						clearFlag: z.boolean().default(false),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						success: z.literal(true),
						clearedFlag: z.boolean(),
					}),
				},
			},
			description: "Event resolved.",
		},
		403: {
			content: { "application/json": { schema: errorSchema } },
			description: "Clearing an organization flag needs the admin role.",
		},
		404: {
			content: { "application/json": { schema: errorSchema } },
			description: "Event not found.",
		},
		409: {
			content: { "application/json": { schema: errorSchema } },
			description: "Event already resolved.",
		},
	},
});

adminFraud.openapi(resolveEventRoute, async (c) => {
	const admin = c.get("user")!;
	const { id } = c.req.valid("param");
	const { note, clearFlag } = c.req.valid("json");
	const event = await db.query.fraudEvent.findFirst({
		where: { id: { eq: id } },
	});
	if (!event) {
		throw new HTTPException(404, { message: "Event not found" });
	}
	const suspendedIds = event.details.suspendedOrganizationIds;
	const suspendedOrganizationIds = Array.isArray(suspendedIds)
		? suspendedIds.filter((v): v is string => typeof v === "string")
		: [];
	// Support may approve users, but organization flags stay admin-only.
	if (
		clearFlag &&
		(event.subjectType === "org" || suspendedOrganizationIds.length > 0) &&
		c.get("adminRole") !== "admin"
	) {
		throw new HTTPException(403, {
			message: "Only admins can clear an organization's flag or suspension",
		});
	}
	const [resolved] = await db
		.update(tables.fraudEvent)
		.set({
			resolvedAt: new Date(),
			resolvedBy: admin.id,
			resolutionNote: note,
		})
		.where(
			and(eq(tables.fraudEvent.id, id), isNull(tables.fraudEvent.resolvedAt)),
		)
		.returning({ id: tables.fraudEvent.id });
	if (!resolved) {
		throw new HTTPException(409, { message: "Event is already resolved" });
	}
	if (clearFlag) {
		if (event.subjectType === "user") {
			await approveHighRiskUser({
				userId: event.subjectId,
				reviewerId: admin.id,
			});
		} else {
			await setOrganizationRiskFlag(event.subjectId, false);
		}
		await liftOrganizationSuspensions(suspendedOrganizationIds);
	}
	return c.json({ success: true as const, clearedFlag: clearFlag }, 200);
});

// --- Chargebacks / disputes ---

const disputeRoute = createRoute({
	operationId: "admin_dispute_transaction",
	method: "post",
	path: "/organizations/{orgId}/transactions/{transactionId}/dispute",
	request: {
		params: z.object({ orgId: z.string(), transactionId: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						reason: z.string().trim().min(3, "A reason is required").max(500),
						// Remove the purchased credits (balance may go negative) and
						// risk-flag the organization.
						clawback: z.boolean().default(false),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						disputedAt: z.string(),
						clawbackTransactionId: z.string().nullable(),
						balance: z.number().nullable(),
						organizationFlagged: z.boolean(),
					}),
				},
			},
			description: "Transaction marked disputed.",
		},
		400: {
			content: { "application/json": { schema: errorSchema } },
			description: "Transaction is not a completed payment.",
		},
		404: {
			content: { "application/json": { schema: errorSchema } },
			description: "Organization or transaction not found.",
		},
		409: {
			content: { "application/json": { schema: errorSchema } },
			description: "Transaction already disputed.",
		},
	},
});

adminFraud.openapi(disputeRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId, transactionId } = c.req.valid("param");
	const { reason, clawback } = c.req.valid("json");

	const transaction = await db.query.transaction.findFirst({
		where: { id: { eq: transactionId }, organizationId: { eq: orgId } },
	});
	if (!transaction) {
		throw new HTTPException(404, { message: "Transaction not found" });
	}
	if (
		transaction.status !== "completed" ||
		!(Number(transaction.amount ?? 0) > 0)
	) {
		throw new HTTPException(400, {
			message: "Only completed payments can be disputed",
		});
	}

	const disputedAt = new Date();
	const [marked] = await db
		.update(tables.transaction)
		.set({ disputedAt, disputeReason: reason })
		.where(
			and(
				eq(tables.transaction.id, transactionId),
				isNull(tables.transaction.disputedAt),
			),
		)
		.returning({ id: tables.transaction.id });
	if (!marked) {
		throw new HTTPException(409, {
			message: "Transaction is already disputed",
		});
	}

	const credits = Number(transaction.creditAmount ?? 0);
	let adjustment: { balance: number; transactionId: string } | null = null;
	let organizationFlagged = false;
	if (clawback) {
		if (credits > 0) {
			adjustment = await applyBalanceAdjustment({
				organizationId: orgId,
				amount: -credits,
				reason: `chargeback clawback for transaction ${transactionId}: ${reason}`,
				allowNegative: true,
				admin: { id: admin.id, email: admin.email },
				relatedTransactionId: transactionId,
			});
		}
		organizationFlagged = (await setOrganizationRiskFlag(orgId, true)) !== null;
	}

	await logAuditEvent({
		organizationId: orgId,
		userId: admin.id,
		action: "payment.dispute",
		resourceType: "transaction",
		resourceId: transactionId,
		metadata: {
			reason,
			clawback,
			clawedBackCredits: adjustment ? credits : 0,
		},
	});
	logger.warn("Admin recorded a payment dispute", {
		organizationId: orgId,
		transactionId,
		clawback,
	});

	return c.json(
		{
			disputedAt: disputedAt.toISOString(),
			clawbackTransactionId: adjustment?.transactionId ?? null,
			balance: adjustment?.balance ?? null,
			organizationFlagged,
		},
		200,
	);
});
