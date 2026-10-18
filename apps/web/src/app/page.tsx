import {
	ArrowRight,
	BarChart3,
	Check,
	KeyRound,
	Lock,
	Plug,
	Rocket,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import Link from "next/link";

import { CodeWindow } from "@/components/code-window";
import { DashboardShot } from "@/components/dashboard-shot";
import { Faq } from "@/components/faq";
import { FeatureCards } from "@/components/feature-cards";
import {
	HeroPlayground,
	type PlaygroundModel,
} from "@/components/hero-playground";
import { HeroShot } from "@/components/hero-shot";
import { JsonLd } from "@/components/json-ld";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { ProviderLogo } from "@/components/provider-logo";
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
import { PROVIDERS } from "@/lib/providers";
import { site } from "@/lib/site";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	alternates: { canonical: "/" },
};

const SNIPPETS: Record<string, string> = {
	Migrate: `import OpenAI from "openai";

const client = new OpenAI({
-  apiKey: process.env.OPENAI_API_KEY,
+  baseURL: "https://api.vichar.io/v1",
+  apiKey: process.env.VICHAR_API_KEY,
});

const res = await client.chat.completions.create({
  model: "vichar-sonnet-5.5",
  messages: [{ role: "user", content: "Hello" }],
  stream: true,
});`,
	Python: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.vichar.io/v1",
    api_key="YOUR_API_KEY",
)

res = client.chat.completions.create(
    model="vichar-gemini-3.1-pro",
    messages=[{"role": "user", "content": "Hello"}],
)
print(res.choices[0].message.content)`,
	cURL: `curl https://api.vichar.io/v1/chat/completions \\
  -H "Authorization: Bearer $VICHAR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "vichar-opus-5.5",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
};

const PLAYGROUND_IDS: Array<[string, string, string]> = [
	["vichar-opus-5.5", "Opus 5.5", "anthropic"],
	["vichar-gpt-5.6", "GPT-5.6", "openai"],
	["vichar-gemini-3.1-pro", "Gemini 3.1 Pro", "google-ai-studio"],
	["vichar-grok-4.7", "Grok 4.7", "xai"],
	["vichar-deepseek-v4-pro", "DeepSeek V4", "deepseek"],
	["vichar-kimi-k3", "Kimi K3", "moonshot"],
];

const PREVIEW_IDS = [
	"vichar-opus-5.5",
	"vichar-gpt-5.6",
	"vichar-gemini-3.1-pro",
	"vichar-grok-4.7",
	"vichar-sonnet-5.5",
	"vichar-deepseek-v4-pro",
	"vichar-kimi-k3",
	"vichar-qwen3.8-max",
];

const TOOLS = [
	{ name: "OpenAI SDK", icon: "openai", href: `${site.urls.docs}/openai-sdk` },
	{
		name: "Vercel AI SDK",
		icon: "vercel",
		href: `${site.urls.docs}/vercel-ai-sdk`,
	},
	{ name: "LangChain", icon: "langchain", href: `${site.urls.docs}/langchain` },
	{
		name: "OpenCode",
		icon: "opencode",
		href: `${site.urls.docs}/coding-tools`,
	},
	{ name: "Cline", icon: "cline", href: `${site.urls.docs}/coding-tools` },
];

const STEPS = [
	{
		icon: KeyRound,
		tone: "bg-g-blue text-white",
		title: "Create an API key",
		body: "Sign up, add credits from $20, and create a key with its own spend limit and expiry.",
	},
	{
		icon: Plug,
		tone: "bg-g-red text-white",
		title: "Change your base URL",
		body: "Point any OpenAI-compatible SDK at api.vichar.io/v1. The rest of your code stays the same.",
	},
	{
		icon: Rocket,
		tone: "bg-g-yellow text-[#202124]",
		title: "Ship on any model",
		body: "Pick models per request, and watch tokens, latency and cost per key in the dashboard.",
	},
];

const SECURITY = [
	{
		icon: Trash2,
		tone: "bg-g-blue-soft text-g-blue-deep",
		title: "Prompts are not stored",
		body: "By default we keep only billing metadata: tokens, cost, latency and provider.",
	},
	{
		icon: Lock,
		tone: "bg-g-green-soft text-g-green-deep",
		title: "Keys hashed at rest",
		body: "Keys are stored as one-way SHA-256 hashes and shown in full only once.",
	},
	{
		icon: ShieldCheck,
		tone: "bg-g-red-soft text-g-red-deep",
		title: "Encrypted in transit",
		body: "HTTPS only, TLS 1.2+, between your app, Vichar and every provider.",
	},
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

function Heading({
	title,
	sub,
	center = false,
}: {
	title: ReactNode;
	sub?: string;
	center?: boolean;
}) {
	return (
		<FadeIn className={center ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
			<h2 className="text-[34px] font-normal leading-[1.15] tracking-[-0.01em] text-foreground sm:text-[44px]">
				{title}
			</h2>
			{sub && <p className="mt-4 text-lg leading-relaxed text-body">{sub}</p>}
		</FadeIn>
	);
}

function PillLink({
	href,
	children,
	variant = "filled",
}: {
	href: string;
	children: ReactNode;
	variant?: "filled" | "outlined" | "text";
}) {
	const cls = {
		filled:
			"bg-primary text-primary-foreground hover:bg-brand-strong hover:shadow-[0_1px_3px_1px_rgb(60_64_67/0.15),0_1px_2px_rgb(60_64_67/0.3)]",
		outlined:
			"border border-border text-g-blue hover:bg-g-blue-soft hover:border-transparent",
		text: "text-g-blue hover:bg-g-blue-soft",
	}[variant];
	return (
		<a
			href={href}
			className={`group inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition-all ${cls}`}
		>
			{children}
		</a>
	);
}

export default async function Home() {
	const models = await fetchCatalog();
	const labCount = new Set(models.map(labForModel).filter(Boolean)).size;
	const maxContext = Math.max(...models.map((m) => m.contextLength));

	const playground: PlaygroundModel[] = PLAYGROUND_IDS.flatMap(
		([id, name, logo]) => {
			const m = models.find((x) => x.id === id);
			return m
				? [
						{
							id,
							name,
							logo,
							inputPerMillion: m.inputPerMillion,
							outputPerMillion: m.outputPerMillion,
						},
					]
				: [];
		},
	);
	const previewModels = PREVIEW_IDS.map((id) =>
		models.find((m) => m.id === id && !m.free),
	).filter((m): m is CatalogModel => m !== undefined);

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
		<main className="overflow-x-clip">
			<JsonLd data={ld} />

			{/* Hero */}
			<section className="mx-auto grid max-w-[1240px] items-center gap-16 px-5 pb-24 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-32">
				<div className="min-w-0">
					<a
						href={`${site.urls.docs}/quick-start`}
						className="rise group inline-flex items-center gap-2.5 rounded-full bg-surface-2 py-1.5 pl-2 pr-4 text-sm text-body transition-colors hover:bg-g-blue-soft hover:text-g-blue-deep"
					>
						<span className="flex gap-0.5">
							<span className="size-2 rounded-full bg-g-blue" />
							<span className="size-2 rounded-full bg-g-red" />
							<span className="size-2 rounded-full bg-g-yellow" />
							<span className="size-2 rounded-full bg-g-green" />
						</span>
						{models.length} models, one OpenAI-compatible API
						<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
					</a>
					<h1
						className="rise mt-7 text-[40px] font-normal leading-[1.06] tracking-[-0.025em] sm:text-[64px] lg:text-[72px]"
						style={{ "--d": "60ms" } as React.CSSProperties}
					>
						Build with <span className="text-g-blue">every AI model</span>{" "}
						through one API
					</h1>
					<p
						className="rise mt-6 max-w-[540px] text-lg leading-relaxed text-body sm:text-xl"
						style={{ "--d": "120ms" } as React.CSSProperties}
					>
						Frontier models from {labCount}+ labs behind a single key, with
						automatic failover, per-key spend limits and real-time cost
						analytics. Pay the listed per-token rate.
					</p>
					<div
						className="rise mt-9 grid gap-3 sm:flex sm:flex-wrap"
						style={{ "--d": "180ms" } as React.CSSProperties}
					>
						<PillLink href={site.urls.signup}>
							Get your API key
							<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
						</PillLink>
						<PillLink href={site.urls.docs} variant="outlined">
							Read the docs
						</PillLink>
					</div>
					<ul
						className="rise mt-9 flex flex-wrap gap-x-7 gap-y-2 text-sm text-body"
						style={{ "--d": "240ms" } as React.CSSProperties}
					>
						{[
							"No subscription",
							"0% token markup",
							"Failed calls are free",
						].map((t) => (
							<li key={t} className="flex items-center gap-2">
								<Check className="size-4 text-g-green" strokeWidth={2.5} />
								{t}
							</li>
						))}
					</ul>
				</div>
				<div
					className="rise relative mx-auto w-full min-w-0 max-w-[560px]"
					style={{ "--d": "200ms" } as React.CSSProperties}
				>
					<div className="rounded-[36px] bg-g-blue-soft p-2.5 sm:p-5">
						<HeroPlayground models={playground} />
					</div>
				</div>
			</section>

			{/* Labs strip */}
			<section aria-label="AI labs" className="bg-canvas py-12">
				<div className="mx-auto max-w-[1240px] px-5 sm:px-8">
					<p className="text-center text-sm text-body">
						Frontier models from the labs you already use
					</p>
					<Stagger
						className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-6"
						gap={0.05}
					>
						{PROVIDERS.map((p) => (
							<StaggerItem key={p.id}>
								<span className="group flex items-center gap-2.5 text-body grayscale transition-all hover:text-foreground hover:grayscale-0">
									<ProviderLogo id={p.id} className="size-6 text-foreground" />
									<span className="text-[15px] font-medium">{p.name}</span>
								</span>
							</StaggerItem>
						))}
					</Stagger>
				</div>
			</section>

			{/* Features */}
			<section className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 sm:py-32">
				<Heading
					center
					title="Everything you need to ship AI to production"
					sub="One integration gives you the whole frontier, with the controls a production workload needs."
				/>
				<div className="mt-16">
					<FeatureCards />
				</div>
			</section>

			{/* Routing */}
			<section className="bg-canvas">
				<div className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 sm:py-32">
					<div className="grid gap-12 lg:grid-cols-[1fr_auto] lg:items-end">
						<Heading
							title="One request. Any model."
							sub="Your app sends one request. Vichar routes it to the lab that serves the model you asked for, with the same request and response shape every time."
						/>
						<Stagger className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4 sm:gap-10">
							{[
								[`${models.length}`, "Models", "text-g-blue"],
								[`${labCount}+`, "Labs", "text-g-red"],
								[
									`${formatContext(maxContext)}`,
									"Max context",
									"text-g-yellow-deep",
								],
								["0%", "Markup", "text-g-green-deep"],
							].map(([v, l, c]) => (
								<StaggerItem key={l}>
									<p className={`text-[40px] font-normal leading-none ${c}`}>
										{v}
									</p>
									<p className="mt-2 text-sm text-body">{l}</p>
								</StaggerItem>
							))}
						</Stagger>
					</div>
					<FadeIn className="mt-14 rounded-[32px] bg-card p-6 sm:p-10">
						<RoutingFlow />
						<div className="mt-6 flex flex-wrap justify-center gap-2">
							{[
								"POST /v1/chat/completions",
								"POST /v1/messages",
								"GET /v1/models",
							].map((e) => (
								<code
									key={e}
									className="rounded-full bg-surface-2 px-3 py-1 font-mono text-xs text-body"
								>
									{e}
								</code>
							))}
						</div>
					</FadeIn>
				</div>
			</section>

			{/* Developers (dark) */}
			<section className="px-3 py-24 sm:px-6 sm:py-32">
				<div className="mx-auto max-w-[1320px] rounded-[40px] bg-code px-6 py-16 text-white sm:px-14 sm:py-20">
					<div className="grid gap-14 lg:grid-cols-[1fr_1.15fr] lg:items-center">
						<FadeIn>
							<p className="text-sm font-medium text-[#8ab4f8]">
								For developers
							</p>
							<h2 className="mt-4 text-[34px] font-normal leading-[1.15] tracking-[-0.01em] sm:text-[44px]">
								Change two lines.
								<br />
								<span className="text-white/55">Keep your SDK.</span>
							</h2>
							<p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">
								Streaming, tool calling and structured outputs work the same way
								across every lab. The Anthropic Messages format works too.
							</p>
							<ul className="mt-9 grid gap-2 sm:grid-cols-2">
								{TOOLS.map((t) => (
									<li key={t.name}>
										<a
											href={t.href}
											className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 text-sm font-medium transition-colors hover:bg-white/[0.12]"
										>
											<img
												src={`/tools/${t.icon}.svg`}
												alt=""
												className="size-5 invert"
												loading="lazy"
											/>
											{t.name}
											<ArrowRight className="ml-auto size-4 text-white/40" />
										</a>
									</li>
								))}
							</ul>
						</FadeIn>
						<FadeIn delay={0.1} className="min-w-0">
							<CodeWindow snippets={SNIPPETS} filename="app.ts" />
						</FadeIn>
					</div>
				</div>
			</section>

			{/* Dashboard */}
			<section className="mx-auto max-w-[1240px] px-5 pb-24 sm:px-8 sm:pb-32">
				<Heading
					center
					title="Your whole AI spend, in one dashboard"
					sub="Requests, tokens, latency and cost for every key, project, model and provider, updated in real time."
				/>
				<FadeIn className="mt-14 rounded-[40px] bg-g-blue-soft px-4 pt-8 sm:px-12 sm:pt-14">
					<div className="overflow-hidden rounded-t-[20px]">
						<HeroShot>
							<ScaleToFit width={1140} height={782}>
								<DashboardShot />
							</ScaleToFit>
						</HeroShot>
					</div>
				</FadeIn>
				<Stagger className="mt-10 grid gap-8 sm:grid-cols-3">
					{[
						{
							icon: BarChart3,
							tone: "bg-g-blue-soft text-g-blue-deep",
							t: "Cost per key and model",
							b: "Find the expensive workload in seconds.",
						},
						{
							icon: KeyRound,
							tone: "bg-g-yellow-soft text-g-yellow-deep",
							t: "Keys with budgets",
							b: "Spend caps, expiry and one-click revoke.",
						},
						{
							icon: ShieldCheck,
							tone: "bg-g-green-soft text-g-green-deep",
							t: "Errors and reliability",
							b: "Error rates and retries per provider.",
						},
					].map((c) => (
						<StaggerItem key={c.t} className="flex gap-4">
							<span
								className={`flex size-11 shrink-0 items-center justify-center rounded-full ${c.tone}`}
							>
								<c.icon className="size-5" />
							</span>
							<div>
								<h3 className="text-[17px] font-medium">{c.t}</h3>
								<p className="mt-1 text-[15px] text-body">{c.b}</p>
							</div>
						</StaggerItem>
					))}
				</Stagger>
			</section>

			{/* How it works */}
			<section className="bg-canvas">
				<div className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 sm:py-32">
					<Heading center title="Start in minutes" />
					<Stagger
						className="relative mt-16 grid gap-10 md:grid-cols-3"
						gap={0.15}
					>
						<div
							aria-hidden="true"
							className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-0.5 bg-border md:block"
						/>
						{STEPS.map((s, i) => (
							<StaggerItem
								key={s.title}
								className="relative flex gap-5 md:block md:text-center"
							>
								<span
									className={`flex size-12 shrink-0 items-center justify-center rounded-full ring-8 ring-canvas md:mx-auto md:size-14 ${s.tone}`}
								>
									<s.icon className="size-6" />
								</span>
								<div className="min-w-0">
									<p className="text-sm font-medium text-muted-foreground md:mt-6">
										Step {i + 1}
									</p>
									<h3 className="mt-1 text-[22px] font-medium tracking-tight">
										{s.title}
									</h3>
									<p className="mt-2 max-w-xs text-[15px] leading-relaxed text-body md:mx-auto">
										{s.body}
									</p>
								</div>
							</StaggerItem>
						))}
					</Stagger>
				</div>
			</section>

			{/* Models */}
			<section className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 sm:py-32">
				<div className="flex flex-wrap items-end justify-between gap-6">
					<Heading
						title="Frontier models, ready to call"
						sub="Live per-token pricing from the catalogue."
					/>
					<FadeIn>
						<Link
							href="/models/"
							className="group inline-flex h-12 items-center gap-2 rounded-full border border-border px-6 text-[15px] font-medium text-g-blue transition-colors hover:border-transparent hover:bg-g-blue-soft"
						>
							Browse all {models.length} models
							<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
						</Link>
					</FadeIn>
				</div>
				<FadeIn className="mt-10 sm:hidden">
					<ul className="divide-y divide-border rounded-[24px] border border-border">
						{previewModels.map((m) => (
							<li key={m.id}>
								<Link
									href={`/models/${m.id}/`}
									className="flex items-center gap-3 px-4 py-4"
								>
									<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
										<ProviderLogo
											id={labForModel(m)}
											className="size-5 text-foreground"
										/>
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium">
											{m.displayName}
										</span>
										<span className="block text-[13px] text-body">
											{formatContext(m.contextLength)} context
										</span>
									</span>
									<span className="text-right font-mono text-[13px] tabular-nums">
										{formatPrice(m.inputPerMillion)}
										<span className="block text-muted-foreground">
											{formatPrice(m.outputPerMillion)}
										</span>
									</span>
								</Link>
							</li>
						))}
					</ul>
					<p className="mt-3 text-right text-xs text-muted-foreground">
						Input / output per 1M tokens
					</p>
				</FadeIn>
				<FadeIn className="mt-12 hidden overflow-x-auto rounded-[24px] border border-border sm:block">
					<table className="w-full text-left text-[15px] sm:min-w-[720px]">
						<thead>
							<tr className="bg-canvas text-sm text-body">
								<th className="px-6 py-4 font-medium">Model</th>
								<th className="hidden px-4 py-4 font-medium sm:table-cell">
									Context
								</th>
								<th className="px-4 py-4 text-right font-medium">Input / 1M</th>
								<th className="px-6 py-4 text-right font-medium">
									Output / 1M
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{previewModels.map((m) => {
								const lab = labForModel(m);
								return (
									<tr key={m.id} className="transition-colors hover:bg-canvas">
										<td className="px-6 py-4">
											<Link
												href={`/models/${m.id}/`}
												className="flex items-center gap-3"
											>
												<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
													<ProviderLogo
														id={lab}
														className="size-5 text-foreground"
													/>
												</span>
												<span>
													<span className="block font-medium text-foreground hover:text-g-blue">
														{m.displayName}
													</span>
													<span className="block text-[13px] text-body">
														{LAB_LABELS[lab] ?? "Vichar"} ·{" "}
														<span className="font-mono">{m.id}</span>
													</span>
												</span>
											</Link>
										</td>
										<td className="hidden px-4 py-4 sm:table-cell">
											<span className="rounded-full bg-g-blue-soft px-2.5 py-1 text-[13px] font-medium text-g-blue-deep">
												{formatContext(m.contextLength)}
											</span>
										</td>
										<td className="px-4 py-4 text-right font-mono tabular-nums">
											{formatPrice(m.inputPerMillion)}
										</td>
										<td className="px-6 py-4 text-right font-mono tabular-nums">
											{formatPrice(m.outputPerMillion)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</FadeIn>
			</section>

			{/* Pricing */}
			<section className="bg-canvas">
				<div className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 sm:py-32">
					<Heading
						center
						title="Simple, honest pricing"
						sub="Listed model rates, a flat fee when you add credits, and nothing for requests that fail."
					/>
					<Stagger className="mt-10 grid gap-3 sm:mt-14 md:grid-cols-3 md:gap-5">
						{[
							{
								v: "0%",
								c: "text-g-blue",
								t: "Token markup",
								b: "Every request is billed at the model's published input and output rate.",
							},
							{
								v: "5%",
								c: "text-g-yellow-deep",
								t: "Top-up fee",
								b: "A flat platform fee when you add credits. A $20 top-up costs $21.",
							},
							{
								v: "$0",
								c: "text-g-green-deep",
								t: "For failed requests",
								b: "Requests that fail before a provider answers never deduct credits.",
							},
						].map((p) => (
							<StaggerItem
								key={p.t}
								className="flex items-center gap-5 rounded-[24px] bg-card p-5 transition-shadow hover:shadow-[0_1px_3px_rgb(60_64_67/0.15),0_4px_8px_3px_rgb(60_64_67/0.08)] md:block md:rounded-[28px] md:p-8"
							>
								<p
									className={`w-[84px] shrink-0 text-[44px] font-normal leading-none md:w-auto md:text-[64px] ${p.c}`}
								>
									{p.v}
								</p>
								<div className="min-w-0">
									<h3 className="text-[17px] font-medium md:mt-6 md:text-[20px]">
										{p.t}
									</h3>
									<p className="mt-1 text-sm leading-relaxed text-body md:mt-2 md:text-[15px]">
										{p.b}
									</p>
								</div>
							</StaggerItem>
						))}
					</Stagger>
					<div className="mt-10 flex justify-center">
						<PillLink href="/pricing/" variant="text">
							See pricing and cost calculator
							<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
						</PillLink>
					</div>
				</div>
			</section>

			{/* Security */}
			<section className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 sm:py-32">
				<Heading
					title="Private and secure by default"
					sub="We keep the metadata needed to bill you, nothing more."
				/>
				<Stagger className="mt-10 grid gap-7 md:mt-14 md:grid-cols-3 md:gap-10">
					{SECURITY.map((s) => (
						<StaggerItem key={s.title} className="flex gap-4 md:block">
							<span
								className={`flex size-12 shrink-0 items-center justify-center rounded-2xl md:size-14 ${s.tone}`}
							>
								<s.icon className="size-6" />
							</span>
							<div className="min-w-0">
								<h3 className="text-[17px] font-medium md:mt-6 md:text-[20px]">
									{s.title}
								</h3>
								<p className="mt-1 text-[15px] leading-relaxed text-body md:mt-2">
									{s.body}
								</p>
							</div>
						</StaggerItem>
					))}
				</Stagger>
			</section>

			{/* FAQ */}
			<section className="mx-auto grid max-w-[1240px] gap-12 px-5 pb-24 sm:px-8 sm:pb-32 lg:grid-cols-[1fr_1.7fr]">
				<Heading title="Questions, answered" />
				<FadeIn>
					<Faq items={FAQS} />
					<p className="mt-6 text-[15px] text-body">
						Something else?{" "}
						<Link
							href="/contact/"
							className="font-medium text-g-blue hover:underline"
						>
							Contact us
						</Link>
					</p>
				</FadeIn>
			</section>

			{/* CTA */}
			<section className="px-3 pb-24 sm:px-6 sm:pb-32">
				<FadeIn className="relative mx-auto max-w-[1320px] overflow-hidden rounded-[40px] bg-[#1a73e8] px-6 py-20 text-center text-white sm:py-28">
					<div className="relative">
						<h2 className="mx-auto max-w-2xl text-[36px] font-normal leading-tight tracking-[-0.01em] sm:text-[52px]">
							Start building with every model today
						</h2>
						<p className="mt-5 text-lg text-white/85">
							One key, {models.length} models, and you only pay for what you
							use.
						</p>
						<div className="mt-10 flex flex-wrap justify-center gap-3">
							<a
								href={site.urls.signup}
								className="group inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-[15px] font-medium text-[#1a73e8] transition-shadow hover:shadow-[0_4px_12px_rgb(0_0_0/0.2)]"
							>
								Get your API key
								<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
							</a>
							<a
								href={site.urls.docs}
								className="inline-flex h-12 items-center rounded-full border border-white/40 px-7 text-[15px] font-medium transition-colors hover:bg-white/10"
							>
								Read the docs
							</a>
						</div>
					</div>
				</FadeIn>
			</section>
		</main>
	);
}
