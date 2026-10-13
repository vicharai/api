import { ModelsTable } from "@/components/models-table";
import { fetchCatalog } from "@/lib/models";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Models",
	description:
		"Every model available through the Vichar API: context windows, pricing per million tokens, and providers.",
	alternates: { canonical: "/models/" },
};

export default async function ModelsPage() {
	const models = await fetchCatalog();
	return (
		<main className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
			<h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
				Models
			</h1>
			<p className="mt-3 max-w-lg text-[15px] text-muted-foreground">
				Every model available through the Vichar API, at the listed per-token
				rates.
			</p>
			<div className="mt-10">
				<ModelsTable models={models} />
			</div>
		</main>
	);
}
