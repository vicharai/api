import { cache } from "react";

import {
	fetchModelsFromApi,
	fetchProvidersFromApi,
} from "@llmgateway/shared/components";

import { getConfig } from "./config-server";

import type { ApiModel, ApiProvider } from "@llmgateway/shared/components";

export type {
	ApiModel,
	ApiModelProviderMapping,
	ApiProvider,
} from "@llmgateway/shared/components";

export const fetchModels = cache(
	async (configuredOnly = false): Promise<ApiModel[]> => {
		const config = getConfig();
		return await fetchModelsFromApi(config.apiBackendUrl, { configuredOnly });
	},
);

export const fetchProviders = cache(async (): Promise<ApiProvider[]> => {
	const config = getConfig();
	return await fetchProvidersFromApi(config.apiBackendUrl);
});
