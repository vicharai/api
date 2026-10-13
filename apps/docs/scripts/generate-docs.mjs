import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createOpenAPI } from "fumadocs-openapi/server";
import { generateFiles } from "fumadocs-openapi";
import { rimraf } from "rimraf";

const openapi = createOpenAPI({
	input: ["./openapi.json"],
	proxyUrl: "/api/proxy",
});

const out = "./content/(gateway)/(api)";

async function addDescriptionsFromContent() {
	const entries = await readdir(out);
	for (const entry of entries) {
		if (!entry.endsWith(".mdx") || entry === "index.mdx") {
			continue;
		}
		const filePath = join(out, entry);
		const source = await readFile(filePath, "utf8");
		const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		if (!match) {
			continue;
		}
		const [, frontmatter, body] = match;
		if (/\ndescription:\s/.test(`\n${frontmatter}`)) {
			continue;
		}
		const contentMatch = frontmatter.match(
			/structuredData:[\s\S]*?contents:\n\s+- content:\s+(.+)$/m,
		);
		const description = contentMatch?.[1]?.trim();
		if (!description) {
			continue;
		}
		const sanitized = description.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		const updatedFrontmatter = `title: ${
			frontmatter.match(/^title:\s*(.+)$/m)?.[1] ?? entry
		}\ndescription: "${sanitized}"\n${frontmatter
			.split("\n")
			.filter((line) => !line.startsWith("title:"))
			.join("\n")}`;
		await writeFile(filePath, `---\n${updatedFrontmatter}\n---\n${body}`);
	}
}

async function generate() {
	await rimraf(out, {
		filter(v) {
			return !v.endsWith("index.mdx") && !v.endsWith("meta.json");
		},
	});

	await cp("../gateway/openapi.json", "./openapi.json");

	const allowed = new Set([
		"v1_chat_completions.mdx",
		"v1_messages.mdx",
		"v1_models.mdx",
		"v1_key_retrieve.mdx",
		"health.mdx",
	]);
	await generateFiles({
		input: openapi,
		output: out,
		includeDescription: true,
	});
	// Keep only the endpoints Vichar actually serves to customers.
	for (const entry of await readdir(out)) {
		if (entry === "index.mdx" || entry === "meta.json" || allowed.has(entry)) {
			continue;
		}
		await rimraf(join(out, entry));
	}

	await addDescriptionsFromContent();
}

void generate();
