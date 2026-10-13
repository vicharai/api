import { LEGAL_SLUGS } from "@/lib/legal";
import { fetchCatalog } from "@/lib/models";
import { site } from "@/lib/site";

import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const models = await fetchCatalog();
	const base = site.domain;
	const paths = [
		"/",
		"/models/",
		"/pricing/",
		"/about/",
		"/contact/",
		...LEGAL_SLUGS.map((s) => `/legal/${s}/`),
		...models.map((m) => `/models/${m.id}/`),
	];
	return paths.map((p) => ({
		url: `${base}${p}`,
		changeFrequency: p === "/" ? "weekly" : "monthly",
	}));
}
