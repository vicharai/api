import { CATALOG_SNAPSHOT } from "./catalog-snapshot";
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

export interface ApiModel {
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

/** The live catalogue, or the bundled snapshot when the live one is empty, so
 * marketing pages always have real models to show. */
export async function fetchDisplayCatalog(): Promise<CatalogModel[]> {
	const live = await fetchCatalog();
	return live.length > 0 ? live : mapCatalog(CATALOG_SNAPSHOT);
}

function mapCatalog(body: { data?: ApiModel[] }): CatalogModel[] {
	const raw = body.data;
	// An empty catalogue is a legitimate state on admin-curated deployments —
	// only a malformed response fails the build.
	if (!Array.isArray(raw)) {
		throw new Error(
			`Model catalogue at ${site.urls.apiModels} returned malformed data`,
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

/** Map a catalogue model to the lab that made it; the key matches its logo id
 * in `/provider-logos.svg` where one exists. */
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
		["sea-lion", "aisingapore"],
		["gemini", "google-ai-studio"],
		["gemma", "google-ai-studio"],
		["google", "google-ai-studio"],
		["llama", "meta"],
		["meta", "meta"],
		["mistral", "mistral"],
		["grok", "xai"],
		["xai", "xai"],
		["glm", "zai"],
		["nemotron", "nvidia"],
		["nvidia", "nvidia"],
		["granite", "ibm"],
		["ibm", "ibm"],
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
	ibm: "IBM",
	aisingapore: "AI Singapore",
};

/** Display order for labs: frontier labs first. */
const LAB_ORDER = [
	"openai",
	"anthropic",
	"google-ai-studio",
	"xai",
	"deepseek",
	"moonshot",
	"zai",
	"alibaba",
	"meta",
	"mistral",
	"nvidia",
];

function labRank(lab: string): number {
	const i = LAB_ORDER.indexOf(lab);
	return i === -1 ? LAB_ORDER.length : i;
}

/** Labs present in the catalogue, frontier labs first. */
export function labsIn(models: CatalogModel[]): string[] {
	return [...new Set(models.map(labForModel).filter(Boolean))].sort(
		(a, b) => labRank(a) - labRank(b),
	);
}

/** Current frontier and most-used models, shown first when present. */
const PREFERRED = [
	"kimi-k3",
	"deepseek-v4-pro",
	"glm-5.3",
	"qwen3.8-27b",
	"gpt-oss-120b",
	"llama-4-scout-17b-instruct",
	"gemma-4-26b-a4b-it",
	"nemotron-3-super-120b",
];

/** Models to feature: preferred ids first, then the priciest paid model of
 * each lab not yet covered, then the rest by output price. */
export function featuredModels(
	models: CatalogModel[],
	count: number,
): CatalogModel[] {
	const paid = models
		.filter((m) => !m.free)
		.sort((a, b) => (b.outputPerMillion ?? 0) - (a.outputPerMillion ?? 0));
	const preferred = PREFERRED.flatMap((id) => {
		const m = paid.find((x) => x.id === id);
		return m ? [m] : [];
	});
	const covered = new Set(preferred.map(labForModel));
	const flagships = labsIn(paid)
		.filter((lab) => !covered.has(lab))
		.flatMap((lab) => {
			const top = paid.find((m) => labForModel(m) === lab);
			return top ? [top] : [];
		});
	const picked = [...preferred, ...flagships];
	const rest = paid.filter((m) => !picked.includes(m));
	return [...picked, ...rest].slice(0, count);
}
