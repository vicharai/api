import { docsBaseUrl } from "@/lib/base-url";
import { getLLMText } from "@/lib/get-llm-text";
import { source } from "@/lib/source";

export const dynamic = "force-dynamic";

const HEADER = `# Vichar — Full Documentation

> Vichar is an OpenAI-compatible API for models from many labs: one API key, one base URL, pay-per-token prepaid credits, and automatic provider failover. Current models and pricing: https://vichar.io/models

API base URL: https://api.vichar.io/v1 · Docs: ${docsBaseUrl} · Site: https://vichar.io

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
