import { site } from "./site";

export interface CatalogModel {
	id: string;
	name: string;
	displayName: string;
	description: string;
	family: string;
	contextLength: number;
	maxOutput: number | null;
	inputPerMillion: number | null;
	outputPerMillion: number | null;
	/** Experimental tier: availability and rate limits may vary. */
	free: boolean;
	supportedParameters: string[];
}

interface ApiModel {
	id: string;
	name?: string;
	display_name?: string;
	description?: string;
	family?: string;
	context_length?: number;
	max_output?: number;
	pricing?: { prompt?: string; completion?: string };
	free?: boolean;
	supported_parameters?: string[];
}

/** Fetch the public model catalogue at build time; fails the build on error.
 * `VICHAR_MODELS_JSON` reads the response body from a local file instead, for
 * build-time verification against a local catalogue. `VICHAR_MODELS_URL`
 * overrides the endpoint. */
export async function fetchCatalog(): Promise<CatalogModel[]> {
	const jsonPath = process.env.VICHAR_MODELS_JSON;
	const endpoint = process.env.VICHAR_MODELS_URL ?? site.urls.apiModels;
	if (jsonPath) {
		const { readFileSync } = await import("node:fs");
		const body = JSON.parse(readFileSync(jsonPath, "utf8")) as {
			data?: ApiModel[];
		};
		return mapCatalog(body);
	}
	const res = await fetch(endpoint);
	if (!res.ok) {
		throw new Error(
			`Failed to fetch model catalogue from ${endpoint}: HTTP ${res.status}`,
		);
	}
	const body = (await res.json()) as { data?: ApiModel[] };
	return mapCatalog(body);
}

function mapCatalog(body: { data?: ApiModel[] }): CatalogModel[] {
	const raw = body.data;
	if (!Array.isArray(raw) || raw.length === 0) {
		throw new Error(
			`Model catalogue at ${site.urls.apiModels} returned no models`,
		);
	}

	const models: CatalogModel[] = [];
	for (const m of raw) {
		if (!m.id || m.id.startsWith("vichar-failover")) {
			continue;
		}
		const pricing = m.pricing ?? {};
		const input = pricing.prompt ? Number(pricing.prompt) * 1e6 : null;
		const output = pricing.completion ? Number(pricing.completion) * 1e6 : null;
		models.push({
			id: m.id,
			name: m.name ?? m.id,
			displayName: m.display_name ?? m.name ?? m.id,
			description: m.description ?? "",
			family: m.family ?? "",
			contextLength: m.context_length ?? 0,
			maxOutput: m.max_output ?? null,
			inputPerMillion: input,
			outputPerMillion: output,
			free: m.free === true || /\bexperimental\b/i.test(m.description ?? ""),
			supportedParameters: m.supported_parameters ?? [],
		});
	}
	if (models.length === 0) {
		throw new Error("Model catalogue is empty after filtering");
	}
	return models;
}

export function formatPrice(perMillion: number | null): string {
	if (perMillion === null || Number.isNaN(perMillion)) {
		return "—";
	}
	if (perMillion === 0) {
		return "Free";
	}
	return `$${perMillion.toFixed(2)}`;
}

export function formatContext(length: number): string {
	if (!length) {
		return "—";
	}
	if (length >= 1_000_000) {
		return `${Number((length / 1_000_000).toFixed(1))}M`;
	}
	return `${Math.round(length / 1000)}k`;
}

/** Map a catalogue model to the lab that made it (display names carry the real
 * lab even though catalogue ids are vichar-* aliases). */
export function labForModel(m: CatalogModel): string {
	const key = `${m.family} ${m.id} ${m.displayName}`.toLowerCase();
	for (const [needle, lab] of [
		["gpt", "openai"],
		["sonnet", "anthropic"],
		["claude", "anthropic"],
		["openai", "openai"],
		["deepseek", "deepseek"],
		["moonshot", "moonshot"],
		["kimi", "moonshot"],
		["qwen", "alibaba"],
		["alibaba", "alibaba"],
		["gemini", "google-ai-studio"],
		["llama", "meta"],
		["mistral", "mistral"],
		["grok", "xai"],
		["xai", "xai"],
		["glm", "zai"],
		["nemotron", "nvidia"],
		["lfm", "liquid"],
		["laguna", "poolside"],
		["north", "cohere"],
	] as const) {
		if (key.includes(needle)) {
			return lab;
		}
	}
	return "";
}

export const LAB_LABELS: Record<string, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	deepseek: "DeepSeek",
	moonshot: "Moonshot",
	alibaba: "Alibaba",
	"google-ai-studio": "Google",
	meta: "Meta",
	mistral: "Mistral",
	xai: "xAI",
	zai: "Z.ai",
	nvidia: "NVIDIA",
	liquid: "Liquid",
	poolside: "Poolside",
	cohere: "Cohere",
};
