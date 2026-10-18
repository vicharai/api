import {
	and,
	db,
	eq,
	inArray,
	tables,
	type AdminTargetType,
} from "@llmgateway/db";

/** Tags per target id, each list sorted. */
export async function getAdminTags(
	targetType: AdminTargetType,
	targetIds: string[],
): Promise<Map<string, string[]>> {
	const byTarget = new Map<string, string[]>();
	if (targetIds.length === 0) {
		return byTarget;
	}
	const rows = await db
		.select({ targetId: tables.adminTag.targetId, tag: tables.adminTag.tag })
		.from(tables.adminTag)
		.where(
			and(
				eq(tables.adminTag.targetType, targetType),
				inArray(tables.adminTag.targetId, targetIds),
			),
		)
		.orderBy(tables.adminTag.tag);
	for (const row of rows) {
		const list = byTarget.get(row.targetId) ?? [];
		list.push(row.tag);
		byTarget.set(row.targetId, list);
	}
	return byTarget;
}

/** Subquery of target ids carrying a tag, for `inArray` filters. */
export function adminTagTargetIds(targetType: AdminTargetType, tag: string) {
	return db
		.select({ targetId: tables.adminTag.targetId })
		.from(tables.adminTag)
		.where(
			and(
				eq(tables.adminTag.targetType, targetType),
				eq(tables.adminTag.tag, normalizeAdminTag(tag)),
			),
		);
}

export function normalizeAdminTag(tag: string): string {
	return tag.trim().toLowerCase().replace(/\s+/g, "-");
}
