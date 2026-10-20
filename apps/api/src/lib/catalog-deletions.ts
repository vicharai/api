import { db, tables } from "@llmgateway/db";

export interface CatalogDeletionSets {
	models: Set<string>;
	providers: Set<string>;
}

/** Admin soft-deleted model and provider ids. */
export async function loadCatalogDeletionSets(): Promise<CatalogDeletionSets> {
	const rows = await db
		.select({
			scope: tables.catalogDeletion.scope,
			target: tables.catalogDeletion.target,
		})
		.from(tables.catalogDeletion);
	const sets: CatalogDeletionSets = { models: new Set(), providers: new Set() };
	for (const row of rows) {
		(row.scope === "model" ? sets.models : sets.providers).add(row.target);
	}
	return sets;
}
