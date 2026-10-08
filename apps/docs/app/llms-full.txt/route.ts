import { docsBaseUrl } from "@/lib/base-url";
import { getLLMText } from "@/lib/get-llm-text";
import { source } from "@/lib/source";

export const dynamic = "force-dynamic";

const HEADER = `# Vichar — Full Documentation

> Vichar is an open-source, OpenAI-compatible API gateway for routing, managing, and analyzing requests across LLM providers. Use one API key, track usage and cost, configure caching and guardrails, and self-host or use the managed cloud. Current models and pricing: https://app.vichar.io/models

API base URL: https://api.vichar.io/v1 · Docs: ${docsBaseUrl} · Site: https://app.vichar.io

This file concatenates the full text of every documentation page below.`;

export async function GET() {
	const scan = source.getPages().map(getLLMText);
	const scanned = await Promise.all(scan);

	return new Response([HEADER, ...scanned].join("\n\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
