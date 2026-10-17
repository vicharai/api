import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { logAuditEvent } from "@vichar/audit";
import { Decimal } from "decimal.js";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import {
	executeAdminRefund,
	sumRefundsByTransaction,
} from "@/lib/admin-refund.js";
import { adminTagTargetIds, getAdminTags } from "@/lib/admin-tags.js";
import { adminMiddleware } from "@/middleware/admin.js";

import { and, db, eq, ilike, inArray, or, sql, tables } from "@llmgateway/db";
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

	const [updated] = await db.transaction(async (tx) => {
		await tx.insert(tables.transaction).values({
			organizationId: orgId,
			type: "credit_gift",
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
		action: "credits.gift",
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
			search: z.string().min(1).optional(),
			// Admin tag (see /admin/tags); search or tag is required.
			tag: z.string().min(1).optional(),
			limit: z.coerce.number().min(1).max(50).default(20).optional(),
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
								createdAt: z.string(),
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
					}),
				},
			},
			description: "Matching users with their organizations.",
		},
	},
});

adminOps.openapi(searchUsersRoute, async (c) => {
	const { search, tag, limit = 20 } = c.req.valid("query");
	if (!search && !tag) {
		throw new HTTPException(400, { message: "Provide search or tag" });
	}
	const term = search ? `%${search.trim()}%` : undefined;

	const users = await db
		.select()
		.from(tables.user)
		.where(
			and(
				term
					? or(ilike(tables.user.email, term), ilike(tables.user.name, term))
					: undefined,
				tag
					? inArray(tables.user.id, adminTagTargetIds("user", tag))
					: undefined,
			),
		)
		.limit(limit);
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
			createdAt: u.createdAt.toISOString(),
			tags: tagsByUser.get(u.id) ?? [],
			organizations: (byUser.get(u.id) ?? []).map((m) => ({
				id: m.organizationId,
				name: m.organizationName,
				role: m.role,
				credits: m.credits,
				status: m.status,
			})),
		})),
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
