import { describe, expect, test } from "vitest";

import {
	KNOWLEDGE_LLMS_TXT,
	KNOWLEDGE_SITEMAPS,
	isAllowedKnowledgeUrl,
	selectKnowledgeUrls,
} from "./chat-support-knowledge.js";

test("indexes every public product", () => {
	expect(KNOWLEDGE_SITEMAPS).toEqual([
		"https://app.vichar.io/sitemap.xml",
		"https://devpass.vichar.io/sitemap.xml",
		"https://docs.vichar.io/sitemap.xml",
	]);
	expect(KNOWLEDGE_LLMS_TXT).toEqual(["https://docs.vichar.io/llms.txt"]);
});

describe("isAllowedKnowledgeUrl", () => {
	test("allows the product domains over https", () => {
		expect(isAllowedKnowledgeUrl("https://app.vichar.io/quick-start")).toBe(
			true,
		);
		expect(isAllowedKnowledgeUrl("https://docs.vichar.io/v1_models")).toBe(
			true,
		);
		expect(isAllowedKnowledgeUrl("https://devpass.vichar.io/")).toBe(true);
		expect(isAllowedKnowledgeUrl("https://api.vichar.io/")).toBe(true);
	});

	test("rejects other hosts", () => {
		expect(isAllowedKnowledgeUrl("https://evil.com/")).toBe(false);
		expect(isAllowedKnowledgeUrl("https://vichar.io.evil.com/")).toBe(false);
		expect(isAllowedKnowledgeUrl("https://notvichar.io/")).toBe(false);
		expect(isAllowedKnowledgeUrl("https://preview.vichar.io/")).toBe(false);
		expect(
			isAllowedKnowledgeUrl("https://internal.vichar.io/public/share/x"),
		).toBe(false);
	});

	test("rejects non-https schemes", () => {
		expect(isAllowedKnowledgeUrl("http://app.vichar.io/")).toBe(false);
		expect(isAllowedKnowledgeUrl("file:///etc/passwd@app.vichar.io")).toBe(
			false,
		);
	});

	test("rejects malformed urls", () => {
		expect(isAllowedKnowledgeUrl("not a url")).toBe(false);
		expect(isAllowedKnowledgeUrl("")).toBe(false);
	});
});

describe("selectKnowledgeUrls", () => {
	test("keeps every product represented when one sitemap exceeds the limit", () => {
		const priorityUrls = [
			"https://docs.vichar.io/llms.txt",
			"https://app.vichar.io/llms.txt",
		];
		const mainUrls = Array.from(
			{ length: 700 },
			(_, index) => `https://app.vichar.io/models/model-${index}`,
		);
		const groups = [
			mainUrls,
			["https://devpass.vichar.io/guides"],
			["https://docs.vichar.io/quick-start"],
			["https://app.vichar.io/legal/terms"],
		];

		const selected = selectKnowledgeUrls(priorityUrls, groups, 600);

		expect(selected).toHaveLength(600);
		expect(selected.slice(0, 6)).toEqual([
			...priorityUrls,
			groups[1]![0],
			mainUrls[0],
			groups[2]![0],
			groups[3]![0],
		]);
		expect(selected).toEqual(selectKnowledgeUrls(priorityUrls, groups, 600));
	});

	test("deduplicates URLs", () => {
		const selected = selectKnowledgeUrls(
			["https://docs.vichar.io/llms.txt"],
			[
				["https://docs.vichar.io/llms.txt", "https://app.vichar.io/pricing"],
				["https://docs.vichar.io/quick-start"],
			],
		);

		expect(selected).toEqual([
			"https://docs.vichar.io/llms.txt",
			"https://docs.vichar.io/quick-start",
			"https://app.vichar.io/pricing",
		]);
	});

	test("keeps guides that follow a large catalogue section", () => {
		const catalogueUrls = Array.from(
			{ length: 700 },
			(_, index) => `https://app.vichar.io/models/model-${index}`,
		);
		const guideUrls = [
			"https://app.vichar.io/guides/devpass-code",
			"https://app.vichar.io/guides/codex-cli",
		];

		const selected = selectKnowledgeUrls(
			[],
			[[...catalogueUrls, ...guideUrls]],
			600,
		);

		expect(selected).toHaveLength(600);
		expect(selected.slice(0, guideUrls.length)).toEqual(guideUrls);
	});

	test("keeps later products when the first sitemap has 600 guides", () => {
		const mainGuides = Array.from(
			{ length: 600 },
			(_, index) => `https://app.vichar.io/guides/guide-${index}`,
		);
		const laterProducts = [
			"https://devpass.vichar.io/guides/getting-started",
			"https://docs.vichar.io/quick-start",
			"https://app.vichar.io/legal/terms",
		];

		const selected = selectKnowledgeUrls(
			[],
			[mainGuides, ...laterProducts.map((url) => [url])],
			600,
		);

		expect(selected).toHaveLength(600);
		expect(selected.slice(0, laterProducts.length + 1)).toEqual([
			mainGuides[0],
			...laterProducts,
		]);
	});
});
