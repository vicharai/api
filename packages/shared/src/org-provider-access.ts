/** Operator-set provider access policy on an organization. */
export interface OrgProviderAccessPolicy {
	mode: "allow" | "deny";
	providers: readonly string[];
	models: readonly string[];
	/** Exact `provider/model` pairs. */
	mappings: readonly string[];
}

/**
 * Allow mode admits a mapping matching any listed provider, model or exact
 * `provider/model` mapping (so empty lists admit nothing); deny mode drops it.
 */
export function isMappingAllowedByOrgProviderAccess(
	policy: OrgProviderAccessPolicy,
	providerId: string,
	modelId: string,
): boolean {
	const matches =
		policy.providers.includes(providerId) ||
		policy.models.includes(modelId) ||
		policy.mappings.includes(`${providerId}/${modelId}`);
	return policy.mode === "allow" ? matches : !matches;
}
