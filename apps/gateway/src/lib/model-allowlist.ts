import { platformConfigValue } from "@llmgateway/shared";

/**
 * Deployment-level model allowlist (`gateway.modelAllowlist`, env
 * GATEWAY_MODEL_ALLOWLIST).
 *
 * Curated deployments (e.g. Vichar) sell only their own catalogue entries even
 * when other providers happen to be configured — a mock or test provider key
 * must never make a non-curated model callable, or its canned responses would
 * bill at real list prices. Entries are model ids; a trailing `*` marks a
 * prefix match (e.g. `vichar-*`). Empty means no restriction.
 */

/** Routing pseudo-models stay dispatchable; their candidate pool is filtered separately. */
const ROUTING_MODEL_IDS = new Set(["auto", "smart", "custom"]);

/**
 * `allowlist` is the request's loaded `gateway.modelAllowlist`; without it the
 * env/default value applies.
 */
export function isModelAllowedByDeployment(
	modelId: string,
	allowlist: readonly string[] = platformConfigValue("gateway.modelAllowlist"),
): boolean {
	if (allowlist.length === 0 || ROUTING_MODEL_IDS.has(modelId)) {
		return true;
	}
	return allowlist.some((entry) =>
		entry.endsWith("*")
			? modelId.startsWith(entry.slice(0, -1))
			: modelId === entry,
	);
}
