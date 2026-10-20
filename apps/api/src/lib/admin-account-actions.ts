import { logAuditEvent } from "@vichar/audit";
import { Decimal } from "decimal.js";
import { HTTPException } from "hono/http-exception";

import { deleteResendContact } from "@/auth/config.js";
import {
	cancelOrganizationSubscriptions,
	getCancelledOrganizationPlanState,
	tearDownSoleMemberOrganizations,
} from "@/lib/account-deletion.js";
import { isAdminEmail } from "@/middleware/admin.js";

import {
	and,
	cdb,
	db,
	eq,
	inArray,
	invalidateOrganizationsCache,
	sql,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

/** ADMIN_EMAILS owners and admin_member holders. */
export async function isStaffUser(user: {
	id: string;
	email: string;
}): Promise<boolean> {
	if (isAdminEmail(user.email)) {
		return true;
	}
	const member = await db.query.adminMember.findFirst({
		where: { userId: { eq: user.id } },
		columns: { userId: true },
	});
	return member !== undefined;
}

export async function findUserOrThrow(userId: string) {
	const user = await db.query.user.findFirst({
		where: { id: { eq: userId } },
	});
	if (!user) {
		throw new HTTPException(404, { message: "User not found" });
	}
	return user;
}

export async function findOrganizationOrThrow(orgId: string) {
	const org = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
	});
	if (!org) {
		throw new HTTPException(404, { message: "Organization not found" });
	}
	return org;
}

/**
 * Loads a user an admin action may target: refuses the caller and staff,
 * whose lockout would take the panel down with them.
 */
export async function findTargetUser(
	adminId: string,
	userId: string,
	action: { verb: string; past: string },
) {
	if (userId === adminId) {
		throw new HTTPException(400, {
			message: `You cannot ${action.verb} yourself`,
		});
	}
	const target = await findUserOrThrow(userId);
	if (await isStaffUser(target)) {
		throw new HTTPException(400, {
			message: `Admins cannot be ${action.past}. Remove their admin role first.`,
		});
	}
	return target;
}

/**
 * Deletes a user account. Organizations they were the last member of are
 * closed and their subscriptions cancelled.
 */
export async function deleteUserAsAdmin(
	adminId: string,
	userId: string,
	reason: string,
): Promise<{ closedOrganizations: number }> {
	const target = await findTargetUser(adminId, userId, {
		verb: "delete",
		past: "deleted",
	});
	const closed = await tearDownSoleMemberOrganizations(userId);
	await db.delete(tables.user).where(eq(tables.user.id, userId));
	if (closed.length > 0) {
		await invalidateOrganizationsCache(closed.map((org) => org.id));
	}
	await deleteResendContact(target.email);
	logger.info("Admin deleted user", {
		userId,
		adminUserId: adminId,
		reason,
		closedOrganizations: closed.length,
	});
	return { closedOrganizations: closed.length };
}

async function organizationProjectIds(orgId: string): Promise<string[]> {
	const projects = await db.query.project.findMany({
		where: { organizationId: { eq: orgId } },
		columns: { id: true },
	});
	return projects.map((p) => p.id);
}

/**
 * Moves every key of the organization in `from` to `to`. The cached client
 * evicts the gateway's key lookups on write.
 */
export async function setOrganizationApiKeysStatus(
	orgId: string,
	from: ("active" | "inactive")[],
	to: "inactive" | "deleted",
): Promise<number> {
	const projectIds = await organizationProjectIds(orgId);
	if (projectIds.length === 0) {
		return 0;
	}
	const rows = await cdb
		.update(tables.apiKey)
		.set({ status: to })
		.where(
			and(
				inArray(tables.apiKey.projectId, projectIds),
				inArray(tables.apiKey.status, from),
			),
		)
		.returning({ id: tables.apiKey.id });
	return rows.length;
}

/** Deactivates every active key the user created, in any organization. */
export async function deactivateUserApiKeys(userId: string): Promise<number> {
	const rows = await cdb
		.update(tables.apiKey)
		.set({ status: "inactive" })
		.where(
			and(
				eq(tables.apiKey.createdBy, userId),
				eq(tables.apiKey.status, "active"),
			),
		)
		.returning({ id: tables.apiKey.id });
	return rows.length;
}

export interface OrganizationDeletionResult {
	cancelledSubscriptionIds: string[];
	revokedApiKeys: number;
	forfeitedCredits: string | null;
}

/**
 * Soft-deletes an organization from the admin panel: cancels subscriptions
 * and auto top-up, revokes every API key and marks it deleted. A positive
 * balance is only forfeited when `forfeitBalance` is set, through a
 * `credit_adjustment` that zeroes it. Members keep their accounts.
 */
export async function deleteOrganizationAsAdmin({
	orgId,
	admin,
	reason,
	forfeitBalance,
}: {
	orgId: string;
	admin: { id: string };
	reason: string;
	forfeitBalance: boolean;
}): Promise<OrganizationDeletionResult> {
	const org = await findOrganizationOrThrow(orgId);
	if (org.status === "deleted") {
		throw new HTTPException(409, {
			message: "Organization is already deleted",
		});
	}
	const adminMembership = await db.query.userOrganization.findFirst({
		where: { organizationId: { eq: orgId }, userId: { eq: admin.id } },
		columns: { id: true },
	});
	if (adminMembership) {
		throw new HTTPException(400, {
			message: "You are a member of this organization",
		});
	}

	const credits = new Decimal(org.credits);
	if (credits.gt(0) && !forfeitBalance) {
		throw new HTTPException(409, {
			message: `Organization has a positive balance (${credits.toFixed(2)}). Confirm forfeiting it to delete.`,
		});
	}
	const forfeit = credits.gt(0);

	const cancelledSubscriptionIds = await cancelOrganizationSubscriptions(org);

	const deleted = await db.transaction(async (tx) => {
		// Conditional on the balance read above, so a concurrent top-up refuses
		// the delete instead of being forfeited unseen.
		const rows = await tx
			.update(tables.organization)
			.set({
				status: "deleted",
				...getCancelledOrganizationPlanState(),
				...(forfeit ? { credits: "0" } : {}),
			})
			.where(
				and(
					eq(tables.organization.id, orgId),
					sql`${tables.organization.status} IS DISTINCT FROM 'deleted'`,
					eq(tables.organization.credits, org.credits),
				),
			)
			.returning({ id: tables.organization.id });
		if (rows.length === 0) {
			return false;
		}
		if (forfeit) {
			await tx.insert(tables.transaction).values({
				organizationId: orgId,
				type: "credit_adjustment",
				creditAmount: credits.negated().toString(),
				amount: null,
				currency: "USD",
				status: "completed",
				description: `Balance forfeited on deletion by administrator: ${reason}`,
			});
		}
		return true;
	});
	if (!deleted) {
		throw new HTTPException(409, {
			message:
				"The organization changed while it was being deleted. Refresh and try again.",
		});
	}

	const revokedApiKeys = await setOrganizationApiKeysStatus(
		orgId,
		["active", "inactive"],
		"deleted",
	);
	await invalidateOrganizationsCache([orgId]);

	await logAuditEvent({
		organizationId: orgId,
		userId: admin.id,
		action: "organization.delete",
		resourceType: "organization",
		resourceId: orgId,
		metadata: {
			resourceName: org.name,
			source: "admin",
			reason,
			previousStatus: org.status ?? "active",
			cancelledSubscriptionIds,
			revokedApiKeys,
			forfeitedCredits: forfeit ? credits.toString() : null,
		},
	});

	return {
		cancelledSubscriptionIds,
		revokedApiKeys,
		forfeitedCredits: forfeit ? credits.toString() : null,
	};
}

/** Deletes the sessions of the given users; returns how many were removed. */
export async function deleteSessionsOf(userIds: string[]): Promise<number> {
	if (userIds.length === 0) {
		return 0;
	}
	const rows = await db
		.delete(tables.session)
		.where(inArray(tables.session.userId, userIds))
		.returning({ id: tables.session.id });
	return rows.length;
}

/** Org members split into staff (never signed out by bulk actions) and others. */
export async function organizationMemberIds(
	orgId: string,
): Promise<{ members: string[]; staff: string[] }> {
	const rows = await db
		.select({
			userId: tables.userOrganization.userId,
			email: tables.user.email,
		})
		.from(tables.userOrganization)
		.innerJoin(tables.user, eq(tables.userOrganization.userId, tables.user.id))
		.where(eq(tables.userOrganization.organizationId, orgId));
	const staffMembers = rows.length
		? await db.query.adminMember.findMany({
				where: { userId: { in: rows.map((r) => r.userId) } },
				columns: { userId: true },
			})
		: [];
	const staffIds = new Set(staffMembers.map((m) => m.userId));
	const members: string[] = [];
	const staff: string[] = [];
	for (const row of rows) {
		if (staffIds.has(row.userId) || isAdminEmail(row.email)) {
			staff.push(row.userId);
		} else {
			members.push(row.userId);
		}
	}
	return { members, staff };
}
