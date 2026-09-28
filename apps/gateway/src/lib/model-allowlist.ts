import { logger } from "@llmgateway/logger";

/**
 * Deployment-level model allowlist, driven by GATEWAY_MODEL_ALLOWLIST.
 *
 * Curated deployments (e.g. Vichar) sell only their own catalogue entries even
 * when other providers happen to be configured — a mock or test provider key
 * must never make a non-curated model callable, or its canned responses would
 * bill at real list prices. Entries are comma-separated model ids; a trailing
 * `*` marks a prefix match (e.g. `vichar-*`). Unset/empty means no restriction,
 * the default for the uncurated deployment.
 */
function parseAllowlist(): string[] {
	return (process.env.GATEWAY_MODEL_ALLOWLIST ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

let cachedEntries: string[] | null = null;

export function getModelAllowlist(): string[] {
	if (cachedEntries === null) {
		cachedEntries = parseAllowlist();
		if (cachedEntries.length > 0) {
			logger.info("Model allowlist active", {
				entries: cachedEntries,
			});
		}
	}
	return cachedEntries;
}

/** Routing pseudo-models stay dispatchable; their candidate pool is filtered separately. */
const ROUTING_MODEL_IDS = new Set(["auto", "smart", "custom"]);

export function isModelAllowedByDeployment(modelId: string): boolean {
	const entries = getModelAllowlist();
	if (entries.length === 0 || ROUTING_MODEL_IDS.has(modelId)) {
		return true;
	}
	return entries.some((entry) =>
		entry.endsWith("*")
			? modelId.startsWith(entry.slice(0, -1))
			: modelId === entry,
	);
}

/** Visible for tests. */
export function resetModelAllowlistCacheForTests(): void {
	cachedEntries = null;
}
