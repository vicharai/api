import { platformConfigValue } from "@llmgateway/shared";

/**
 * Deployment-level model allowlist (`gateway.modelAllowlist`, env
 * GATEWAY_MODEL_ALLOWLIST) and denylist (`gateway.modelDenylist`, env
 * GATEWAY_MODEL_DENYLIST).
 *
 * Curated deployments (e.g. Vichar) sell only their own catalogue entries even
 * when other providers happen to be configured — a mock or test provider key
 * must never make a non-curated model callable, or its canned responses would
 * bill at real list prices. The denylist removes matching ids from every
 * surface (listing, direct resolution, auto/smart pools), e.g. to retire
 * internal slugs. Entries are model ids; a trailing `*` marks a prefix match.
 * An empty allowlist allows every model.
 */

/** Routing pseudo-models stay dispatchable; their candidate pool is filtered separately. */
const ROUTING_MODEL_IDS = new Set(["auto", "smart", "custom"]);

function matchesEntries(modelId: string, entries: readonly string[]): boolean {
	return entries.some((entry) =>
		entry.endsWith("*")
			? modelId.startsWith(entry.slice(0, -1))
			: modelId === entry,
	);
}

/**
 * `denylist` is the request's loaded `gateway.modelDenylist`; without it the
 * env/default value applies.
 */
export function isModelDeniedByDeployment(
	modelId: string,
	denylist: readonly string[] = platformConfigValue("gateway.modelDenylist"),
): boolean {
	return !ROUTING_MODEL_IDS.has(modelId) && matchesEntries(modelId, denylist);
}

/**
 * `allowlist`/`denylist` are the request's loaded config values; without them
 * the env/default values apply.
 */
export function isModelAllowedByDeployment(
	modelId: string,
	allowlist: readonly string[] = platformConfigValue("gateway.modelAllowlist"),
	denylist: readonly string[] = platformConfigValue("gateway.modelDenylist"),
): boolean {
	if (isModelDeniedByDeployment(modelId, denylist)) {
		return false;
	}
	if (allowlist.length === 0 || ROUTING_MODEL_IDS.has(modelId)) {
		return true;
	}
	return matchesEntries(modelId, allowlist);
}
