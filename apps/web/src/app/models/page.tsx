import { ModelsTable } from "@/components/models-table";
import { FadeIn } from "@/components/motion";
import { PageHero } from "@/components/page-hero";
import { fetchCatalog, labForModel } from "@/lib/models";
import { site } from "@/lib/site";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "AI models, pricing & context windows",
	description:
		"Every model available through the Vichar API: context windows, input and output pricing per million tokens, and supported parameters.",
	alternates: { canonical: "/models/" },
};

export default async function ModelsPage() {
	const models = await fetchCatalog();
	const labs = new Set(models.map(labForModel).filter(Boolean)).size;
	return (
		<main>
			<PageHero
				crumbs={[{ label: "Models", href: "/models/" }]}
				eyebrow="Catalogue"
				title={
					<>
						<span className="text-gradient">{models.length} models</span>, one
						API.
					</>
				}
				sub="Every model available through the Vichar API, at the listed per-token rates. Search, filter and compare, then call any of them with the same request."
			>
				<div className="flex flex-wrap gap-3 text-sm">
					{[
						[`${models.length}`, "models"],
						[`${labs}+`, "labs"],
						["0%", "token markup"],
					].map(([v, l]) => (
						<span
							key={l}
							className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 shadow-card"
						>
							<span className="font-display font-bold">{v}</span>
							<span className="text-muted-foreground">{l}</span>
						</span>
					))}
				</div>
			</PageHero>
			<section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16">
				<FadeIn>
					<ModelsTable models={models} />
				</FadeIn>
				<p className="mt-6 text-sm text-muted-foreground">
					The catalogue is also available as JSON at{" "}
					<a
						href={site.urls.apiModels}
						className="font-mono text-brand hover:underline"
					>
						/v1/models
					</a>
					.
				</p>
			</section>
		</main>
	);
}
