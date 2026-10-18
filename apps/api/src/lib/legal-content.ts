import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { db, eq, tables } from "@llmgateway/db";

export const LEGAL_PAGES = ["terms", "privacy"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

export const legalSettingId = (page: LegalPage) => `legal_${page}`;

const BUNDLED_LEGAL_DIR = join("apps", "ui", "src", "content", "legal");

// The api runs from apps/api/{src,dist}; walk up to the repository root that
// ships the dashboard's bundled legal markdown.
function findBundledLegalDir(): string | null {
	let dir = dirname(fileURLToPath(import.meta.url));
	for (let depth = 0; depth < 6; depth++) {
		const candidate = join(dir, BUNDLED_LEGAL_DIR);
		if (existsSync(candidate)) {
			return candidate;
		}
		const parent = dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}
	return null;
}

function stripFrontmatter(markdown: string): string {
	return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trimStart();
}

/**
 * The dashboard's bundled markdown for a legal page, or null when this
 * deployment does not ship the dashboard sources.
 */
export async function getDefaultLegalMarkdown(
	page: LegalPage,
): Promise<string | null> {
	const dir = findBundledLegalDir();
	if (!dir) {
		return null;
	}
	return stripFrontmatter(await readFile(join(dir, `${page}.md`), "utf8"));
}

export async function getLegalOverride(
	page: LegalPage,
): Promise<{ markdown: string; updatedAt: Date } | null> {
	const row = await db.query.systemSetting.findFirst({
		where: { id: { eq: legalSettingId(page) } },
	});
	return row?.value ? { markdown: row.value, updatedAt: row.updatedAt } : null;
}

export async function setLegalOverride(
	page: LegalPage,
	markdown: string | null,
): Promise<void> {
	const id = legalSettingId(page);
	if (markdown === null) {
		await db
			.delete(tables.systemSetting)
			.where(eq(tables.systemSetting.id, id));
		return;
	}
	await db
		.insert(tables.systemSetting)
		.values({ id, enabled: true, value: markdown })
		.onConflictDoUpdate({
			target: tables.systemSetting.id,
			set: { value: markdown, enabled: true, updatedAt: new Date() },
		});
}
