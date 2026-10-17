import {
	ArrowRight,
	BarChart3,
	BookOpen,
	Check,
	Clock,
	Gauge,
	KeyRound,
	ListChecks,
	ShieldCheck,
	Timer,
	Wallet,
	X,
} from "lucide-react";
import Link from "next/link";

import { BentoFeatures } from "@/components/bento";
import { CodeCard } from "@/components/code-card";
import { DashboardShot } from "@/components/dashboard-shot";
import { FailoverViz } from "@/components/failover-viz";
import { HeroShot } from "@/components/hero-shot";
import { JsonLd } from "@/components/json-ld";
import { ModelUniverse } from "@/components/model-universe";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { PrivacyRecord } from "@/components/privacy-record";
import { ProviderGrid } from "@/components/provider-grid";
import { RequestChat } from "@/components/request-chat";
import { Reveal } from "@/components/reveal";
import { RoutingFlow } from "@/components/routing-flow";
import { ScaleToFit } from "@/components/scale-to-fit";
import {
	fetchCatalog,
	formatContext,
	formatPrice,
	LAB_LABELS,
	labForModel,
	type CatalogModel,
} from "@/lib/models";
import { site } from "@/lib/site";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	alternates: { canonical: "/" },
};

const DIFF_SNIPPET = `import OpenAI from "openai";

const client = new OpenAI({
-  apiKey: process.env.OPENAI_API_KEY,
+  baseURL: "https://api.vichar.io/v1",
+  apiKey: process.env.VICHAR_API_KEY,
});

const response = await client.chat.completions.create({
  model: "vichar-sonnet-5.5",
  messages: [{ role: "user", content: "Hello" }],
});`;

const SNIPPETS: Record<string, string> = {
	cURL: `curl https://api.vichar.io/v1/chat/completions \\
  -H "Authorization: Bearer $VICHAR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "vichar-sonnet-5.5",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
	Python: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.vichar.io/v1",
    api_key="YOUR_API_KEY",
)

resp = client.chat.completions.create(
    model="vichar-sonnet-5.5",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)`,
};

const PREVIEW_IDS = [
	"vichar-opus-5.5",
	"vichar-gpt-5.6",
	"vichar-gemini-3.1-pro",
	"vichar-grok-4.7",
	"vichar-sonnet-5.5",
	"vichar-deepseek-v4-pro",
];

const TRUST = [
	{
		title: "OpenAI-compatible, always",
		body: "Point any OpenAI SDK at one base URL. Streaming, tool calling and structured outputs work the same across every lab.",
	},
	{
		title: "No markup or gimmicks",
		body: "You pay the listed per-token rate of the model you call. No seat fees, no subscription, no minimum spend each month.",
	},
	{
		title: "The whole frontier, one key",
		body: "Reasoning, coding and multimodal models from the leading labs, behind a single key and a single balance.",
	},
	{
		title: "Spend with control",
		body: "Give every key its own budget and expiry, and see cost per key, project and model as it happens.",
	},
];

const COMPARISON: Array<{
	label: string;
	direct: boolean | string;
	vichar: boolean | string;
}> = [
	{ label: "Accounts and API keys", direct: "One per lab", vichar: "One" },
	{ label: "Invoices", direct: "One per lab", vichar: "One balance" },
	{ label: "Same request format for every lab", direct: false, vichar: true },
	{ label: "Failover between routes", direct: false, vichar: true },
	{ label: "Cost analytics across labs", direct: false, vichar: true },
	{ label: "Spend limit per key", direct: "Varies", vichar: true },
];

const FAQS = [
	{
		q: "Is Vichar compatible with the OpenAI SDK?",
		a: "Yes. Point your client at https://api.vichar.io/v1 and use a Vichar API key. Your existing code keeps working.",
	},
	{
		q: "How is usage billed?",
		a: "Per token at the model's listed rate, deducted from prepaid credits. Top-ups carry a 5% platform fee and a $20 minimum.",
	},
	{
		q: "Do you store my prompts?",
		a: "No. By default we keep request metadata only: tokens, cost, latency, and which provider served the request.",
	},
	{
		q: "What happens if a provider goes down?",
		a: "Requests automatically reroute to another provider serving the same model when one is available.",
	},
	{
		q: "Are there rate limits?",
		a: "New accounts get 600 requests per minute and 100 concurrent requests. Limits rise as accounts grow.",
	},
	{
		q: "Does Vichar support the Anthropic Messages format?",
		a: "Yes. Alongside /v1/chat/completions, the API accepts the Anthropic /v1/messages request format.",
	},
];

function H2({ children }: { children: ReactNode }) {
	return (
		<h2 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-[34px]">
			{children}
		</h2>
	);
}

function TextLink({ href, children }: { href: string; children: ReactNode }) {
	const external = href.startsWith("http");
	const cls =
		"group inline-flex items-center gap-1.5 text-[15px] font-medium text-brand hover:text-foreground";
	const inner = (
		<>
			{children}
			<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
		</>
	);
	return external ? (
		<a href={href} className={cls}>
			{inner}
		</a>
	) : (
		<Link href={href} className={cls}>
			{inner}
		</Link>
	);
}

function Step({
	n,
	title,
	body,
	children,
	aside,
}: {
	n: string;
	title: string;
	body: string;
	children?: ReactNode;
	aside: ReactNode;
}) {
	return (
		<FadeIn className="grid gap-8 border-b border-border py-12 first:pt-0 last:border-0 last:pb-0 md:grid-cols-[1fr_240px]">
			<div className="min-w-0">
				<span className="inline-flex h-8 min-w-10 items-center justify-center rounded-[10px] bg-sky px-2 font-mono text-sm font-semibold text-brand">
					{n}
				</span>
				<h3 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h3>
				<p className="mt-3 max-w-md text-[15px] leading-relaxed text-body">
					{body}
				</p>
				{children}
			</div>
			<div className="self-start">{aside}</div>
		</FadeIn>
	);
}

function Checklist({
	items,
}: {
	items: Array<{ icon: typeof Check; label: string; tone: string }>;
}) {
	return (
		<ul className="space-y-3.5 rounded-xl border border-border bg-card p-5 text-sm">
			{items.map((i) => (
				<li key={i.label} className="flex items-center gap-3">
					<i.icon className={`size-4 shrink-0 ${i.tone}`} />
					{i.label}
				</li>
			))}
		</ul>
	);
}

function Cell({ v }: { v: boolean | string }) {
	if (v === true) {
		return (
			<>
				<Check className="mx-auto size-4 text-success" strokeWidth={2.5} />
				<span className="sr-only">Yes</span>
			</>
		);
	}
	if (v === false) {
		return (
			<>
				<X className="mx-auto size-4 text-muted-foreground/60" />
				<span className="sr-only">No</span>
			</>
		);
	}
	return <>{v}</>;
}

export default async function Home() {
	const models = await fetchCatalog();
	const previewModels = PREVIEW_IDS.map((id) =>
		models.find((m) => m.id === id && !m.free),
	).filter((m): m is CatalogModel => m !== undefined);
	const labCount = new Set(models.map(labForModel).filter(Boolean)).size;

	const ld = {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "SoftwareApplication",
				name: "Vichar API",
				applicationCategory: "DeveloperApplication",
				operatingSystem: "Any",
				url: site.domain,
				description: site.description,
				offers: {
					"@type": "Offer",
					price: "0",
					priceCurrency: "USD",
					description:
						"Pay per token at listed model rates; 5% platform fee on credit top-ups.",
				},
				publisher: { "@id": `${site.domain}/#org` },
			},
			{
				"@type": "FAQPage",
				mainEntity: FAQS.map((f) => ({
					"@type": "Question",
					name: f.q,
					acceptedAnswer: { "@type": "Answer", text: f.a },
				})),
			},
		],
	};

	return (
		<main>
			<JsonLd data={ld} />
			<Reveal />

			{/* Hero */}
			<section className="mx-auto max-w-[1100px] px-5 pt-16 text-center sm:px-8 sm:pt-24">
				<h1
					className="rise mx-auto max-w-3xl text-[40px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[56px]"
					style={{ "--d": "0ms" } as React.CSSProperties}
				>
					One API for every AI model
				</h1>
				<p
					className="rise mx-auto mt-5 max-w-xl text-lg leading-relaxed text-body"
					style={{ "--d": "80ms" } as React.CSSProperties}
				>
					{models.length} models from {labCount}+ labs through one
					OpenAI-compatible endpoint, at the listed per-token rate.
				</p>
				<div
					className="rise mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-4"
					style={{ "--d": "160ms" } as React.CSSProperties}
				>
					<a
						href={site.urls.signup}
						className="inline-flex h-12 items-center rounded-md bg-primary px-8 text-[17px] font-medium text-primary-foreground transition-colors hover:bg-brand-strong"
					>
						Sign up for free
					</a>
					<TextLink href={site.urls.docs}>Read the docs</TextLink>
				</div>
				<p
					className="rise mt-5 text-sm text-muted-foreground"
					style={{ "--d": "220ms" } as React.CSSProperties}
				>
					No subscription. Pay only for the tokens you use.
				</p>
				<div
					className="rise mt-14 text-left sm:mt-16"
					style={{ "--d": "260ms" } as React.CSSProperties}
				>
					<HeroShot>
						<ScaleToFit width={1140} height={782}>
							<DashboardShot />
						</ScaleToFit>
					</HeroShot>
				</div>
			</section>

			{/* Providers */}
			<section className="mx-auto max-w-[1100px] px-5 pt-24 sm:px-8 sm:pt-28">
				<FadeIn className="flex flex-wrap items-end justify-between gap-4">
					<p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
						Models from {labCount}+ labs on one network
					</p>
					<TextLink href="/models/">View all models</TextLink>
				</FadeIn>
				<FadeIn className="mt-5">
					<ProviderGrid />
				</FadeIn>
			</section>

			{/* Trust */}
			<section className="mx-auto grid max-w-[1100px] gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-2 lg:items-center">
				<div>
					<FadeIn>
						<H2>Built for developers who ship</H2>
					</FadeIn>
					<Stagger className="mt-10 space-y-9">
						{TRUST.map((t) => (
							<StaggerItem key={t.title}>
								<h3 className="text-lg font-semibold">{t.title}</h3>
								<p className="mt-2 max-w-md text-[15px] leading-relaxed text-body">
									{t.body}
								</p>
							</StaggerItem>
						))}
					</Stagger>
				</div>
				<div>
					<ModelUniverse />
					<div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-3">
						<TextLink href="/models/">Explore all models</TextLink>
						<TextLink href={`${site.urls.docs}/quick-start`}>
							Quick start
						</TextLink>
					</div>
				</div>
			</section>

			{/* Catalogue banner */}
			<section className="border-y border-border bg-canvas">
				<div className="mx-auto flex max-w-[1100px] flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:gap-8 sm:px-8">
					<p className="shrink-0 font-mono text-sm font-semibold text-foreground">
						GET /v1/models
					</p>
					<p className="text-sm leading-relaxed text-body">
						Every model, price and context window as JSON, so your app can pick
						models at runtime.{" "}
						<a
							href={site.urls.apiModels}
							className="whitespace-nowrap font-medium text-brand hover:underline"
						>
							Open the catalogue →
						</a>
					</p>
				</div>
			</section>

			{/* One request. Any model. */}
			<section className="mx-auto max-w-[1100px] px-5 pt-24 sm:px-8 sm:pt-28">
				<div className="flex flex-wrap items-end justify-between gap-8">
					<FadeIn className="max-w-lg">
						<H2>One request. Any model.</H2>
						<p className="mt-4 text-[15px] leading-relaxed text-body">
							Your app sends one request. Vichar routes it to the lab that
							serves the model you asked for, with the same request and response
							shape every time.
						</p>
					</FadeIn>
					<FadeIn className="flex gap-10">
						{[
							[`${models.length}`, "Models"],
							[`${labCount}+`, "Labs"],
							["1", "API key"],
						].map(([v, l]) => (
							<div key={l}>
								<p className="text-3xl font-semibold tracking-tight">{v}</p>
								<p className="mt-1 text-[13px] text-muted-foreground">{l}</p>
							</div>
						))}
					</FadeIn>
				</div>
				<FadeIn className="mt-12">
					<RoutingFlow />
				</FadeIn>
				<div className="mt-8 flex flex-wrap justify-center gap-2">
					{[
						"POST /v1/chat/completions",
						"POST /v1/messages",
						"GET /v1/models",
					].map((e) => (
						<code
							key={e}
							className="rounded-md border border-border px-2.5 py-1 font-mono text-xs text-body"
						>
							{e}
						</code>
					))}
				</div>
			</section>

			{/* Pricing numbers */}
			<section className="mx-auto grid max-w-[1100px] gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.3fr] lg:items-center">
				<FadeIn>
					<H2>Honest pricing</H2>
					<p className="mt-4 max-w-md text-[15px] leading-relaxed text-body">
						Model rates passed through as published, a flat fee when you add
						credits, and nothing for requests that fail.
					</p>
					<div className="mt-6">
						<TextLink href="/pricing/">See pricing</TextLink>
					</div>
				</FadeIn>
				<Stagger className="grid grid-cols-3 gap-6">
					{[
						["0", "%", "Markup on per-token model rates"],
						["5", "%", "Platform fee on credit top-ups"],
						["$0", "", "For failed requests and upstream errors"],
					].map(([n, unit, label]) => (
						<StaggerItem key={label}>
							<p className="text-[52px] font-light leading-none tracking-tight text-amber sm:text-[68px]">
								{n}
								<span className="text-[28px] sm:text-[36px]">{unit}</span>
							</p>
							<p className="mt-3 max-w-[150px] text-[13px] leading-snug text-muted-foreground">
								{label}
							</p>
						</StaggerItem>
					))}
				</Stagger>
			</section>

			{/* The Vichar experience (Ditto-style steps) */}
			<section className="border-t border-border">
				<div className="mx-auto grid max-w-[1200px] lg:grid-cols-[380px_1fr]">
					<div className="bg-sky px-5 py-14 sm:px-10 lg:py-24">
						<div className="lg:sticky lg:top-28">
							<FadeIn>
								<H2>The Vichar experience</H2>
								<p className="mt-3 text-[15px] leading-relaxed text-body">
									From sign-up to your first production request in a few
									minutes.
								</p>
							</FadeIn>
							<div className="mt-10">
								<RequestChat />
							</div>
						</div>
					</div>
					<div className="min-w-0 px-5 py-14 sm:px-10 lg:py-24 lg:pl-16">
						<Step
							n="01"
							title="Create a key"
							body="Sign up, add credits, and create an API key. Give it a spend limit and an expiry so it can never cost more than you planned."
							aside={
								<Checklist
									items={[
										{
											icon: Timer,
											label: "Under a minute",
											tone: "text-brand",
										},
										{
											icon: Wallet,
											label: "Per-key spend limit",
											tone: "text-success",
										},
										{
											icon: Clock,
											label: "Expiry and revoke",
											tone: "text-orange",
										},
									]}
								/>
							}
						>
							<a
								href={site.urls.signup}
								className="mt-7 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-strong"
							>
								<KeyRound className="size-4" />
								Get your API key
							</a>
						</Step>
						<Step
							n="02"
							title="Point your SDK"
							body="Change the base URL and the key. Everything else in your code stays the same, in any language with an OpenAI client."
							aside={
								<Checklist
									items={[
										{
											icon: Check,
											label: "Streaming",
											tone: "text-success",
										},
										{
											icon: Check,
											label: "Tool calling",
											tone: "text-success",
										},
										{
											icon: Check,
											label: "Structured outputs",
											tone: "text-success",
										},
										{
											icon: Check,
											label: "Anthropic /v1/messages",
											tone: "text-success",
										},
									]}
								/>
							}
						>
							<div className="mt-7 min-w-0">
								<CodeCard
									snippets={{ Diff: DIFF_SNIPPET, ...SNIPPETS }}
									diffTabs={["Diff"]}
								/>
							</div>
						</Step>
						<Step
							n="03"
							title="Ship and keep watch"
							body="Every request is logged with its model, provider, tokens, latency and cost, so you always know where the money goes."
							aside={
								<Checklist
									items={[
										{
											icon: BarChart3,
											label: "Usage per model",
											tone: "text-brand",
										},
										{
											icon: Gauge,
											label: "Latency and provider",
											tone: "text-orange",
										},
										{
											icon: ListChecks,
											label: "Cost per key and project",
											tone: "text-success",
										},
									]}
								/>
							}
						>
							<div className="mt-7 flex flex-wrap gap-3">
								<a
									href={site.urls.app}
									className="inline-flex h-11 items-center rounded-md bg-orange px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
								>
									Open the dashboard
								</a>
								<a
									href={site.urls.docs}
									className="inline-flex h-11 items-center gap-2 rounded-md bg-secondary px-5 text-sm font-medium transition-colors hover:bg-accent"
								>
									<BookOpen className="size-4 text-muted-foreground" />
									Read the docs
								</a>
							</div>
						</Step>
					</div>
				</div>
			</section>

			{/* Reliability */}
			<section className="border-t border-border">
				<div className="mx-auto grid max-w-[1100px] gap-14 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-2 lg:items-center">
					<FadeIn>
						<H2>Retries and failover, built in</H2>
						<p className="mt-4 max-w-md text-[15px] leading-relaxed text-body">
							When a provider errors or times out, the request is retried and
							rerouted to another available route for the same model. Failed
							attempts are not billed.
						</p>
						<p className="mt-4 max-w-md text-[15px] leading-relaxed text-body">
							Need strict single-route calls? Send{" "}
							<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[13px] text-foreground">
								x-no-fallback: true
							</code>
							.
						</p>
					</FadeIn>
					<div className="min-w-0">
						<FailoverViz />
					</div>
				</div>
			</section>

			{/* Controls */}
			<section className="border-t border-border bg-canvas">
				<div className="mx-auto max-w-[1100px] px-5 py-24 sm:px-8 sm:py-28">
					<FadeIn className="max-w-xl">
						<H2>Controls that come standard</H2>
						<p className="mt-4 text-[15px] leading-relaxed text-body">
							Spend limits, expiring keys, smart routing and prompt caching on
							every account, at no extra cost.
						</p>
					</FadeIn>
					<BentoFeatures />
				</div>
			</section>

			{/* Models */}
			<section className="border-t border-border">
				<div className="mx-auto max-w-[1100px] px-5 py-24 sm:px-8 sm:py-28">
					<FadeIn className="flex flex-wrap items-end justify-between gap-6">
						<div>
							<H2>Frontier models, ready to call</H2>
							<p className="mt-3 text-[15px] text-body">
								Per-token prices from the live catalogue.
							</p>
						</div>
						<TextLink href="/models/">All {models.length} models</TextLink>
					</FadeIn>
					<FadeIn className="mt-10 overflow-x-auto rounded-xl border border-border">
						<table className="w-full text-left text-sm sm:min-w-[640px]">
							<thead>
								<tr className="border-b border-border bg-canvas text-[13px] text-muted-foreground">
									<th className="px-5 py-3 font-medium">Model</th>
									<th className="hidden px-4 py-3 font-medium sm:table-cell">
										Lab
									</th>
									<th className="px-4 py-3 font-medium">Context</th>
									<th className="px-4 py-3 text-right font-medium">
										Input / 1M
									</th>
									<th className="px-5 py-3 text-right font-medium">
										Output / 1M
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{previewModels.map((m) => (
									<tr key={m.id} className="hover:bg-canvas">
										<td className="px-5 py-3.5">
											<Link
												href={`/models/${m.id}/`}
												className="font-medium text-foreground hover:text-brand"
											>
												{m.displayName}
											</Link>
											<div className="font-mono text-xs text-muted-foreground">
												{m.id}
											</div>
										</td>
										<td className="hidden px-4 py-3.5 text-body sm:table-cell">
											{LAB_LABELS[labForModel(m)] ?? "—"}
										</td>
										<td className="px-4 py-3.5 font-mono text-xs text-body">
											{formatContext(m.contextLength)}
										</td>
										<td className="px-4 py-3.5 text-right font-mono text-[13px] tabular-nums">
											{formatPrice(m.inputPerMillion)}
										</td>
										<td className="px-5 py-3.5 text-right font-mono text-[13px] tabular-nums">
											{formatPrice(m.outputPerMillion)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</FadeIn>
				</div>
			</section>

			{/* Comparison */}
			<section className="border-t border-border bg-canvas">
				<div className="mx-auto max-w-[900px] px-5 py-24 sm:px-8 sm:py-28">
					<FadeIn className="text-center">
						<H2>Vichar or going direct?</H2>
						<p className="mx-auto mt-3 max-w-lg text-[15px] text-body">
							Every new lab you call directly is another account, key, invoice
							and SDK quirk.
						</p>
					</FadeIn>
					<FadeIn className="mt-10 overflow-hidden rounded-xl border border-border bg-card">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border text-[13px]">
									<th className="px-5 py-3.5 text-left font-medium text-muted-foreground">
										<span className="sr-only">Feature</span>
									</th>
									<th className="w-[28%] px-4 py-3.5 text-center font-medium text-muted-foreground">
										Direct to each lab
									</th>
									<th className="w-[28%] bg-sky px-4 py-3.5 text-center font-semibold text-brand">
										Vichar
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{COMPARISON.map((r) => (
									<tr key={r.label}>
										<td className="px-5 py-3.5">{r.label}</td>
										<td className="px-4 py-3.5 text-center text-muted-foreground">
											<Cell v={r.direct} />
										</td>
										<td className="bg-sky/60 px-4 py-3.5 text-center font-medium">
											<Cell v={r.vichar} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</FadeIn>
				</div>
			</section>

			{/* Privacy */}
			<section className="border-t border-border">
				<div className="mx-auto grid max-w-[1100px] gap-14 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-2 lg:items-center">
					<FadeIn className="min-w-0 lg:order-2">
						<H2>Your prompts stay yours</H2>
						<p className="mt-4 max-w-md text-[15px] leading-relaxed text-body">
							By default, prompts and responses are never written to our
							database. We keep the metadata needed to bill you, nothing more.
						</p>
						<ul className="mt-7 space-y-4 text-[15px]">
							{[
								[
									"Keys hashed at rest",
									"The full key is shown once, at creation.",
								],
								["Instant revocation", "Revoke a leaked key in one click."],
								["Encrypted in transit", "HTTPS only, end to end, TLS 1.2+."],
							].map(([t, b]) => (
								<li key={t} className="flex gap-3">
									<ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
									<span>
										<span className="font-medium">{t}.</span>{" "}
										<span className="text-body">{b}</span>
									</span>
								</li>
							))}
						</ul>
						<div className="mt-7">
							<TextLink href="/legal/privacy/">Privacy policy</TextLink>
						</div>
					</FadeIn>
					<FadeIn className="min-w-0 lg:order-1">
						<PrivacyRecord />
					</FadeIn>
				</div>
			</section>

			{/* FAQ */}
			<section className="border-t border-border bg-canvas">
				<div className="mx-auto grid max-w-[1100px] gap-10 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.6fr]">
					<FadeIn>
						<H2>Frequently asked questions</H2>
						<p className="mt-3 text-[15px] text-body">
							Something else?{" "}
							<Link
								href="/contact/"
								className="font-medium text-brand hover:underline"
							>
								Talk to us
							</Link>
							.
						</p>
					</FadeIn>
					<FadeIn>
						<div className="divide-y divide-border rounded-xl border border-border bg-card">
							{FAQS.map((f) => (
								<details
									key={f.q}
									className="group px-5 [&_summary::-webkit-details-marker]:hidden"
								>
									<summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium">
										{f.q}
										<span
											aria-hidden="true"
											className="text-xl font-light text-muted-foreground transition-transform duration-200 group-open:rotate-45"
										>
											+
										</span>
									</summary>
									<p className="-mt-1 pb-5 text-[15px] leading-relaxed text-body">
										{f.a}
									</p>
								</details>
							))}
						</div>
					</FadeIn>
				</div>
			</section>

			{/* Final CTA */}
			<section className="border-t border-border">
				<FadeIn className="mx-auto max-w-[1100px] px-5 py-24 text-center sm:px-8 sm:py-28">
					<H2>Open a Vichar account</H2>
					<p className="mt-4 text-[15px] text-body">
						One key, {models.length} models, and a dashboard that shows where
						every token goes.
					</p>
					<a
						href={site.urls.signup}
						className="mt-8 inline-flex h-12 items-center rounded-md bg-primary px-8 text-[17px] font-medium text-primary-foreground transition-colors hover:bg-brand-strong"
					>
						Sign up for free
					</a>
				</FadeIn>
			</section>
		</main>
	);
}
