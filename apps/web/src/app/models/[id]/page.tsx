import {
	ArrowRight,
	Coins,
	Layers,
	MessageSquareText,
	Ruler,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CodeCard } from "@/components/code-card";
import { JsonLd } from "@/components/json-ld";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { PageHero } from "@/components/page-hero";
import {
	fetchCatalog,
	formatContext,
	formatPrice,
	LAB_LABELS,
	labForModel,
} from "@/lib/models";
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
	const lab = LAB_LABELS[labForModel(model)];
	const title = `${model.displayName} API pricing & context window`;
	const description =
		model.description ||
		`Call ${model.displayName}${lab ? ` by ${lab}` : ""} through the Vichar OpenAI-compatible API: ${formatContext(model.contextLength)} context, ${formatPrice(model.inputPerMillion)} input and ${formatPrice(model.outputPerMillion)} output per million tokens.`;
	return {
		title,
		description,
		alternates: { canonical: `/models/${model.id}/` },
		openGraph: { title, description, url: `/models/${model.id}/` },
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
	const labKey = labForModel(model);
	const lab = LAB_LABELS[labKey];
	const related = models
		.filter((m) => m.id !== model.id && labForModel(m) === labKey && labKey)
		.slice(0, 3);

	const curl = `curl ${site.urls.apiBase}/chat/completions \\
  -H "Authorization: Bearer $VICHAR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`;
	const python = `from openai import OpenAI

client = OpenAI(base_url="${site.urls.apiBase}", api_key="YOUR_API_KEY")

resp = client.chat.completions.create(
    model="${model.id}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)`;
	const ts = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${site.urls.apiBase}",
  apiKey: process.env.VICHAR_API_KEY,
});

const resp = await client.chat.completions.create({
  model: "${model.id}",
  messages: [{ role: "user", content: "Hello" }],
});`;

	const stats = [
		{
			icon: Ruler,
			label: "Context window",
			value: formatContext(model.contextLength),
			sub: "tokens",
		},
		{
			icon: MessageSquareText,
			label: "Max output",
			value: model.maxOutput ? formatContext(model.maxOutput) : "—",
			sub: "tokens",
		},
		{
			icon: Coins,
			label: "Input",
			value: formatPrice(model.inputPerMillion),
			sub: "per 1M tokens",
		},
		{
			icon: Layers,
			label: "Output",
			value: formatPrice(model.outputPerMillion),
			sub: "per 1M tokens",
		},
	];

	return (
		<main>
			<JsonLd
				data={{
					"@context": "https://schema.org",
					"@type": "Product",
					name: model.displayName,
					sku: model.id,
					description:
						model.description || `${model.displayName} on the Vichar API.`,
					...(lab ? { brand: { "@type": "Brand", name: lab } } : {}),
					url: `${site.domain}/models/${model.id}/`,
					...(model.inputPerMillion !== null
						? {
								offers: {
									"@type": "Offer",
									priceCurrency: "USD",
									price: model.inputPerMillion.toFixed(2),
									description: "Input price per million tokens",
									availability: "https://schema.org/InStock",
								},
							}
						: {}),
				}}
			/>
			<PageHero
				crumbs={[
					{ label: "Models", href: "/models/" },
					{ label: model.displayName, href: `/models/${model.id}/` },
				]}
				eyebrow={lab ? `${lab} model` : "Model"}
				title={model.displayName}
				sub={
					model.description ||
					`Call ${model.displayName} with any OpenAI-compatible SDK through one Vichar API key.`
				}
			>
				<div className="flex flex-wrap items-center gap-3">
					<code className="rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm shadow-card">
						{model.id}
					</code>
					{model.free && (
						<span className="rounded-full bg-amber/15 px-3 py-1 text-xs font-semibold text-warning">
							Experimental
						</span>
					)}
					<a
						href={site.urls.signup}
						className="group inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-strong"
					>
						Get API key
						<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
					</a>
				</div>
			</PageHero>

			<section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16">
				<Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
					{stats.map((s) => (
						<StaggerItem key={s.label}>
							<div className="h-full rounded-2xl border border-border bg-card p-5 shadow-card">
								<s.icon className="size-4 text-brand" />
								<p className="mt-4 text-xs font-medium text-muted-foreground">
									{s.label}
								</p>
								<p className="mt-1 font-display text-2xl font-bold tabular-nums">
									{s.value}
								</p>
								<p className="text-xs text-muted-foreground">{s.sub}</p>
							</div>
						</StaggerItem>
					))}
				</Stagger>

				<div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
					<FadeIn className="min-w-0">
						<h2 className="font-display text-xl font-bold tracking-tight">
							Quick start
						</h2>
						<div className="mt-4 rounded-2xl shadow-float">
							<CodeCard
								snippets={{ cURL: curl, Python: python, TypeScript: ts }}
							/>
						</div>
					</FadeIn>
					<FadeIn delay={0.1}>
						{model.supportedParameters.length > 0 && (
							<div className="rounded-2xl border border-border bg-card p-6 shadow-card">
								<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Supported parameters
								</h2>
								<ul className="mt-4 flex flex-wrap gap-2">
									{model.supportedParameters.map((p) => (
										<li
											key={p}
											className="rounded-md border border-border bg-canvas px-2 py-1 font-mono text-xs text-foreground/80"
										>
											{p}
										</li>
									))}
								</ul>
							</div>
						)}
						{related.length > 0 && (
							<div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
								<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									More from {lab}
								</h2>
								<ul className="mt-3 divide-y divide-border">
									{related.map((m) => (
										<li key={m.id}>
											<Link
												href={`/models/${m.id}/`}
												className="group flex items-center justify-between gap-3 py-3"
											>
												<span>
													<span className="block text-sm font-semibold group-hover:text-brand">
														{m.displayName}
													</span>
													<span className="font-mono text-xs text-muted-foreground">
														{formatPrice(m.inputPerMillion)} /{" "}
														{formatPrice(m.outputPerMillion)}
													</span>
												</span>
												<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
											</Link>
										</li>
									))}
								</ul>
							</div>
						)}
					</FadeIn>
				</div>
			</section>
		</main>
	);
}
