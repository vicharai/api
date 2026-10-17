import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { logAuditEvent } from "@vichar/audit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import {
	adminMiddleware,
	isAdminEmail,
	resolveAdminRole,
} from "@/middleware/admin.js";

import {
	adminRoles,
	and,
	cdb,
	count,
	db,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	invalidateOrganizationsCache,
	lte,
	ne,
	sql,
	tables,
	type SQL,
} from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const adminUsers = new OpenAPIHono<ServerTypes>();

adminUsers.use("/*", adminMiddleware);

const reasonSchema = z.string().trim().min(1, "A reason is required").max(500);

const successSchema = z.object({ success: z.literal(true) });

async function findUserOrThrow(userId: string) {
	const user = await db.query.user.findFirst({
		where: { id: { eq: userId } },
	});
	if (!user) {
		throw new HTTPException(404, { message: "User not found" });
	}
	return user;
}

// ---------------------------------------------------------------------------
// User detail
// ---------------------------------------------------------------------------

const userDetailSchema = z.object({
	user: z.object({
		id: z.string(),
		email: z.string(),
		name: z.string().nullable(),
		emailVerified: z.boolean(),
		status: z.enum(["active", "deactivated"]),
		blockReason: z.string().nullable(),
		riskStatus: z.enum(["none", "flagged", "approved"]),
		riskFlaggedAt: z.string().nullable(),
		riskFlagIp: z.string().nullable(),
		riskReviewedAt: z.string().nullable(),
		createdAt: z.string(),
		isOwnerAdmin: z.boolean(),
		adminRole: z.enum(adminRoles).nullable(),
	}),
	organizations: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			role: z.string(),
			status: z.string().nullable(),
			plan: z.string(),
			kind: z.string(),
			credits: z.string(),
		}),
	),
	sessions: z.array(
		z.object({
			id: z.string(),
			createdAt: z.string(),
			expiresAt: z.string(),
			ipAddress: z.string().nullable(),
			userAgent: z.string().nullable(),
		}),
	),
	accounts: z.array(z.object({ providerId: z.string() })),
	hasPasskeys: z.boolean(),
});

const getUserDetailRoute = createRoute({
	operationId: "admin_get_user",
	method: "get",
	path: "/users/{userId}",
	request: { params: z.object({ userId: z.string() }) },
	responses: {
		200: {
			content: { "application/json": { schema: userDetailSchema } },
			description: "User profile, memberships, sessions and sign-in methods.",
		},
		404: { description: "User not found." },
	},
});

adminUsers.openapi(getUserDetailRoute, async (c) => {
	const { userId } = c.req.valid("param");
	const user = await findUserOrThrow(userId);

	const [memberships, sessions, accounts, passkeys, adminRole] =
		await Promise.all([
			db
				.select({
					id: tables.organization.id,
					name: tables.organization.name,
					role: tables.userOrganization.role,
					status: tables.organization.status,
					plan: tables.organization.plan,
					kind: tables.organization.kind,
					credits: tables.organization.credits,
				})
				.from(tables.userOrganization)
				.innerJoin(
					tables.organization,
					eq(tables.userOrganization.organizationId, tables.organization.id),
				)
				.where(eq(tables.userOrganization.userId, userId))
				.orderBy(tables.organization.createdAt),
			db.query.session.findMany({
				where: { userId: { eq: userId } },
				orderBy: { createdAt: "desc" },
				limit: 50,
			}),
			db.query.account.findMany({
				where: { userId: { eq: userId } },
				columns: { providerId: true },
			}),
			db.query.passkey.findMany({
				where: { userId: { eq: userId } },
				columns: { id: true },
				limit: 1,
			}),
			resolveAdminRole(user),
		]);

	return c.json({
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			emailVerified: user.emailVerified,
			status: user.status,
			blockReason: user.blockReason,
			riskStatus: user.riskStatus,
			riskFlaggedAt: user.riskFlaggedAt?.toISOString() ?? null,
			riskFlagIp: user.riskFlagIp,
			riskReviewedAt: user.riskReviewedAt?.toISOString() ?? null,
			createdAt: user.createdAt.toISOString(),
			isOwnerAdmin: user.emailVerified && isAdminEmail(user.email),
			adminRole,
		},
		organizations: memberships,
		sessions: sessions.map((s) => ({
			id: s.id,
			createdAt: s.createdAt.toISOString(),
			expiresAt: s.expiresAt.toISOString(),
			ipAddress: s.ipAddress,
			userAgent: s.userAgent,
		})),
		accounts: [...new Set(accounts.map((a) => a.providerId))].map(
			(providerId) => ({ providerId }),
		),
		hasPasskeys: passkeys.length > 0,
	});
});

// ---------------------------------------------------------------------------
// Block / unblock / sessions
// ---------------------------------------------------------------------------

const blockUserRoute = createRoute({
	operationId: "admin_block_user",
	method: "post",
	path: "/users/{userId}/block",
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
			content: { "application/json": { schema: successSchema } },
			description: "User deactivated and signed out everywhere.",
		},
		400: { description: "The user is the caller or holds an admin role." },
		404: { description: "User not found." },
	},
});

adminUsers.openapi(blockUserRoute, async (c) => {
	const admin = c.get("user")!;
	const { userId } = c.req.valid("param");
	const { reason } = c.req.valid("json");

	if (userId === admin.id) {
		throw new HTTPException(400, { message: "You cannot block yourself" });
	}

	const target = await findUserOrThrow(userId);
	const targetMember = await db.query.adminMember.findFirst({
		where: { userId: { eq: userId } },
		columns: { userId: true },
	});
	if (isAdminEmail(target.email) || targetMember) {
		throw new HTTPException(400, {
			message: "Admins cannot be blocked. Remove their admin role first.",
		});
	}

	await db.transaction(async (tx) => {
		await tx
			.update(tables.user)
			.set({ status: "deactivated", blockReason: reason })
			.where(eq(tables.user.id, userId));
		await tx.delete(tables.session).where(eq(tables.session.userId, userId));
	});

	return c.json({ success: true as const });
});

const unblockUserRoute = createRoute({
	operationId: "admin_unblock_user",
	method: "post",
	path: "/users/{userId}/unblock",
	request: { params: z.object({ userId: z.string() }) },
	responses: {
		200: {
			content: { "application/json": { schema: successSchema } },
			description: "User reactivated.",
		},
		404: { description: "User not found." },
	},
});

adminUsers.openapi(unblockUserRoute, async (c) => {
	const { userId } = c.req.valid("param");
	await findUserOrThrow(userId);

	await db
		.update(tables.user)
		.set({ status: "active", blockReason: null })
		.where(eq(tables.user.id, userId));

	return c.json({ success: true as const });
});

const deleteUserSessionsRoute = createRoute({
	operationId: "admin_delete_user_sessions",
	method: "delete",
	path: "/users/{userId}/sessions",
	request: { params: z.object({ userId: z.string() }) },
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ deleted: z.number() }) },
			},
			description: "Number of sessions revoked.",
		},
		404: { description: "User not found." },
	},
});

adminUsers.openapi(deleteUserSessionsRoute, async (c) => {
	const { userId } = c.req.valid("param");
	await findUserOrThrow(userId);

	const deleted = await db
		.delete(tables.session)
		.where(eq(tables.session.userId, userId))
		.returning({ id: tables.session.id });

	return c.json({ deleted: deleted.length });
});

// ---------------------------------------------------------------------------
// Organization unblock
// ---------------------------------------------------------------------------

const unblockOrganizationRoute = createRoute({
	operationId: "admin_unblock_organization",
	method: "post",
	path: "/organizations/{orgId}/unblock",
	request: {
		params: z.object({ orgId: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						reactivateMembers: z.boolean().default(false),
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
						reactivatedMembers: z.number(),
					}),
				},
			},
			description: "Organization reactivated.",
		},
		404: { description: "Organization not found." },
	},
});

adminUsers.openapi(unblockOrganizationRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { reactivateMembers } = c.req.valid("json");

	const org = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
	});
	if (!org) {
		throw new HTTPException(404, { message: "Organization not found" });
	}

	const reactivated = await db.transaction(async (tx) => {
		await tx
			.update(tables.organization)
			.set({ status: "active", blockReason: null })
			.where(eq(tables.organization.id, orgId));

		if (!reactivateMembers) {
			return [];
		}

		// Only members deactivated by the organization block share its reason;
		// users blocked individually keep their own block.
		const memberIds = tx
			.select({ userId: tables.userOrganization.userId })
			.from(tables.userOrganization)
			.where(eq(tables.userOrganization.organizationId, orgId));
		return await tx
			.update(tables.user)
			.set({ status: "active", blockReason: null })
			.where(
				and(
					inArray(tables.user.id, memberIds),
					eq(tables.user.status, "deactivated"),
					sql`${tables.user.blockReason} is not distinct from ${org.blockReason}`,
				),
			)
			.returning({ id: tables.user.id });
	});

	await invalidateOrganizationsCache([orgId]);

	await logAuditEvent({
		organizationId: orgId,
		userId: admin.id,
		action: "organization.update",
		resourceType: "organization",
		resourceId: orgId,
		metadata: {
			resourceName: org.name,
			source: "admin",
			changes: {
				status: { old: org.status ?? "active", new: "active" },
				blockReason: { old: org.blockReason, new: null },
			},
			reactivatedMembers: reactivated.length,
		},
	});

	return c.json({
		success: true as const,
		reactivatedMembers: reactivated.length,
	});
});

// ---------------------------------------------------------------------------
// API key status
// ---------------------------------------------------------------------------

const updateApiKeyStatusRoute = createRoute({
	operationId: "admin_update_api_key_status",
	method: "patch",
	path: "/organizations/{orgId}/api-keys/{keyId}",
	request: {
		params: z.object({ orgId: z.string(), keyId: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({ status: z.enum(["active", "inactive"]) }),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						apiKey: z.object({
							id: z.string(),
							status: z.enum(["active", "inactive"]),
						}),
					}),
				},
			},
			description: "API key status updated.",
		},
		400: { description: "The key's expiry has already passed." },
		404: { description: "API key not found." },
	},
});

adminUsers.openapi(updateApiKeyStatusRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId, keyId } = c.req.valid("param");
	const { status } = c.req.valid("json");

	const [apiKey] = await db
		.select({
			id: tables.apiKey.id,
			status: tables.apiKey.status,
			description: tables.apiKey.description,
			expiresAt: tables.apiKey.expiresAt,
		})
		.from(tables.apiKey)
		.innerJoin(tables.project, eq(tables.apiKey.projectId, tables.project.id))
		.where(
			and(
				eq(tables.apiKey.id, keyId),
				eq(tables.project.organizationId, orgId),
				ne(tables.apiKey.status, "deleted"),
			),
		)
		.limit(1);
	if (!apiKey) {
		throw new HTTPException(404, { message: "API key not found" });
	}

	if (
		status === "active" &&
		apiKey.expiresAt &&
		apiKey.expiresAt.getTime() <= Date.now()
	) {
		throw new HTTPException(400, {
			message: "This API key has expired and cannot be reactivated.",
		});
	}

	if (apiKey.status !== status) {
		// The cached client invalidates the gateway's token lookups on write.
		await cdb
			.update(tables.apiKey)
			.set({ status })
			.where(eq(tables.apiKey.id, keyId));

		await logAuditEvent({
			organizationId: orgId,
			userId: admin.id,
			action: "api_key.update_status",
			resourceType: "api_key",
			resourceId: keyId,
			metadata: {
				resourceName: apiKey.description,
				source: "admin",
				changes: { status: { old: apiKey.status, new: status } },
			},
		});
	}

	return c.json({ apiKey: { id: keyId, status } });
});

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

const getPaymentMethodsRoute = createRoute({
	operationId: "admin_get_organization_payment_methods",
	method: "get",
	path: "/organizations/{orgId}/payment-methods",
	request: { params: z.object({ orgId: z.string() }) },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						paymentMethods: z.array(
							z.object({
								id: z.string(),
								type: z.string(),
								brand: z.string().nullable(),
								last4: z.string().nullable(),
								expMonth: z.number().nullable(),
								expYear: z.number().nullable(),
								isDefault: z.boolean(),
								createdAt: z.string(),
							}),
						),
					}),
				},
			},
			description: "Saved payment methods of the organization.",
		},
		404: { description: "Organization not found." },
	},
});

adminUsers.openapi(getPaymentMethodsRoute, async (c) => {
	const { orgId } = c.req.valid("param");

	const org = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
		columns: { id: true },
	});
	if (!org) {
		throw new HTTPException(404, { message: "Organization not found" });
	}

	const methods = await db.query.paymentMethod.findMany({
		where: { organizationId: { eq: orgId } },
		orderBy: { createdAt: "desc" },
	});

	// Card details live with the payment processor; only the local record is
	// stored here.
	return c.json({
		paymentMethods: methods.map((m) => ({
			id: m.id,
			type: m.type,
			brand: null,
			last4: null,
			expMonth: null,
			expYear: null,
			isDefault: m.isDefault,
			createdAt: m.createdAt.toISOString(),
		})),
	});
});

// ---------------------------------------------------------------------------
// Admin action feed
// ---------------------------------------------------------------------------

const auditLogsRoute = createRoute({
	operationId: "admin_get_audit_logs",
	method: "get",
	path: "/audit-logs",
	request: {
		query: z.object({
			limit: z.coerce.number().int().min(1).max(200).default(50),
			offset: z.coerce.number().int().min(0).default(0),
			adminUserId: z.string().optional(),
			targetOrganizationId: z.string().optional(),
			targetUserId: z.string().optional(),
			method: z.string().toUpperCase().optional(),
			from: z.string().datetime({ offset: true }).optional(),
			to: z.string().datetime({ offset: true }).optional(),
			search: z.string().trim().min(1).optional(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						entries: z.array(
							z.object({
								id: z.string(),
								createdAt: z.string(),
								adminUserId: z.string().nullable(),
								adminEmail: z.string(),
								adminRole: z.enum(adminRoles),
								method: z.string(),
								path: z.string(),
								targetOrganizationId: z.string().nullable(),
								targetUserId: z.string().nullable(),
								statusCode: z.number(),
								requestSummary: z.record(z.string(), z.unknown()).nullable(),
							}),
						),
						total: z.number(),
					}),
				},
			},
			description: "Mutating admin requests, newest first.",
		},
	},
});

adminUsers.openapi(auditLogsRoute, async (c) => {
	const query = c.req.valid("query");
	const log = tables.adminActionLog;

	const conditions: SQL[] = [];
	if (query.adminUserId) {
		conditions.push(eq(log.adminUserId, query.adminUserId));
	}
	if (query.targetOrganizationId) {
		conditions.push(eq(log.targetOrganizationId, query.targetOrganizationId));
	}
	if (query.targetUserId) {
		conditions.push(eq(log.targetUserId, query.targetUserId));
	}
	if (query.method) {
		conditions.push(eq(log.method, query.method));
	}
	if (query.from) {
		conditions.push(gte(log.createdAt, new Date(query.from)));
	}
	if (query.to) {
		conditions.push(lte(log.createdAt, new Date(query.to)));
	}
	if (query.search) {
		const escaped = query.search.replace(/[\\%_]/g, (ch) => `\\${ch}`);
		conditions.push(ilike(log.path, `%${escaped}%`));
	}
	const where = conditions.length ? and(...conditions) : undefined;

	const [rows, [{ total }]] = await Promise.all([
		db
			.select()
			.from(log)
			.where(where)
			.orderBy(desc(log.createdAt), desc(log.id))
			.limit(query.limit)
			.offset(query.offset),
		db.select({ total: count() }).from(log).where(where),
	]);

	return c.json({
		entries: rows.map((r) => ({
			id: r.id,
			createdAt: r.createdAt.toISOString(),
			adminUserId: r.adminUserId,
			adminEmail: r.adminEmail,
			adminRole: r.adminRole,
			method: r.method,
			path: r.path,
			targetOrganizationId: r.targetOrganizationId,
			targetUserId: r.targetUserId,
			statusCode: r.statusCode,
			requestSummary: r.requestSummary ?? null,
		})),
		total,
	});
});
