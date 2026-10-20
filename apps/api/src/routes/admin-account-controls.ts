import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { logAuditEvent } from "@vichar/audit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { apiAuth } from "@/auth/config.js";
import {
	deactivateUserApiKeys,
	deleteOrganizationAsAdmin,
	deleteSessionsOf,
	deleteUserAsAdmin,
	findOrganizationOrThrow,
	findTargetUser,
	findUserOrThrow,
	organizationMemberIds,
	setOrganizationApiKeysStatus,
} from "@/lib/admin-account-actions.js";
import {
	EnterpriseSeatLimitError,
	withEnterpriseSeatForOrganization,
	withEnterpriseSeatsForActivation,
} from "@/lib/enterprise-seats.js";
import { resolveSeatLimit } from "@/lib/seat-limit.js";
import { recomputeUserTeam } from "@/lib/sso-teams.js";
import { adminMiddleware } from "@/middleware/admin.js";

import {
	and,
	count,
	db,
	eq,
	getPlatformConfig,
	inArray,
	invalidateOrganizationsCache,
	ne,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import { hasOrganizationEnterpriseAccess } from "@llmgateway/shared/enterprise-license";
import { isProjectScopedRole } from "@llmgateway/shared/organization-roles";

import type { ServerTypes } from "@/vars.js";

export const adminAccountControls = new OpenAPIHono<ServerTypes>();

adminAccountControls.use("/*", adminMiddleware);

const json = <T extends z.ZodTypeAny>(schema: T) => ({
	content: { "application/json": { schema } },
});

const MAX_BULK = 200;
const MAX_SUSPENSION_DAYS = 366;
const MAX_SUSPENSION_MS = MAX_SUSPENSION_DAYS * 86_400_000;

const reasonSchema = z.string().trim().min(1, "A reason is required").max(500);
const untilSchema = z
	.string()
	.datetime({ offset: true })
	.openapi({
		description: `ISO timestamp in the future, at most ${MAX_SUSPENSION_DAYS} days ahead.`,
	});
const bulkIdsSchema = z.array(z.string().min(1)).min(1).max(MAX_BULK);
const orgParams = z.object({ orgId: z.string() });
const userParams = z.object({ userId: z.string() });
const successSchema = z.object({ success: z.literal(true) });
const skippedSchema = z.array(z.object({ id: z.string(), reason: z.string() }));

function parseUntil(value: string): Date {
	const until = new Date(value);
	const now = Date.now();
	if (until.getTime() <= now) {
		throw new HTTPException(400, { message: "`until` must be in the future" });
	}
	if (until.getTime() > now + MAX_SUSPENSION_MS) {
		throw new HTTPException(400, {
			message: `\`until\` can be at most ${MAX_SUSPENSION_DAYS} days ahead. Block the account instead.`,
		});
	}
	return until;
}

function isActive(until: Date | null): until is Date {
	return until !== null && until.getTime() > Date.now();
}

/** Runs `task` per unique id; refusals become per-id skip reasons. */
async function runBulk(
	ids: string[],
	task: (id: string) => Promise<unknown>,
): Promise<{ done: string[]; skipped: { id: string; reason: string }[] }> {
	const done: string[] = [];
	const skipped: { id: string; reason: string }[] = [];
	// Sequential: each item may call the payment provider, and one failure
	// must not abort the rest.
	for (const id of [...new Set(ids)]) {
		try {
			await task(id);
			done.push(id);
		} catch (error) {
			if (error instanceof HTTPException) {
				skipped.push({ id, reason: error.message });
				continue;
			}
			logger.error("Admin bulk action failed", { id, error });
			skipped.push({
				id,
				reason: `Internal error: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	}
	return { done, skipped };
}

// ---------------------------------------------------------------------------
// Organization delete / restore
// ---------------------------------------------------------------------------

const deleteOrganizationBody = z.object({
	reason: reasonSchema,
	forfeitBalance: z.boolean().optional().openapi({
		description:
			"Required when the balance is positive; zeroes it with a credit_adjustment.",
	}),
});

const deleteOrganizationRoute = createRoute({
	operationId: "admin_delete_organization",
	method: "delete",
	path: "/organizations/{orgId}",
	request: { params: orgParams, body: json(deleteOrganizationBody) },
	responses: {
		200: {
			...json(
				z.object({
					cancelledSubscriptionIds: z.array(z.string()),
					revokedApiKeys: z.number(),
					forfeitedCredits: z.string().nullable(),
				}),
			),
			description:
				"Organization soft-deleted: subscriptions and auto top-up cancelled, API keys revoked. Members keep their accounts.",
		},
		400: { description: "The caller is a member of the organization." },
		404: { description: "Organization not found." },
		409: {
			description:
				"Already deleted, positive balance without forfeitBalance, or changed concurrently.",
		},
	},
});

adminAccountControls.openapi(deleteOrganizationRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { reason, forfeitBalance = false } = c.req.valid("json");
	const result = await deleteOrganizationAsAdmin({
		orgId,
		admin,
		reason,
		forfeitBalance,
	});
	return c.json(result, 200);
});

const bulkDeleteOrganizationsRoute = createRoute({
	operationId: "admin_bulk_delete_organizations",
	method: "post",
	path: "/organizations/bulk-delete",
	request: {
		body: json(deleteOrganizationBody.extend({ ids: bulkIdsSchema })),
	},
	responses: {
		200: {
			...json(
				z.object({ deleted: z.array(z.string()), skipped: skippedSchema }),
			),
			description: "Per-organization outcome; refusals are skipped.",
		},
	},
});

adminAccountControls.openapi(bulkDeleteOrganizationsRoute, async (c) => {
	const admin = c.get("user")!;
	const { ids, reason, forfeitBalance = false } = c.req.valid("json");
	const { done, skipped } = await runBulk(ids, (orgId) =>
		deleteOrganizationAsAdmin({ orgId, admin, reason, forfeitBalance }),
	);
	return c.json({ deleted: done, skipped }, 200);
});

const restoreOrganizationRoute = createRoute({
	operationId: "admin_restore_organization",
	method: "post",
	path: "/organizations/{orgId}/restore",
	request: {
		params: orgParams,
		body: json(z.object({ reason: reasonSchema })),
	},
	responses: {
		200: {
			...json(successSchema),
			description:
				"Organization active again. Revoked API keys, cancelled subscriptions and forfeited credits are not restored.",
		},
		404: { description: "Organization not found." },
		409: { description: "Not deleted, or the enterprise seat limit is hit." },
	},
});

adminAccountControls.openapi(restoreOrganizationRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { reason } = c.req.valid("json");
	const org = await findOrganizationOrThrow(orgId);
	if (org.status !== "deleted") {
		throw new HTTPException(409, { message: "Organization is not deleted" });
	}
	try {
		await withEnterpriseSeatsForActivation(orgId, async (tx) => {
			await tx
				.update(tables.organization)
				.set({ status: "active", blockReason: null })
				.where(eq(tables.organization.id, orgId));
		});
	} catch (error) {
		if (error instanceof EnterpriseSeatLimitError) {
			throw new HTTPException(409, { message: error.message });
		}
		throw error;
	}
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
			reason,
			changes: { status: { old: org.status, new: "active" } },
		},
	});
	return c.json({ success: true as const }, 200);
});

// ---------------------------------------------------------------------------
// Bulk user delete
// ---------------------------------------------------------------------------

const bulkDeleteUsersRoute = createRoute({
	operationId: "admin_bulk_delete_users",
	method: "post",
	path: "/users/bulk-delete",
	request: {
		body: json(z.object({ ids: bulkIdsSchema, reason: reasonSchema })),
	},
	responses: {
		200: {
			...json(
				z.object({ deleted: z.array(z.string()), skipped: skippedSchema }),
			),
			description:
				"Per-user outcome. The caller and staff accounts are skipped.",
		},
	},
});

adminAccountControls.openapi(bulkDeleteUsersRoute, async (c) => {
	const admin = c.get("user")!;
	const { ids, reason } = c.req.valid("json");
	const { done, skipped } = await runBulk(ids, (userId) =>
		deleteUserAsAdmin(admin.id, userId, reason),
	);
	return c.json({ deleted: done, skipped }, 200);
});

// ---------------------------------------------------------------------------
// Suspension
// ---------------------------------------------------------------------------

const suspendBody = z.object({ until: untilSchema, reason: reasonSchema });
const suspensionSchema = z.object({
	suspendedUntil: z.string().nullable(),
	suspendReason: z.string().nullable(),
});

const suspendUserRoute = createRoute({
	operationId: "admin_suspend_user",
	method: "post",
	path: "/users/{userId}/suspend",
	request: { params: userParams, body: json(suspendBody) },
	responses: {
		200: {
			...json(suspensionSchema),
			description:
				"The API rejects the user's sessions and sign-ins until the time passes.",
		},
		400: { description: "Invalid time, the caller, or a staff account." },
		404: { description: "User not found." },
	},
});

async function suspendUser(
	adminId: string,
	userId: string,
	until: Date,
	reason: string,
) {
	await findTargetUser(adminId, userId, { verb: "suspend", past: "suspended" });
	await db
		.update(tables.user)
		.set({ suspendedUntil: until, suspendReason: reason })
		.where(eq(tables.user.id, userId));
	logger.info("Admin suspended user", {
		userId,
		adminUserId: adminId,
		until: until.toISOString(),
		reason,
	});
}

adminAccountControls.openapi(suspendUserRoute, async (c) => {
	const admin = c.get("user")!;
	const { userId } = c.req.valid("param");
	const { until, reason } = c.req.valid("json");
	const untilDate = parseUntil(until);
	await suspendUser(admin.id, userId, untilDate, reason);
	return c.json(
		{ suspendedUntil: untilDate.toISOString(), suspendReason: reason },
		200,
	);
});

const unsuspendUserRoute = createRoute({
	operationId: "admin_unsuspend_user",
	method: "post",
	path: "/users/{userId}/unsuspend",
	request: { params: userParams },
	responses: {
		200: { ...json(successSchema), description: "Suspension lifted." },
		404: { description: "User not found." },
	},
});

adminAccountControls.openapi(unsuspendUserRoute, async (c) => {
	const { userId } = c.req.valid("param");
	await findUserOrThrow(userId);
	await db
		.update(tables.user)
		.set({ suspendedUntil: null, suspendReason: null })
		.where(eq(tables.user.id, userId));
	return c.json({ success: true as const }, 200);
});

const suspendOrganizationRoute = createRoute({
	operationId: "admin_suspend_organization",
	method: "post",
	path: "/organizations/{orgId}/suspend",
	request: { params: orgParams, body: json(suspendBody) },
	responses: {
		200: {
			...json(suspensionSchema),
			description:
				"The gateway rejects the organization's requests until then.",
		},
		400: { description: "Invalid time." },
		404: { description: "Organization not found or deleted." },
	},
});

async function suspendOrganization(
	adminId: string,
	org: { id: string; name: string; suspendedUntil: Date | null },
	until: Date,
	reason: string,
) {
	await db
		.update(tables.organization)
		.set({ suspendedUntil: until, suspendReason: reason })
		.where(eq(tables.organization.id, org.id));
	await invalidateOrganizationsCache([org.id]);
	await logAuditEvent({
		organizationId: org.id,
		userId: adminId,
		action: "organization.update",
		resourceType: "organization",
		resourceId: org.id,
		metadata: {
			resourceName: org.name,
			source: "admin",
			reason,
			changes: {
				suspendedUntil: {
					old: org.suspendedUntil?.toISOString() ?? null,
					new: until.toISOString(),
				},
			},
		},
	});
}

async function findLiveOrganization(orgId: string) {
	const org = await findOrganizationOrThrow(orgId);
	if (org.status === "deleted") {
		throw new HTTPException(404, { message: "Organization is deleted" });
	}
	return org;
}

adminAccountControls.openapi(suspendOrganizationRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { until, reason } = c.req.valid("json");
	const untilDate = parseUntil(until);
	const org = await findLiveOrganization(orgId);
	await suspendOrganization(admin.id, org, untilDate, reason);
	return c.json(
		{ suspendedUntil: untilDate.toISOString(), suspendReason: reason },
		200,
	);
});

const unsuspendOrganizationRoute = createRoute({
	operationId: "admin_unsuspend_organization",
	method: "post",
	path: "/organizations/{orgId}/unsuspend",
	request: { params: orgParams },
	responses: {
		200: { ...json(successSchema), description: "Suspension lifted." },
		404: { description: "Organization not found." },
	},
});

adminAccountControls.openapi(unsuspendOrganizationRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const org = await findOrganizationOrThrow(orgId);
	await db
		.update(tables.organization)
		.set({ suspendedUntil: null, suspendReason: null })
		.where(eq(tables.organization.id, orgId));
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
				suspendedUntil: {
					old: org.suspendedUntil?.toISOString() ?? null,
					new: null,
				},
			},
		},
	});
	return c.json({ success: true as const }, 200);
});

// ---------------------------------------------------------------------------
// Lockdown
// ---------------------------------------------------------------------------

const lockdownBody = z.object({
	reason: reasonSchema,
	suspendUntil: untilSchema.optional(),
});

const lockdownUserRoute = createRoute({
	operationId: "admin_lockdown_user",
	method: "post",
	path: "/users/{userId}/lockdown",
	request: { params: userParams, body: json(lockdownBody) },
	responses: {
		200: {
			...json(
				z.object({
					sessionsRevoked: z.number(),
					apiKeysDeactivated: z.number(),
					suspendedUntil: z.string().nullable(),
				}),
			),
			description:
				"All sessions revoked and every API key the user created set inactive; optionally suspended.",
		},
		400: { description: "Invalid time, the caller, or a staff account." },
		404: { description: "User not found." },
	},
});

adminAccountControls.openapi(lockdownUserRoute, async (c) => {
	const admin = c.get("user")!;
	const { userId } = c.req.valid("param");
	const { reason, suspendUntil } = c.req.valid("json");
	const until = suspendUntil ? parseUntil(suspendUntil) : null;
	await findTargetUser(admin.id, userId, {
		verb: "lock down",
		past: "locked down",
	});
	if (until) {
		await suspendUser(admin.id, userId, until, reason);
	}
	const apiKeysDeactivated = await deactivateUserApiKeys(userId);
	const sessionsRevoked = await deleteSessionsOf([userId]);
	logger.info("Admin locked down user", {
		userId,
		adminUserId: admin.id,
		reason,
		sessionsRevoked,
		apiKeysDeactivated,
	});
	return c.json(
		{
			sessionsRevoked,
			apiKeysDeactivated,
			suspendedUntil: until?.toISOString() ?? null,
		},
		200,
	);
});

const lockdownOrganizationRoute = createRoute({
	operationId: "admin_lockdown_organization",
	method: "post",
	path: "/organizations/{orgId}/lockdown",
	request: { params: orgParams, body: json(lockdownBody) },
	responses: {
		200: {
			...json(
				z.object({
					apiKeysDeactivated: z.number(),
					sessionsRevoked: z.number(),
					membersSignedOut: z.number(),
					staffMembersSkipped: z.number(),
					suspendedUntil: z.string().nullable(),
				}),
			),
			description:
				"Every org API key set inactive and members signed out (staff excepted); optionally suspended.",
		},
		400: { description: "Invalid time." },
		404: { description: "Organization not found or deleted." },
	},
});

adminAccountControls.openapi(lockdownOrganizationRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { reason, suspendUntil } = c.req.valid("json");
	const until = suspendUntil ? parseUntil(suspendUntil) : null;
	const org = await findLiveOrganization(orgId);
	if (until) {
		await suspendOrganization(admin.id, org, until, reason);
	}
	const apiKeysDeactivated = await setOrganizationApiKeysStatus(
		orgId,
		["active"],
		"inactive",
	);
	const { members, staff } = await organizationMemberIds(orgId);
	const sessionsRevoked = await deleteSessionsOf(members);
	await logAuditEvent({
		organizationId: orgId,
		userId: admin.id,
		action: "organization.block",
		resourceType: "organization",
		resourceId: orgId,
		metadata: {
			resourceName: org.name,
			source: "admin",
			lockdown: true,
			reason,
			apiKeysDeactivated,
			sessionsRevoked,
			suspendedUntil: until?.toISOString() ?? null,
		},
	});
	return c.json(
		{
			apiKeysDeactivated,
			sessionsRevoked,
			membersSignedOut: members.length,
			staffMembersSkipped: staff.length,
			suspendedUntil: until?.toISOString() ?? null,
		},
		200,
	);
});

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

const memberRoleSchema = z.enum([
	"owner",
	"admin",
	"project_admin",
	"developer",
]);

const addMemberRoute = createRoute({
	operationId: "admin_add_organization_member",
	method: "post",
	path: "/organizations/{orgId}/members",
	request: {
		params: orgParams,
		body: json(
			z.object({
				email: z.string().trim().toLowerCase().email(),
				role: memberRoleSchema,
			}),
		),
	},
	responses: {
		200: {
			...json(
				z.object({
					member: z.object({ userId: z.string(), role: memberRoleSchema }),
				}),
			),
			description:
				"Existing verified user added. Project grants of project-scoped roles are managed in the dashboard.",
		},
		400: {
			description:
				"User unverified or deactivated, or a project-scoped role without enterprise access.",
		},
		404: { description: "Organization or user not found." },
		409: { description: "Already a member, or the seat limit is reached." },
	},
});

adminAccountControls.openapi(addMemberRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { email, role } = c.req.valid("json");
	const org = await findLiveOrganization(orgId);
	const user = await db.query.user.findFirst({
		where: { email: { eq: email } },
		columns: { id: true, emailVerified: true, status: true },
	});
	if (!user) {
		throw new HTTPException(404, {
			message: "No user with that email. They must sign up first.",
		});
	}
	if (!user.emailVerified) {
		throw new HTTPException(400, {
			message: "The user has not verified their email",
		});
	}
	if (user.status === "deactivated") {
		throw new HTTPException(400, { message: "The user is blocked" });
	}
	if (
		isProjectScopedRole(role) &&
		!hasOrganizationEnterpriseAccess(org.id, org.plan)
	) {
		throw new HTTPException(400, {
			message: "Project-scoped roles need an enterprise plan",
		});
	}
	const existing = await db.query.userOrganization.findFirst({
		where: { organizationId: { eq: orgId }, userId: { eq: user.id } },
		columns: { id: true },
	});
	if (existing) {
		throw new HTTPException(409, { message: "Already a member" });
	}
	const [{ members }] = await db
		.select({ members: count() })
		.from(tables.userOrganization)
		.where(eq(tables.userOrganization.organizationId, orgId));
	const seatLimit = resolveSeatLimit(
		org.id,
		org.plan,
		org.seats,
		await getPlatformConfig(),
	);
	if (members >= seatLimit) {
		throw new HTTPException(409, {
			message: `The organization is at its seat limit (${seatLimit}). Raise it on the Manage tab first.`,
		});
	}
	let membershipId: string;
	try {
		const [membership] = await withEnterpriseSeatForOrganization(
			orgId,
			user.id,
			async (tx) =>
				await tx
					.insert(tables.userOrganization)
					.values({ userId: user.id, organizationId: orgId, role })
					.returning({ id: tables.userOrganization.id }),
		);
		membershipId = membership.id;
	} catch (error) {
		if (error instanceof EnterpriseSeatLimitError) {
			throw new HTTPException(409, { message: error.message });
		}
		throw error;
	}
	if (role === "developer") {
		await recomputeUserTeam(user.id, orgId);
	}
	await logAuditEvent({
		organizationId: orgId,
		userId: admin.id,
		action: "team_member.add",
		resourceType: "team_member",
		resourceId: membershipId,
		metadata: {
			targetUserId: user.id,
			targetUserEmail: email,
			role,
			source: "admin",
		},
	});
	return c.json({ member: { userId: user.id, role } }, 200);
});

const transferOwnershipRoute = createRoute({
	operationId: "admin_transfer_organization_ownership",
	method: "post",
	path: "/organizations/{orgId}/transfer-ownership",
	request: {
		params: orgParams,
		body: json(z.object({ userId: z.string().min(1) })),
	},
	responses: {
		200: {
			...json(
				z.object({
					ownerUserId: z.string(),
					demotedUserIds: z.array(z.string()),
				}),
			),
			description: "Target is the sole owner; previous owners became admins.",
		},
		400: { description: "Target is already the sole owner or is blocked." },
		404: { description: "Organization or member not found." },
	},
});

adminAccountControls.openapi(transferOwnershipRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { userId } = c.req.valid("json");
	const org = await findLiveOrganization(orgId);
	const memberships = await db.query.userOrganization.findMany({
		where: { organizationId: { eq: orgId } },
		columns: { id: true, userId: true, role: true },
	});
	const target = memberships.find((m) => m.userId === userId);
	if (!target) {
		throw new HTTPException(404, {
			message: "The new owner must already be a member",
		});
	}
	const previousOwners = memberships.filter(
		(m) => m.role === "owner" && m.userId !== userId,
	);
	if (target.role === "owner" && previousOwners.length === 0) {
		throw new HTTPException(400, { message: "Already the sole owner" });
	}
	const targetUser = await findUserOrThrow(userId);
	if (targetUser.status === "deactivated") {
		throw new HTTPException(400, { message: "The new owner is blocked" });
	}
	await db.transaction(async (tx) => {
		await tx
			.update(tables.userOrganization)
			.set({ role: "owner", teamId: null, teamAssignmentSource: "manual" })
			.where(eq(tables.userOrganization.id, target.id));
		if (previousOwners.length > 0) {
			await tx
				.update(tables.userOrganization)
				.set({ role: "admin" })
				.where(
					inArray(
						tables.userOrganization.id,
						previousOwners.map((m) => m.id),
					),
				);
		}
	});
	await logAuditEvent({
		organizationId: orgId,
		userId: admin.id,
		action: "team_member.update",
		resourceType: "team_member",
		resourceId: target.id,
		metadata: {
			resourceName: org.name,
			targetUserId: userId,
			source: "admin",
			ownershipTransfer: true,
			demotedUserIds: previousOwners.map((m) => m.userId),
			changes: { role: { old: target.role, new: "owner" } },
		},
	});
	return c.json(
		{
			ownerUserId: userId,
			demotedUserIds: previousOwners.map((m) => m.userId),
		},
		200,
	);
});

// ---------------------------------------------------------------------------
// Temporary trust-tier boost
// ---------------------------------------------------------------------------

const boostRoute = createRoute({
	operationId: "admin_boost_organization",
	method: "post",
	path: "/organizations/{orgId}/boost",
	request: {
		params: orgParams,
		body: json(
			z.object({
				trustTier: z.number().int().min(0).max(4),
				until: untilSchema,
				reason: reasonSchema,
			}),
		),
	},
	responses: {
		200: {
			...json(
				z.object({
					trustTierOverride: z.number(),
					trustTierOverrideUntil: z.string(),
				}),
			),
			description:
				"Trust tier pinned until the time passes; the org then returns to the automatic ladder.",
		},
		400: { description: "Invalid time." },
		404: { description: "Organization not found or deleted." },
	},
});

adminAccountControls.openapi(boostRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { trustTier, until, reason } = c.req.valid("json");
	const untilDate = parseUntil(until);
	const org = await findLiveOrganization(orgId);
	await db
		.update(tables.organization)
		.set({ trustTierOverride: trustTier, trustTierOverrideUntil: untilDate })
		.where(eq(tables.organization.id, orgId));
	await invalidateOrganizationsCache([orgId]);
	await logAuditEvent({
		organizationId: orgId,
		userId: admin.id,
		action: "organization.manage",
		resourceType: "organization",
		resourceId: orgId,
		metadata: {
			resourceName: org.name,
			source: "admin",
			reason,
			changes: {
				trustTierOverride: { old: org.trustTierOverride, new: trustTier },
				trustTierOverrideUntil: {
					old: org.trustTierOverrideUntil?.toISOString() ?? null,
					new: untilDate.toISOString(),
				},
			},
		},
	});
	return c.json(
		{
			trustTierOverride: trustTier,
			trustTierOverrideUntil: untilDate.toISOString(),
		},
		200,
	);
});

const clearBoostRoute = createRoute({
	operationId: "admin_clear_organization_boost",
	method: "delete",
	path: "/organizations/{orgId}/boost",
	request: { params: orgParams },
	responses: {
		200: {
			...json(successSchema),
			description: "Boost removed; the org follows the automatic ladder.",
		},
		404: { description: "Organization not found." },
		409: {
			description:
				"No temporary boost (a permanent pin is managed on the Manage tab).",
		},
	},
});

adminAccountControls.openapi(clearBoostRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const org = await findOrganizationOrThrow(orgId);
	if (org.trustTierOverrideUntil === null) {
		throw new HTTPException(409, {
			message:
				"The organization has no temporary boost. Permanent pins are managed on the Manage tab.",
		});
	}
	await db
		.update(tables.organization)
		.set({ trustTierOverride: null, trustTierOverrideUntil: null })
		.where(eq(tables.organization.id, orgId));
	await invalidateOrganizationsCache([orgId]);
	await logAuditEvent({
		organizationId: orgId,
		userId: admin.id,
		action: "organization.manage",
		resourceType: "organization",
		resourceId: orgId,
		metadata: {
			resourceName: org.name,
			source: "admin",
			changes: {
				trustTierOverride: { old: org.trustTierOverride, new: null },
				trustTierOverrideUntil: {
					old: org.trustTierOverrideUntil.toISOString(),
					new: null,
				},
			},
		},
	});
	return c.json({ success: true as const }, 200);
});

// ---------------------------------------------------------------------------
// Organization controls snapshot
// ---------------------------------------------------------------------------

const controlsRoute = createRoute({
	operationId: "admin_get_organization_controls",
	method: "get",
	path: "/organizations/{orgId}/controls",
	request: { params: orgParams },
	responses: {
		200: {
			...json(
				z.object({
					status: z.string().nullable(),
					credits: z.string(),
					suspendedUntil: z.string().nullable().openapi({
						description: "Set only while the suspension is in force.",
					}),
					suspendReason: z.string().nullable(),
					boost: z
						.object({ trustTier: z.number(), until: z.string() })
						.nullable(),
					activeApiKeys: z.number(),
				}),
			),
			description: "Suspension, boost and key state for the admin controls.",
		},
		404: { description: "Organization not found." },
	},
});

adminAccountControls.openapi(controlsRoute, async (c) => {
	const { orgId } = c.req.valid("param");
	const org = await findOrganizationOrThrow(orgId);
	const [{ activeApiKeys }] = await db
		.select({ activeApiKeys: count() })
		.from(tables.apiKey)
		.innerJoin(tables.project, eq(tables.apiKey.projectId, tables.project.id))
		.where(
			and(
				eq(tables.project.organizationId, orgId),
				eq(tables.apiKey.status, "active"),
				ne(tables.project.status, "deleted"),
			),
		);
	const suspendedUntil = org.suspendedUntil;
	const suspended = isActive(suspendedUntil);
	const boostUntil = org.trustTierOverrideUntil;
	return c.json(
		{
			status: org.status,
			credits: org.credits,
			suspendedUntil: suspended ? suspendedUntil.toISOString() : null,
			suspendReason: suspended ? org.suspendReason : null,
			boost:
				org.trustTierOverride !== null && isActive(boostUntil)
					? {
							trustTier: org.trustTierOverride,
							until: boostUntil.toISOString(),
						}
					: null,
			activeApiKeys,
		},
		200,
	);
});

// ---------------------------------------------------------------------------
// Resend verification email
// ---------------------------------------------------------------------------

const resendVerificationRoute = createRoute({
	operationId: "admin_resend_verification_email",
	method: "post",
	path: "/users/{userId}/resend-verification",
	request: { params: userParams },
	responses: {
		200: {
			...json(z.object({ sent: z.literal(true) })),
			description: "Verification email sent through the sign-up flow.",
		},
		400: {
			description:
				"Email already verified, or verification email is disabled on this deployment.",
		},
		404: { description: "User not found." },
	},
});

adminAccountControls.openapi(resendVerificationRoute, async (c) => {
	const { userId } = c.req.valid("param");
	const user = await findUserOrThrow(userId);
	if (user.emailVerified) {
		throw new HTTPException(400, { message: "Email is already verified" });
	}
	if (!apiAuth.options.emailVerification?.sendVerificationEmail) {
		throw new HTTPException(400, {
			message: "Verification emails are disabled on this deployment",
		});
	}
	await apiAuth.api.sendVerificationEmail({
		body: {
			email: user.email,
			callbackURL: `${process.env.UI_URL ?? "http://localhost:3002"}/dashboard?emailVerified=true`,
		},
	});
	return c.json({ sent: true as const }, 200);
});
