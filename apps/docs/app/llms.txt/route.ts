import { docsBaseUrl } from "@/lib/base-url";
import { source } from "@/lib/source";

import type { InferPageType } from "fumadocs-core/source";

export const dynamic = "force-dynamic";

const DOCS_URL = docsBaseUrl;

type Page = InferPageType<typeof source>;

// Pages are grouped by their first URL segment; OpenAPI pages (v1_*, health)
// go under "API Reference".
const SECTIONS: { key: string; title: string }[] = [
	{ key: "", title: "Docs" },
	{ key: "api", title: "API Reference" },
];

function sectionKey(page: Page): string {
	const first = page.url.split("/").filter(Boolean)[0] ?? "";
	if (first.startsWith("v1") || first === "health") {
		return "api";
	}
	return SECTIONS.some((s) => s.key === first) ? first : "";
}

export async function GET() {
	const pages = source.getPages();

	const grouped = new Map<string, string[]>();
	for (const page of pages) {
		const key = sectionKey(page);
		const line = `- [${page.data.title}](${`${DOCS_URL}${page.url}`})${page.data.description ? `: ${page.data.description}` : ""}`;
		const existing = grouped.get(key);
		if (existing) {
			existing.push(line);
		} else {
			grouped.set(key, [line]);
		}
	}

	const docSections = SECTIONS.filter((s) => grouped.has(s.key))
		.map((s) => `## ${s.title}\n\n${grouped.get(s.key)!.join("\n")}`)
		.join("\n\n");

	const content = `# Vichar Docs

> Vichar is an OpenAI-compatible API for models from many labs: one API key, one base URL (https://api.vichar.io/v1), pay-per-token prepaid credits, and automatic provider failover. Prompts and responses are not stored by default.

Use the live [model catalogue](https://vichar.io/models) for availability, pricing, and capabilities. Dashboard: https://app.vichar.io. Support: support@vichar.io.

${docSections}`;

	return new Response(content, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
