import { and, cdb, db, eq, inArray, tables } from "@llmgateway/db";

/**
 * Mirrors a user's flag onto the organizations they are the only member of, so
 * the gateway and the payment routes can reject them from the organization row
 * alone. Shared organizations are deliberately left untouched: one flagged
 * member must not take a whole team offline.
 *
 * Returns the organization ids that now carry the flag.
 */
export async function syncUserRiskFlagToOrganizations(
	userId: string,
): Promise<string[]> {
	const memberships = await db.query.userOrganization.findMany({
		where: { userId: { eq: userId } },
		columns: { organizationId: true },
	});
	const organizationIds = memberships.map((m) => m.organizationId);
	if (!organizationIds.length) {
		return [];
	}

	const allMembers = await db.query.userOrganization.findMany({
		where: { organizationId: { in: organizationIds } },
		columns: { organizationId: true, userId: true },
	});
	const soleMemberOrganizationIds = organizationIds.filter(
		(organizationId) =>
			allMembers.filter((m) => m.organizationId === organizationId).length ===
			1,
	);
	if (!soleMemberOrganizationIds.length) {
		return [];
	}

	// Written through cdb so its onMutate busts the gateway's cached
	// organization reads; a plain `db` write would leave the block ineffective
	// until the cache expired.
	await cdb
		.update(tables.organization)
		.set({ riskFlagged: true })
		.where(inArray(tables.organization.id, soleMemberOrganizationIds));

	return soleMemberOrganizationIds;
}

export type FlagOutcome = "flagged" | "already_flagged" | "skipped_approved";

/**
 * Raises the high-risk flag from a fraud rule. Admin-approved users are left
 * alone: approval is a human decision a rule must not silently undo.
 */
export async function flagUserFromFraudRule(
	userId: string,
): Promise<{ outcome: FlagOutcome; organizationIds: string[] } | null> {
	const user = await db.query.user.findFirst({
		where: { id: { eq: userId } },
		columns: { riskStatus: true },
	});
	if (!user) {
		return null;
	}
	if (user.riskStatus === "approved") {
		return { outcome: "skipped_approved", organizationIds: [] };
	}
	if (user.riskStatus === "flagged") {
		return { outcome: "already_flagged", organizationIds: [] };
	}
	await db
		.update(tables.user)
		.set({
			riskStatus: "flagged",
			riskFlaggedAt: new Date(),
			riskFlagSource: "fraud_rule",
			riskArchivedAt: null,
		})
		.where(and(eq(tables.user.id, userId), eq(tables.user.riskStatus, "none")));
	return {
		outcome: "flagged",
		organizationIds: await syncUserRiskFlagToOrganizations(userId),
	};
}

/** Sets `organization.riskFlagged`, which the gateway and payments reject. */
export async function setOrganizationRiskFlag(
	organizationId: string,
	flagged: boolean,
): Promise<FlagOutcome | "cleared" | null> {
	const org = await db.query.organization.findFirst({
		where: { id: { eq: organizationId } },
		columns: { riskFlagged: true },
	});
	if (!org) {
		return null;
	}
	if (org.riskFlagged === flagged) {
		return flagged ? "already_flagged" : "cleared";
	}
	await cdb
		.update(tables.organization)
		.set({ riskFlagged: flagged })
		.where(eq(tables.organization.id, organizationId));
	return flagged ? "flagged" : "cleared";
}
