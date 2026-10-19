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
function parseEntries(raw: string | undefined): string[] {
	return (raw ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function matchesEntries(modelId: string, entries: string[]): boolean {
	return entries.some((entry) =>
		entry.endsWith("*")
			? modelId.startsWith(entry.slice(0, -1))
			: modelId === entry,
	);
}

let cachedAllowlist: string[] | null = null;
let cachedDenylist: string[] | null = null;

export function getModelAllowlist(): string[] {
	if (cachedAllowlist === null) {
		cachedAllowlist = parseEntries(process.env.GATEWAY_MODEL_ALLOWLIST);
		if (cachedAllowlist.length > 0) {
			logger.info("Model allowlist active", {
				entries: cachedAllowlist,
			});
		}
	}
	return cachedAllowlist;
}

/**
 * GATEWAY_MODEL_DENYLIST removes matching model ids from every surface —
 * listing, direct resolution and auto/smart candidate pools — even when a
 * configured provider would otherwise expose them. Same `*` prefix syntax
 * as the allowlist. Used to retire internal slugs (e.g. `vichar-*`).
 */
export function getModelDenylist(): string[] {
	if (cachedDenylist === null) {
		cachedDenylist = parseEntries(process.env.GATEWAY_MODEL_DENYLIST);
		if (cachedDenylist.length > 0) {
			logger.info("Model denylist active", {
				entries: cachedDenylist,
			});
		}
	}
	return cachedDenylist;
}

/** Routing pseudo-models stay dispatchable; their candidate pool is filtered separately. */
const ROUTING_MODEL_IDS = new Set(["auto", "smart", "custom"]);

export function isModelDeniedByDeployment(modelId: string): boolean {
	return (
		!ROUTING_MODEL_IDS.has(modelId) &&
		matchesEntries(modelId, getModelDenylist())
	);
}

export function isModelAllowedByDeployment(modelId: string): boolean {
	if (isModelDeniedByDeployment(modelId)) {
		return false;
	}
	const entries = getModelAllowlist();
	if (entries.length === 0 || ROUTING_MODEL_IDS.has(modelId)) {
		return true;
	}
	return matchesEntries(modelId, entries);
}

/** Visible for tests. */
export function resetModelAllowlistCacheForTests(): void {
	cachedAllowlist = null;
	cachedDenylist = null;
}
