import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { logAuditEvent } from "@vichar/audit";
import { Decimal } from "decimal.js";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { booleanQuery, dateQuery, escapeLike } from "@/lib/admin-query.js";
import {
	executeAdminRefund,
	sumRefundsByTransaction,
} from "@/lib/admin-refund.js";
import { adminTagTargetIds, getAdminTags } from "@/lib/admin-tags.js";
import { adminMiddleware } from "@/middleware/admin.js";

import {
	and,
	asc,
	db,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	lte,
	or,
	sql,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

import type { ServerTypes } from "@/vars.js";

export const adminOps = new OpenAPIHono<ServerTypes>();

adminOps.use("/*", adminMiddleware);

const reasonSchema = z.string().trim().min(3, "A reason is required").max(500);

const orgOrThrow = async (orgId: string) => {
	const org = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
	});
	if (!org || org.status === "deleted") {
		throw new HTTPException(404, { message: "Organization not found" });
	}
	return org;
};

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

const adjustCreditsRoute = createRoute({
	method: "post",
	path: "/organizations/{orgId}/credits",
	request: {
		params: z.object({ orgId: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						creditAmount: z
							.number()
							.min(-100000)
							.max(100000)
							.refine((v) => v !== 0, "Amount cannot be zero"),
						reason: reasonSchema,
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
						message: z.string(),
						credits: z.string(),
					}),
				},
			},
			description: "Credits adjusted.",
		},
		404: { description: "Organization not found." },
	},
});

adminOps.openapi(adjustCreditsRoute, async (c) => {
	const user = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { creditAmount, reason } = c.req.valid("json");
	await orgOrThrow(orgId);

	const description =
		creditAmount > 0
			? `Credits gifted by administrator: ${reason}`
			: `Credits deducted by administrator: ${reason}`;

	// Deductions are corrections, not negative gifts, so they stay out of the
	// gifted-credits metric.
	const isGift = creditAmount > 0;

	const [updated] = await db.transaction(async (tx) => {
		await tx.insert(tables.transaction).values({
			organizationId: orgId,
			type: isGift ? "credit_gift" : "credit_adjustment",
			creditAmount: creditAmount.toString(),
			amount: null,
			currency: "USD",
			status: "completed",
			description,
		});
		return await tx
			.update(tables.organization)
			.set({
				credits: sql`${tables.organization.credits} + ${creditAmount}`,
			})
			.where(eq(tables.organization.id, orgId))
			.returning({ credits: tables.organization.credits });
	});

	await logAuditEvent({
		organizationId: orgId,
		userId: user.id,
		action: isGift ? "credits.gift" : "credits.adjust",
		resourceType: "organization",
		resourceId: orgId,
		metadata: { creditAmount, reason },
	});
	logger.info(
		`Admin ${user.email} adjusted credits of org ${orgId} by ${creditAmount}: ${reason}`,
	);

	return c.json({ message: "Credits adjusted", credits: updated.credits });
});

// ---------------------------------------------------------------------------
// Risk flag
// ---------------------------------------------------------------------------

const setRiskFlagRoute = createRoute({
	method: "post",
	path: "/organizations/{orgId}/risk-flag",
	request: {
		params: z.object({ orgId: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						flagged: z.boolean(),
						reason: reasonSchema,
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ flagged: z.boolean() }),
				},
			},
			description: "Risk flag updated.",
		},
		404: { description: "Organization not found." },
	},
});

adminOps.openapi(setRiskFlagRoute, async (c) => {
	const user = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { flagged, reason } = c.req.valid("json");
	await orgOrThrow(orgId);

	await db
		.update(tables.organization)
		.set({ riskFlagged: flagged })
		.where(eq(tables.organization.id, orgId));

	await logAuditEvent({
		organizationId: orgId,
		userId: user.id,
		action: flagged ? "organization.block" : "organization.update",
		resourceType: "organization",
		resourceId: orgId,
		metadata: { reason },
	});
	logger.info(
		`Admin ${user.email} ${flagged ? "set" : "cleared"} risk flag on org ${orgId}: ${reason}`,
	);

	return c.json({ flagged });
});

// ---------------------------------------------------------------------------
// Auto top-up
// ---------------------------------------------------------------------------

const disableAutoTopUpRoute = createRoute({
	method: "post",
	path: "/organizations/{orgId}/auto-top-up/disable",
	request: {
		params: z.object({ orgId: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({ reason: reasonSchema }),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ autoTopUpEnabled: z.boolean() }),
				},
			},
			description: "Auto top-up disabled.",
		},
		404: { description: "Organization not found." },
	},
});

adminOps.openapi(disableAutoTopUpRoute, async (c) => {
	const user = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { reason } = c.req.valid("json");
	await orgOrThrow(orgId);

	await db
		.update(tables.organization)
		.set({ autoTopUpEnabled: false })
		.where(eq(tables.organization.id, orgId));

	await logAuditEvent({
		organizationId: orgId,
		userId: user.id,
		action: "payment.auto_topup.disable",
		resourceType: "organization",
		resourceId: orgId,
		metadata: { reason },
	});
	logger.info(
		`Admin ${user.email} disabled auto top-up on org ${orgId}: ${reason}`,
	);

	return c.json({ autoTopUpEnabled: false });
});

// ---------------------------------------------------------------------------
// Refund a completed credit top-up
// ---------------------------------------------------------------------------

const adminRefundRoute = createRoute({
	method: "post",
	path: "/organizations/{orgId}/transactions/{transactionId}/refund",
	request: {
		params: z.object({ orgId: z.string(), transactionId: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						reason: reasonSchema,
						amount: z.number().positive().optional(),
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
						dodoRefundId: z.string(),
						amount: z.string(),
					}),
				},
			},
			description: "Refund issued.",
		},
		400: { description: "Transaction cannot be refunded." },
		404: { description: "Organization or transaction not found." },
	},
});

adminOps.openapi(adminRefundRoute, async (c) => {
	const user = c.get("user")!;
	const { orgId, transactionId } = c.req.valid("param");
	const { reason, amount } = c.req.valid("json");
	const org = await orgOrThrow(orgId);

	const transaction = await db.query.transaction.findFirst({
		where: {
			id: { eq: transactionId },
			organizationId: { eq: orgId },
		},
	});
	if (!transaction) {
		throw new HTTPException(404, { message: "Transaction not found" });
	}

	const refundedByTransactionId = await sumRefundsByTransaction(orgId, [
		transactionId,
	]);

	const result = await executeAdminRefund({
		organization: org,
		transaction,
		adminUserId: user.id,
		amount,
		refundedAmount:
			refundedByTransactionId.get(transactionId) ?? new Decimal(0),
		reason: "requested_by_customer",
		comment: reason,
	});

	return c.json({
		dodoRefundId: result.dodoRefundId,
		amount: result.amount,
	});
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const searchUsersRoute = createRoute({
	method: "get",
	path: "/users",
	request: {
		query: z.object({
			// Matches email, name or exact user id.
			search: z.string().min(1).optional(),
			// Admin tag (see /admin/tags).
			tag: z.string().min(1).optional(),
			limit: z.coerce.number().int().min(1).max(100).default(25).optional(),
			offset: z.coerce.number().int().min(0).default(0).optional(),
			sortBy: z
				.enum(["createdAt", "email", "lastActiveAt", "credits"])
				.default("createdAt")
				.optional(),
			sortOrder: z.enum(["asc", "desc"]).default("desc").optional(),
			status: z.enum(["active", "deactivated"]).optional(),
			riskStatus: z.enum(["none", "flagged", "approved"]).optional(),
			emailVerified: booleanQuery.optional(),
			createdFrom: dateQuery("start").optional(),
			createdTo: dateQuery("end").optional(),
			hasBalance: booleanQuery.optional(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						users: z.array(
							z.object({
								id: z.string(),
								email: z.string(),
								name: z.string().nullable(),
								emailVerified: z.boolean(),
								status: z.enum(["active", "deactivated"]),
								riskStatus: z.enum(["none", "flagged", "approved"]),
								createdAt: z.string(),
								lastActiveAt: z.string().nullable(),
								totalCredits: z.number(),
								tags: z.array(z.string()),
								organizations: z.array(
									z.object({
										id: z.string(),
										name: z.string(),
										role: z.string().nullable(),
										credits: z.string().nullable(),
										status: z.string().nullable(),
									}),
								),
							}),
						),
						total: z.number(),
					}),
				},
			},
			description: "Users with their organizations, paged.",
		},
	},
});

// Drizzle drops table qualifiers inside a select list, so these correlated
// subqueries spell out their aliases.
const lastActiveAtSql = sql<Date | null>`(SELECT MAX(s.updated_at) FROM "session" s WHERE s.user_id = "user"."id")`;

// Balance across the user's non-deleted organizations.
const totalCreditsSql = sql<string>`(SELECT COALESCE(SUM(o.credits), 0) FROM user_organization uo INNER JOIN organization o ON o.id = uo.organization_id WHERE uo.user_id = "user"."id" AND o.status IS DISTINCT FROM 'deleted')`;

const userSortColumns = {
	createdAt: sql`${tables.user.createdAt}`,
	email: sql`${tables.user.email}`,
	lastActiveAt: lastActiveAtSql,
	credits: totalCreditsSql,
};

adminOps.openapi(searchUsersRoute, async (c) => {
	const {
		search,
		tag,
		limit = 25,
		offset = 0,
		sortBy = "createdAt",
		sortOrder = "desc",
		status,
		riskStatus,
		emailVerified,
		createdFrom,
		createdTo,
		hasBalance,
	} = c.req.valid("query");
	const trimmed = search?.trim();
	const term = trimmed ? `%${escapeLike(trimmed)}%` : undefined;

	const where = and(
		term && trimmed
			? or(
					ilike(tables.user.email, term),
					ilike(tables.user.name, term),
					eq(tables.user.id, trimmed),
				)
			: undefined,
		tag ? inArray(tables.user.id, adminTagTargetIds("user", tag)) : undefined,
		status ? eq(tables.user.status, status) : undefined,
		riskStatus ? eq(tables.user.riskStatus, riskStatus) : undefined,
		emailVerified === undefined
			? undefined
			: eq(tables.user.emailVerified, emailVerified),
		createdFrom ? gte(tables.user.createdAt, createdFrom) : undefined,
		createdTo ? lte(tables.user.createdAt, createdTo) : undefined,
		hasBalance === undefined
			? undefined
			: hasBalance
				? sql`${totalCreditsSql} > 0`
				: sql`${totalCreditsSql} <= 0`,
	);

	const sortExpr = userSortColumns[sortBy];
	const [users, [countRow]] = await Promise.all([
		db
			.select({
				id: tables.user.id,
				email: tables.user.email,
				name: tables.user.name,
				emailVerified: tables.user.emailVerified,
				status: tables.user.status,
				riskStatus: tables.user.riskStatus,
				createdAt: tables.user.createdAt,
				lastActiveAt: lastActiveAtSql.mapWith(tables.session.updatedAt),
				totalCredits: totalCreditsSql,
			})
			.from(tables.user)
			.where(where)
			.orderBy(
				sortOrder === "asc"
					? sql`${sortExpr} ASC NULLS LAST`
					: sql`${sortExpr} DESC NULLS LAST`,
				sortOrder === "asc" ? asc(tables.user.id) : desc(tables.user.id),
			)
			.limit(limit)
			.offset(offset),
		db
			.select({ count: sql<number>`COUNT(*)::int` })
			.from(tables.user)
			.where(where),
	]);
	const tagsByUser = await getAdminTags(
		"user",
		users.map((u) => u.id),
	);

	const memberships = users.length
		? await db
				.select({
					userId: tables.userOrganization.userId,
					organizationId: tables.organization.id,
					organizationName: tables.organization.name,
					role: tables.userOrganization.role,
					credits: tables.organization.credits,
					status: tables.organization.status,
				})
				.from(tables.userOrganization)
				.innerJoin(
					tables.organization,
					eq(tables.userOrganization.organizationId, tables.organization.id),
				)
				.where(
					inArray(
						tables.userOrganization.userId,
						users.map((u) => u.id),
					),
				)
		: [];

	const byUser = new Map<string, typeof memberships>();
	for (const m of memberships) {
		const list = byUser.get(m.userId) ?? [];
		list.push(m);
		byUser.set(m.userId, list);
	}

	return c.json({
		users: users.map((u) => ({
			id: u.id,
			email: u.email,
			name: u.name,
			emailVerified: u.emailVerified,
			status: u.status,
			riskStatus: u.riskStatus,
			createdAt: u.createdAt.toISOString(),
			lastActiveAt: u.lastActiveAt ? u.lastActiveAt.toISOString() : null,
			totalCredits: Number(u.totalCredits),
			tags: tagsByUser.get(u.id) ?? [],
			organizations: (byUser.get(u.id) ?? []).map((m) => ({
				id: m.organizationId,
				name: m.organizationName,
				role: m.role,
				credits: m.credits,
				status: m.status,
			})),
		})),
		total: Number(countRow?.count ?? 0),
	});
});

const verifyEmailRoute = createRoute({
	method: "post",
	path: "/users/{userId}/verify-email",
	request: {
		params: z.object({ userId: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({ reason: reasonSchema }),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ emailVerified: z.boolean() }),
				},
			},
			description: "Email marked verified.",
		},
		404: { description: "User not found." },
	},
});

adminOps.openapi(verifyEmailRoute, async (c) => {
	const admin = c.get("user")!;
	const { userId } = c.req.valid("param");
	const { reason } = c.req.valid("json");

	const target = await db.query.user.findFirst({
		where: { id: { eq: userId } },
	});
	if (!target) {
		throw new HTTPException(404, { message: "User not found" });
	}

	if (!target.emailVerified) {
		await db
			.update(tables.user)
			.set({ emailVerified: true })
			.where(eq(tables.user.id, userId));
	}

	// audit_log is organization-scoped, so this user-level action is just
	// logged.
	logger.info(
		`Admin ${admin.email} manually verified email of ${target.email}: ${reason}`,
	);

	return c.json({ emailVerified: true });
});
