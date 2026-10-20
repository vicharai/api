import {
	db,
	eq,
	inArray,
	invalidateOrganizationsCache,
	tables,
} from "@llmgateway/db";

/**
 * Suspends an organization until `until`: the gateway rejects its requests
 * (`getOrganizationBlockReason`) until then. Evicts the cached org row so it
 * applies at once. Returns the previous `suspendedUntil`.
 */
export async function suspendOrganizationUntil(options: {
	organizationId: string;
	until: Date;
	reason: string;
}): Promise<{ previousUntil: Date | null }> {
	const [previous] = await db
		.select({ suspendedUntil: tables.organization.suspendedUntil })
		.from(tables.organization)
		.where(eq(tables.organization.id, options.organizationId))
		.limit(1);
	await db
		.update(tables.organization)
		.set({ suspendedUntil: options.until, suspendReason: options.reason })
		.where(eq(tables.organization.id, options.organizationId));
	await invalidateOrganizationsCache([options.organizationId]);
	return { previousUntil: previous?.suspendedUntil ?? null };
}

/** Lifts a suspension set by {@link suspendOrganizationUntil}. */
export async function liftOrganizationSuspensions(
	organizationIds: string[],
): Promise<void> {
	if (organizationIds.length === 0) {
		return;
	}
	await db
		.update(tables.organization)
		.set({ suspendedUntil: null, suspendReason: null })
		.where(inArray(tables.organization.id, organizationIds));
	await invalidateOrganizationsCache(organizationIds);
}
