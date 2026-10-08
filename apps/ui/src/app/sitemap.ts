import {
	getProviderCountries,
	models as modelDefinitions,
	providers as providerDefinitions,
	type ModelDefinition,
} from "@llmgateway/models";
import { isMappingDeactivated } from "@llmgateway/shared/components";

import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const baseUrl = "https://app.vichar.io";

	const { allLegals } = await import("content-collections");

	// Static pages
	const staticPages: MetadataRoute.Sitemap = [
		{
			url: baseUrl,
			changeFrequency: "weekly",
			priority: 1,
		},
		{
			url: `${baseUrl}/models`,
			changeFrequency: "daily",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/pricing`,
			changeFrequency: "weekly",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/contact`,
			changeFrequency: "monthly",
			priority: 0.6,
		},
		{
			url: `${baseUrl}/providers`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/products/ai-gateway`,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/products/devpass`,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/referrals`,
			changeFrequency: "monthly",
			priority: 0.6,
		},
		{
			url: `${baseUrl}/models/compare`,
			changeFrequency: "weekly",
			priority: 0.7,
		},
		{
			url: `${baseUrl}/models/text`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/vision`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/reasoning`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/web-search`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/image-to-image`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/text-to-image`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/video`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/embeddings`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/tools`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/discounted`,
			changeFrequency: "weekly",
			priority: 0.7,
		},
		{
			url: `${baseUrl}/models/roleplay`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/coding`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/creative-writing`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/translation`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/math`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/long-context`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/cheapest`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/open-source`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/models/premium`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/mcp`,
			changeFrequency: "monthly",
			priority: 0.7,
		},
	];

	// Model pages
	const modelPages: MetadataRoute.Sitemap = [];
	const listedModelIds = new Set<string>();
	for (const model of modelDefinitions as readonly ModelDefinition[]) {
		// Fully deactivated models are hidden from the public directory, so they
		// are not advertised for crawling either (the pages still resolve).
		if (
			model.providers.length > 0 &&
			model.providers.every((p) => isMappingDeactivated(p))
		) {
			continue;
		}

		// Main model page
		modelPages.push({
			url: `${baseUrl}/models/${encodeURIComponent(model.id)}`,
			changeFrequency: "weekly",
			priority: 0.8,
		});
		listedModelIds.add(model.id);

		// Model uptime pages and model+provider sub-pages are intentionally
		// excluded from the sitemap: uptime pages are thin templates that
		// inflate crawl budget (~300 URLs), and provider sub-pages canonicalize
		// to the base model page. Google still discovers both via internal links.
	}

	// DB-only catalogue entries (Airside carriers and their listings) are not
	// in the static definitions, so pull them from the API.
	const { fetchModels, fetchProviders } = await import("@/lib/fetch-models");
	const staticProviderIds = new Set(
		providerDefinitions.map((p) => p.id as string),
	);
	const [apiModels, apiProviders] = await Promise.all([
		fetchModels(),
		fetchProviders(),
	]);
	for (const model of apiModels) {
		if (
			listedModelIds.has(model.id) ||
			!model.mappings.some(
				(mapping) =>
					mapping.status === "active" && !isMappingDeactivated(mapping),
			)
		) {
			continue;
		}
		modelPages.push({
			url: `${baseUrl}/models/${encodeURIComponent(model.id)}`,
			changeFrequency: "weekly",
			priority: 0.8,
		});
		listedModelIds.add(model.id);
	}

	// Provider pages
	const providerPages: MetadataRoute.Sitemap = providerDefinitions
		.filter((provider) => provider.name !== "Vichar")
		.map((provider) => ({
			url: `${baseUrl}/providers/${provider.id}`,
			changeFrequency: "weekly",
			priority: 0.8,
		}));
	for (const provider of apiProviders) {
		if (
			staticProviderIds.has(provider.id) ||
			!apiModels.some((model) =>
				model.mappings.some(
					(mapping) =>
						mapping.providerId === provider.id && mapping.status === "active",
				),
			)
		) {
			continue;
		}
		providerPages.push({
			url: `${baseUrl}/providers/${provider.id}`,
			changeFrequency: "weekly",
			priority: 0.8,
		});
	}

	// Per-country provider pages
	const providerCountryPages: MetadataRoute.Sitemap =
		getProviderCountries().map((country) => ({
			url: `${baseUrl}/providers/country/${country.code.toLowerCase()}`,
			changeFrequency: "weekly",
			priority: 0.7,
		}));

	// Legal pages
	const legalPages: MetadataRoute.Sitemap = allLegals.map((legal) => ({
		url: `${baseUrl}/legal/${legal.slug}`,
		lastModified: new Date(legal.date),
		changeFrequency: "yearly" as const,
		priority: 0.3,
	}));

	return [
		...staticPages,
		...modelPages,
		...providerPages,
		...providerCountryPages,
		...legalPages,
	];
}
