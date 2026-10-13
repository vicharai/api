import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CodeCard } from "@/components/code-card";
import { fetchCatalog, formatContext, formatPrice } from "@/lib/models";
import { site } from "@/lib/site";

import type { Metadata } from "next";

export async function generateStaticParams() {
	const models = await fetchCatalog();
	return models.map((m) => ({ id: m.id }));
}

export const dynamicParams = false;

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const models = await fetchCatalog();
	const model = models.find((m) => m.id === id);
	if (!model) {
		return { title: "Model not found" };
	}
	return {
		title: model.displayName,
		description: model.description || `${model.displayName} on the Vichar API.`,
		alternates: { canonical: `/models/${model.id}/` },
	};
}

export default async function ModelPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const models = await fetchCatalog();
	const model = models.find((m) => m.id === id);
	if (!model) {
		notFound();
	}

	const snippet = `curl ${site.urls.apiBase}/chat/completions \\
  -H "Authorization: Bearer $VICHAR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`;

	const stats: Array<[string, string]> = [
		["Context window", formatContext(model.contextLength)],
		["Max output", model.maxOutput ? formatContext(model.maxOutput) : "—"],
		["Input", `${formatPrice(model.inputPerMillion)} /M tokens`],
		["Output", `${formatPrice(model.outputPerMillion)} /M tokens`],
	];

	return (
		<main className="mx-auto max-w-[880px] px-5 py-16 sm:px-8 sm:py-24">
			<Link
				href="/models/"
				className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				All models
			</Link>
			<div className="mt-8 flex flex-wrap items-center gap-3">
				<h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
					{model.displayName}
				</h1>
				{model.free && (
					<span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
						Experimental
					</span>
				)}
			</div>
			<p className="mt-2 font-mono text-sm text-muted-foreground">{model.id}</p>
			{model.description && (
				<p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
					{model.description}
				</p>
			)}

			<dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border/60 sm:grid-cols-4">
				{stats.map(([label, value]) => (
					<div key={label} className="bg-card p-5">
						<dt className="text-xs text-muted-foreground">{label}</dt>
						<dd className="mt-1 font-mono text-sm font-medium">{value}</dd>
					</div>
				))}
			</dl>

			{model.supportedParameters.length > 0 && (
				<div className="mt-10">
					<h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Supported parameters
					</h2>
					<ul className="mt-3 flex flex-wrap gap-2">
						{model.supportedParameters.map((p) => (
							<li
								key={p}
								className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground"
							>
								{p}
							</li>
						))}
					</ul>
				</div>
			)}

			<div className="mt-10">
				<CodeCard snippets={{ cURL: snippet }} />
			</div>

			<div className="mt-12 flex flex-wrap items-center gap-3">
				<a
					href={site.urls.signup}
					className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
				>
					Get API key
				</a>
				<a
					href={site.urls.docs}
					className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-accent"
				>
					Read the docs
				</a>
			</div>
		</main>
	);
}
