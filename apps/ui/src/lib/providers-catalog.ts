import {
	models as modelDefinitions,
	providers as providerDefinitions,
	isStealthProvider,
	type ModelDefinition,
} from "@llmgateway/models";
import { isMappingDeactivated } from "@llmgateway/shared/components";

import { fetchModels } from "./fetch-models";

type ProviderMappings = ReadonlyArray<{
	providerId: string;
	deactivatedAt?: Date | string | null;
}>;

function countActiveMappingsByProvider(
	mappingLists: ProviderMappings[],
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const mappings of mappingLists) {
		for (const mapping of mappings) {
			if (isMappingDeactivated(mapping)) {
				continue;
			}
			counts[mapping.providerId] = (counts[mapping.providerId] ?? 0) + 1;
		}
	}
	return counts;
}

const staticModelCounts = countActiveMappingsByProvider(
	(modelDefinitions as readonly ModelDefinition[]).map(
		(model) => model.providers,
	),
);

/**
 * Active model counts per provider from the live catalogue, so admin-managed
 * models count too. Falls back to the bundled catalogue when the API is down.
 */
export async function getActiveModelCounts(): Promise<Record<string, number>> {
	const apiModels = await fetchModels();
	if (apiModels.length === 0) {
		return staticModelCounts;
	}
	return countActiveMappingsByProvider(
		apiModels
			.filter((model) => model.status !== "inactive")
			.map((model) => model.mappings),
	);
}

/**
 * Providers shown in the public directory: public catalogue entries with at
 * least one routable model mapping. Gateway, custom, and stealth providers are
 * not self-serve public entries.
 */
const publicProviderDefinitions = providerDefinitions.filter(
	(provider) =>
		provider.name !== "Vichar" &&
		provider.id !== "custom" &&
		!isStealthProvider(provider),
);

export function getListedProviders(counts: Record<string, number>) {
	return publicProviderDefinitions.filter(
		(provider) => (counts[provider.id] ?? 0) > 0,
	);
}
