import { HTTPException } from "hono/http-exception";

import {
	listCatalogDeletions,
	listRoutingOverrides,
} from "@/lib/cached-queries.js";
import { clientFacingProviderId } from "@/lib/stealth-provider-errors.js";

export interface ActiveRoutingRule {
	scope: "provider" | "model" | "mapping";
	target: string;
	/** Admin soft delete: permanent, and the target reads as unknown. */
	deleted: boolean;
}

export type ActiveRoutingOverrides = readonly ActiveRoutingRule[];

/** Admin kill-switch rules that have not expired, plus catalogue deletions. */
export async function getActiveRoutingOverrides(
	now = Date.now(),
): Promise<ActiveRoutingOverrides> {
	const [rules, deletions] = await Promise.all([
		listRoutingOverrides(),
		listCatalogDeletions(),
	]);
	return [
		...deletions.map((rule) => ({ ...rule, deleted: true })),
		...rules
			.filter((rule) => !rule.expiresAt || Date.parse(rule.expiresAt) > now)
			.map((rule) => ({
				scope: rule.scope,
				target: rule.target,
				deleted: false,
			})),
	];
}

function matches(
	rule: ActiveRoutingRule,
	providerId: string,
	modelId: string,
): boolean {
	return (
		(rule.scope === "provider" && rule.target === providerId) ||
		(rule.scope === "model" && rule.target === modelId) ||
		(rule.scope === "mapping" && rule.target === `${providerId}/${modelId}`)
	);
}

export function isMappingDisabledByAdmin(
	overrides: ActiveRoutingOverrides,
	providerId: string,
	modelId: string,
): boolean {
	return overrides.some((rule) => matches(rule, providerId, modelId));
}

export function isMappingDeletedByAdmin(
	overrides: ActiveRoutingOverrides,
	providerId: string,
	modelId: string,
): boolean {
	return overrides.some(
		(rule) => rule.deleted && matches(rule, providerId, modelId),
	);
}

/** Drops mappings an admin deleted or disabled. */
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

/** Drops only mappings an admin deleted. */
export function filterAdminDeleted<T extends { providerId: string }>(
	list: T[],
	overrides: ActiveRoutingOverrides,
	modelId: string,
): T[] {
	return overrides.length === 0
		? list
		: list.filter(
				(mapping) =>
					!isMappingDeletedByAdmin(overrides, mapping.providerId, modelId),
			);
}

export function adminDisabledMessage(
	modelId: string,
	providerId?: string,
): string {
	return providerId
		? `Provider '${clientFacingProviderId(providerId)}' is temporarily unavailable for model ${modelId}. Retry later or use another provider.`
		: `Model ${modelId} is temporarily unavailable. Retry later.`;
}

/**
 * The error for a request an admin rule blocks: 400 (unknown model/provider)
 * for a deletion, 503 for a kill switch. Without `providerId`, every mapping
 * of the model was removed and `allDeleted` says whether deletions did it.
 */
export function adminBlockedException(
	overrides: ActiveRoutingOverrides,
	modelId: string,
	providerId?: string,
	allDeleted = false,
): HTTPException {
	const modelDeleted = overrides.some(
		(rule) => rule.deleted && rule.scope === "model" && rule.target === modelId,
	);
	if (modelDeleted || (!providerId && allDeleted)) {
		return new HTTPException(400, {
			message: `Unsupported model: ${modelId}`,
		});
	}
	if (providerId && isMappingDeletedByAdmin(overrides, providerId, modelId)) {
		return new HTTPException(400, {
			message: `Unsupported provider: ${clientFacingProviderId(providerId)}`,
		});
	}
	return new HTTPException(503, {
		message: adminDisabledMessage(modelId, providerId),
	});
}

/** Throws 400 for a deleted pair and 503 when a kill switch disables it. */
export async function assertNotAdminDisabled(
	providerId: string,
	modelId: string,
): Promise<void> {
	const overrides = await getActiveRoutingOverrides();
	if (isMappingDisabledByAdmin(overrides, providerId, modelId)) {
		throw adminBlockedException(overrides, modelId, providerId);
	}
}
