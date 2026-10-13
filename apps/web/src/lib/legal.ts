import { readFileSync } from "node:fs";
import { join } from "node:path";

const LEGAL_DIR = join(process.cwd(), "..", "ui", "src", "content", "legal");

export const LEGAL_SLUGS = ["terms", "privacy", "sub-processors"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const LEGAL_TITLES: Record<LegalSlug, string> = {
	terms: "Terms of Use",
	privacy: "Privacy Policy",
	"sub-processors": "Sub-processors",
};

export function getLegalMarkdown(slug: LegalSlug): string {
	const raw = readFileSync(join(LEGAL_DIR, `${slug}.md`), "utf8");
	// Strip YAML frontmatter — the title/date live in page metadata instead.
	return raw
		.replace(/^---\n[\s\S]*?^---\n/m, "")
		.replace(/^\s*#\s+[^\n]+\n/, "");
}
