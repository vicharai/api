import { HTTPException } from "hono/http-exception";

import { clientFacingProviderId } from "@/lib/stealth-provider-errors.js";

import {
	isMappingAllowedByOrgProviderAccess,
	type OrgProviderAccessPolicy,
} from "@llmgateway/shared";

export { isMappingAllowedByOrgProviderAccess, type OrgProviderAccessPolicy };

interface OrganizationAccessLike {
	providerAccessMode?: "none" | "allow" | "deny" | null;
	providerAccessProviders?: string[] | null;
	providerAccessModels?: string[] | null;
	providerAccessMappings?: string[] | null;
}

/**
 * The operator-set provider access policy on the (cached) org row, or
 * `undefined` when none applies.
 */
export function getOrgProviderAccessPolicy(
	organization: OrganizationAccessLike,
): OrgProviderAccessPolicy | undefined {
	const mode = organization.providerAccessMode;
	if (mode !== "allow" && mode !== "deny") {
		return undefined;
	}
	return {
		mode,
		providers: organization.providerAccessProviders ?? [],
		models: organization.providerAccessModels ?? [],
		mappings: organization.providerAccessMappings ?? [],
	};
}

export function filterByOrgProviderAccess<T extends { providerId: string }>(
	list: T[],
	policy: OrgProviderAccessPolicy | undefined,
	modelId: string,
): T[] {
	return policy
		? list.filter((mapping) =>
				isMappingAllowedByOrgProviderAccess(
					policy,
					mapping.providerId,
					modelId,
				),
			)
		: list;
}

export function orgProviderAccessBlockMessage(
	modelId: string,
	providerId?: string,
): string {
	return providerId
		? `Provider '${clientFacingProviderId(providerId)}' is not available to your organization for model ${modelId}. Your organization's provider access is restricted by Vichar; contact support to change it.`
		: `No provider for model ${modelId} is available to your organization. Your organization's provider access is restricted by Vichar; contact support to change it.`;
}

/** Throws 403 when the org's provider access policy excludes this pair. */
export function assertOrgProviderAccess(
	organization: OrganizationAccessLike,
	providerId: string,
	modelId: string,
): void {
	const policy = getOrgProviderAccessPolicy(organization);
	if (
		policy &&
		!isMappingAllowedByOrgProviderAccess(policy, providerId, modelId)
	) {
		throw new HTTPException(403, {
			message: orgProviderAccessBlockMessage(modelId, providerId),
		});
	}
}
