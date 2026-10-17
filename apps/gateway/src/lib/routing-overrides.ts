import { HTTPException } from "hono/http-exception";

import { listRoutingOverrides } from "@/lib/cached-queries.js";

import type { RoutingOverrideRule } from "@/lib/cached-queries.js";

export type ActiveRoutingOverrides = readonly RoutingOverrideRule[];

/** Admin kill-switch rules that have not expired. */
export async function getActiveRoutingOverrides(
	now = Date.now(),
): Promise<ActiveRoutingOverrides> {
	const rules = await listRoutingOverrides();
	return rules.filter(
		(rule) => !rule.expiresAt || Date.parse(rule.expiresAt) > now,
	);
}

export function isMappingDisabledByAdmin(
	overrides: ActiveRoutingOverrides,
	providerId: string,
	modelId: string,
): boolean {
	return overrides.some(
		(rule) =>
			(rule.scope === "provider" && rule.target === providerId) ||
			(rule.scope === "model" && rule.target === modelId) ||
			(rule.scope === "mapping" && rule.target === `${providerId}/${modelId}`),
	);
}

export function filterAdminDisabled<T extends { providerId: string }>(
	list: T[],
	overrides: ActiveRoutingOverrides,
	modelId: string,
): T[] {
	return overrides.length === 0
		? list
		: list.filter(
				(mapping) =>
					!isMappingDisabledByAdmin(overrides, mapping.providerId, modelId),
			);
}

export function adminDisabledMessage(
	modelId: string,
	providerId?: string,
): string {
	return providerId
		? `Provider '${providerId}' is temporarily unavailable for model ${modelId}. Retry later or use another provider.`
		: `Model ${modelId} is temporarily unavailable. Retry later.`;
}

/** Throws 503 when an admin kill switch disables this pair. */
export async function assertNotAdminDisabled(
	providerId: string,
	modelId: string,
): Promise<void> {
	const overrides = await getActiveRoutingOverrides();
	if (isMappingDisabledByAdmin(overrides, providerId, modelId)) {
		throw new HTTPException(503, {
			message: adminDisabledMessage(modelId, providerId),
		});
	}
}
