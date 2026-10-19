import { useMemo } from "react";

import { useApi } from "@/lib/fetch-client";

import {
	models as staticModels,
	providers as staticProviders,
} from "@llmgateway/models";

const CATALOG_STALE_MS = 5 * 60 * 1000;

/**
 * Bundled catalogue plus the models and providers operators added at runtime
 * (served by `/internal/*`). The bundled lists are the fallback while the API
 * loads or when it fails.
 */
export function useCatalog() {
	const api = useApi();
	const { data: modelsData } = api.useQuery(
		"get",
		"/internal/models",
		{},
		{ staleTime: CATALOG_STALE_MS },
	);
	const { data: providersData } = api.useQuery(
		"get",
		"/internal/providers",
		{},
		{ staleTime: CATALOG_STALE_MS },
	);

	return useMemo(() => {
		const modelIds = new Set<string>(staticModels.map((model) => model.id));
		const providerIds = new Set<string>(
			staticProviders.map((provider) => provider.id),
		);
		const managedModels = (modelsData?.models ?? []).filter(
			(model) => model.status === "active" && !modelIds.has(model.id),
		);
		const managedProviders = (providersData?.providers ?? []).filter(
			(provider) =>
				provider.status === "active" && !providerIds.has(provider.id),
		);
		return {
			models: [...staticModels, ...managedModels],
			providers: [...staticProviders, ...managedProviders],
		};
	}, [modelsData, providersData]);
}
