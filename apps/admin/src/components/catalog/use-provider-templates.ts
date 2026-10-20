"use client";

import { useApi } from "@/lib/fetch-client";

import type { CatalogProviderTemplate } from "@/lib/api/admin-types";

/** API styles a custom provider can speak, keyed by id. */
export function useProviderTemplates(): {
	templates: CatalogProviderTemplate[];
	byId: Map<string, CatalogProviderTemplate>;
	isLoading: boolean;
} {
	const api = useApi();
	const query = api.useQuery("get", "/admin/catalog/provider-templates");
	const templates = query.data?.templates ?? [];
	return {
		templates,
		byId: new Map(templates.map((template) => [template.id, template])),
		isLoading: query.isLoading,
	};
}

/** What the upstream model id looks like on a custom provider's API style. */
export function useModelIdHint(providerId: string): string | undefined {
	const api = useApi();
	const { byId } = useProviderTemplates();
	const providers = api.useQuery("get", "/admin/catalog/providers");
	const template = providers.data?.providers.find(
		(provider) => provider.id === providerId,
	)?.template;
	return template ? byId.get(template)?.modelIdHint : undefined;
}
