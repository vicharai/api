import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { BentoFeatures } from "@/components/bento";
import { CodeCard } from "@/components/code-card";
import { DashboardShot } from "@/components/dashboard-shot";
import { FailoverViz } from "@/components/failover-viz";
import { ModelSwitcher } from "@/components/model-switcher";
import { Reveal } from "@/components/reveal";
import {
	fetchCatalog,
	formatContext,
	formatPrice,
	type CatalogModel,
} from "@/lib/models";
import { site } from "@/lib/site";
import { VicharMark } from "@/lib/vichar-logo";

const DIFF_SNIPPET = `const client = new OpenAI({
-  apiKey: process.env.OPENAI_API_KEY,
+  baseURL: "https://api.vichar.io/v1",
+  apiKey: process.env.VICHAR_API_KEY,
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
	TypeScript: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.vichar.io/v1",
  apiKey: process.env.VICHAR_API_KEY,
});

const resp = await client.chat.completions.create({
  model: "vichar-sonnet-5.5",
  messages: [{ role: "user", "content": "Hello" }],
});`,
};

const LABS = [
	{ name: "OpenAI", icon: "openai" },
	{ name: "Claude", icon: "claude" },
	{ name: "Gemini", icon: "gemini" },
	{ name: "Grok", icon: "grok" },
	{ name: "Muse", icon: "meta" },
	{ name: "DeepSeek", icon: "deepseek" },
	{ name: "Kimi", icon: "kimi" },
	{ name: "Qwen", icon: "qwen" },
	{ name: "GLM", icon: "zai" },
	{ name: "MiniMax", icon: "minimax" },
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

const SWITCHER_IDS = [
	"vichar-opus-5.5",
	"vichar-gpt-5.6",
	"vichar-gemini-3.1-pro",
	"vichar-grok-4.7",
	"vichar-deepseek-v4-pro",
	"vichar-kimi-k3",
];

const PRIVACY_ITEMS = [
	{
		title: "Prompts are not stored",
		body: "By default we keep request metadata only: tokens, cost, latency, and which route served the request.",
	},
	{
		title: "Keys hashed at rest",
		body: "API keys are stored as hashes; the full token is shown once at creation and never retrievable again.",
	},
	{
		title: "Limits and revocation",
		body: "Per-key spend limits and instant revocation cap the blast radius if a key leaks.",
	},
	{
		title: "Encrypted in transit",
		body: "The API is HTTPS only; all traffic between you, the gateway, and providers is TLS-encrypted.",
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
		q: "Can I set spending limits?",
		a: "Yes. Every API key can carry its own spend limit, so a runaway workload cannot drain your balance.",
	},
];

function SectionHeading({
	eyebrow,
	title,
	sub,
}: {
	eyebrow?: string;
	title: string;
	sub?: string;
}) {
	return (
		<div className="reveal max-w-2xl">
			{eyebrow && (
				<p className="text-xs font-medium uppercase tracking-wider text-brand">
					{eyebrow}
				</p>
			)}
			<h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
				{title}
			</h2>
			{sub && (
				<p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
					{sub}
				</p>
			)}
		</div>
	);
}

export default async function Home() {
	const models = await fetchCatalog();

	const previewOrder = [
		"vichar-opus-5.5",
		"vichar-gpt-5.6",
		"vichar-gemini-3.1-pro",
		"vichar-grok-4.7",
		"vichar-sonnet-5.5",
		"vichar-deepseek-v4-pro",
	];
	const previewModels = previewOrder
		.map((id) => models.find((m) => m.id === id && !m.free))
		.filter((m): m is CatalogModel => m !== undefined);

	const switcherModels = SWITCHER_IDS.map((id) =>
		models.find((m) => m.id === id),
	)
		.filter((m): m is CatalogModel => m !== undefined)
		.map((m) => ({
			id: m.id,
			displayName: m.displayName,
			contextLength: m.contextLength,
			inputPerMillion: m.inputPerMillion,
			outputPerMillion: m.outputPerMillion,
		}));

	return (
		<main>
			<Reveal />

			{/* Hero */}
			<section className="relative overflow-hidden">
				<div
					aria-hidden="true"
					className="hero-grid pointer-events-none absolute inset-0"
				/>
				<div className="relative mx-auto grid max-w-[1200px] gap-14 px-5 pb-24 pt-20 sm:px-8 md:pt-28 grid-cols-1 lg:grid-cols-2 lg:items-center">
					<div className="reveal min-w-0">
						<span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
							<span className="size-1.5 rounded-full bg-brand" />
							OpenAI-compatible API
						</span>
						<h1 className="mt-6 font-display text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-[64px]">
							One API for every model.
						</h1>
						<p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
							Route requests across providers, track every token and dollar, and
							switch models without changing your code.
						</p>
						<div className="mt-8 flex flex-wrap items-center gap-3">
							<a
								href={site.urls.signup}
								className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
							>
								Get API key
								<ArrowRight className="size-4" />
							</a>
							<a
								href={site.urls.docs}
								className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
							>
								Read the docs
							</a>
						</div>
						<p className="mt-4 text-sm text-muted-foreground">
							Pay per token. No subscription.
						</p>
					</div>
					<div className="reveal relative flex min-w-0 items-center justify-center">
						{/* Two baked renders, one per theme, so the glass refracts real
							content and the art blends into the page background. */}
						<img
							src="/hero/cloud-glass-light.webp"
							alt=""
							aria-hidden="true"
							width={1200}
							height={936}
							fetchPriority="high"
							className="hero-cloud w-[280px] sm:w-[420px] lg:w-[520px] dark:hidden"
						/>
						<img
							src="/hero/cloud-glass-dark.webp"
							alt=""
							aria-hidden="true"
							width={1200}
							height={936}
							fetchPriority="high"
							className="hero-cloud hidden w-[280px] sm:w-[420px] lg:w-[520px] dark:block"
						/>
					</div>
				</div>
			</section>

			{/* Logo strip */}
			<section className="border-y border-border/60 py-10">
				<div className="mx-auto max-w-[1200px] px-5 sm:px-8">
					<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Models from
					</p>
					<ul className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4">
						{LABS.map((lab) => (
							<li
								key={lab.name}
								className="flex items-center gap-2.5 opacity-60 transition-opacity hover:opacity-100"
							>
								{/* LobeHub icons (MIT), see public/labs/LICENSE-NOTICE.txt */}
								<img
									src={`/labs/${lab.icon}.svg`}
									alt=""
									className="size-6 dark:invert"
									loading="lazy"
								/>
								<span className="text-sm font-medium text-muted-foreground">
									{lab.name}
								</span>
							</li>
						))}
					</ul>
				</div>
			</section>

			{/* Product shot */}
			<section className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[96px]">
				<SectionHeading
					eyebrow="Dashboard"
					title="Everything in one dashboard."
					sub="Usage, spend, keys and requests for every model, in real time."
				/>
				<div className="reveal mt-12">
					{/* Scaled mock: fixed 1200px canvas shrunk via container-query units
						so it stays dashboard-shaped at any width. */}
					<div className="w-full" style={{ containerType: "inline-size" }}>
						<div
							style={{ aspectRatio: "1140 / 620" }}
							className="relative overflow-hidden"
						>
							<div
								className="absolute left-0 top-0 w-[1140px] origin-top-left"
								style={{ transform: "scale(calc(100cqw / 1140))" }}
							>
								<DashboardShot />
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* One request. Any model. */}
			<section className="border-t border-border/60">
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-5 py-[72px] sm:px-8 sm:py-[96px] lg:grid-cols-2">
					<div className="reveal">
						<SectionHeading
							eyebrow="One request"
							title="One request. Any model."
							sub="Switch models by changing one string. Same request, same SDK."
						/>
						<ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
							<li className="flex items-center gap-2.5">
								<span className="size-1 rounded-full bg-brand" />
								Same request body for every model
							</li>
							<li className="flex items-center gap-2.5">
								<span className="size-1 rounded-full bg-brand" />
								Prices and context from the live catalogue
							</li>
							<li className="flex items-center gap-2.5">
								<span className="size-1 rounded-full bg-brand" />
								Pin a model or use auto for smart routing
							</li>
						</ul>
					</div>
					<div className="reveal">
						<ModelSwitcher models={switcherModels} />
					</div>
				</div>
			</section>

			{/* Built for production (bento) */}
			<section className="border-t border-border/60">
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[96px]">
					<SectionHeading
						eyebrow="Controls"
						title="Built for production."
						sub="Spend limits, expiring keys, smart routing and caching come standard."
					/>
					<BentoFeatures />
				</div>
			</section>

			{/* Reliability */}
			<section className="border-t border-border/60">
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-5 py-[72px] sm:px-8 sm:py-[96px] lg:grid-cols-2">
					<div className="reveal">
						<SectionHeading
							eyebrow="Reliability"
							title="Retries and failover, built in."
							sub="When a provider errors or times out, the request is retried and rerouted to another available route for the same model. Failed attempts are not billed."
						/>
					</div>
					<div className="reveal min-w-0">
						<FailoverViz />
					</div>
				</div>
			</section>

			{/* Switch in two lines */}
			<section className="border-t border-border/60">
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-5 py-[72px] sm:px-8 sm:py-[96px] lg:grid-cols-2">
					<div className="reveal">
						<h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
							Switch in two lines.
						</h2>
						<p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
							Already using the OpenAI SDK? Point it at Vichar and keep the rest
							of your code.
						</p>
					</div>
					<div className="reveal min-w-0">
						<CodeCard
							snippets={{ Diff: DIFF_SNIPPET, ...SNIPPETS }}
							diffTabs={["Diff"]}
						/>
					</div>
				</div>
			</section>

			{/* Works with */}
			<section className="border-t border-border/60">
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[96px]">
					<SectionHeading
						eyebrow="Integrations"
						title="Works with your stack."
						sub="Any SDK or coding tool that accepts an OpenAI-compatible base URL works with Vichar."
					/>
					<ul className="reveal mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
						{TOOLS.map((t) => (
							<li key={t.name}>
								<a
									href={t.href}
									target="_blank"
									rel="noreferrer"
									className="flex items-center gap-2.5 text-muted-foreground opacity-60 transition-opacity hover:opacity-100"
								>
									{/* LobeHub icons (MIT), see public/tools/LICENSE-NOTICE.txt */}
									<img
										src={`/tools/${t.icon}.svg`}
										alt=""
										className="size-6 dark:invert"
										loading="lazy"
									/>
									<span className="text-sm font-medium">{t.name}</span>
								</a>
							</li>
						))}
					</ul>
				</div>
			</section>

			{/* Models preview */}
			<section className="border-t border-border/60">
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[96px]">
					<div className="reveal flex flex-wrap items-end justify-between gap-4">
						<SectionHeading title="Models" />
						<Link
							href="/models/"
							className="text-sm font-medium text-brand hover:underline"
						>
							Browse all models
						</Link>
					</div>
					<div className="reveal mt-10 overflow-x-auto rounded-2xl border border-border bg-card">
						<table className="w-full min-w-[480px] text-left text-sm">
							<thead>
								<tr className="border-b border-border text-xs text-muted-foreground">
									<th className="px-4 py-3 font-medium">Model</th>
									<th className="px-4 py-3 font-medium">Context</th>
									<th className="px-4 py-3 font-medium">Input</th>
									<th className="px-4 py-3 font-medium">Output</th>
								</tr>
							</thead>
							<tbody>
								{previewModels.map((m) => (
									<tr
										key={m.id}
										className="border-b border-border/50 last:border-0"
									>
										<td className="px-4 py-3">
											<Link
												href={`/models/${m.id}/`}
												className="font-medium hover:text-brand"
											>
												{m.displayName}
											</Link>
											<div className="font-mono text-xs text-muted-foreground">
												{m.id}
											</div>
										</td>
										<td className="px-4 py-3 text-muted-foreground">
											{formatContext(m.contextLength)}
										</td>
										<td className="px-4 py-3 font-mono text-xs">
											{formatPrice(m.inputPerMillion)}
											<span className="text-muted-foreground"> /M</span>
										</td>
										<td className="px-4 py-3 font-mono text-xs">
											{formatPrice(m.outputPerMillion)}
											<span className="text-muted-foreground"> /M</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			{/* Privacy & security */}
			<section className="border-t border-border/60">
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[96px]">
					<SectionHeading
						eyebrow="Privacy"
						title="Privacy and control by default."
						sub="Your traffic is yours. Metadata for billing, nothing more."
					/>
					<div className="reveal mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{PRIVACY_ITEMS.map((it) => (
							<div
								key={it.title}
								className="rounded-2xl border border-border bg-card p-5"
							>
								<span className="mb-3 block h-px w-8 bg-brand" />
								<h3 className="text-sm font-semibold">{it.title}</h3>
								<p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
									{it.body}
								</p>
							</div>
						))}
					</div>
					<p className="reveal mt-6 text-sm text-muted-foreground">
						Details in the{" "}
						<Link href="/legal/privacy/" className="text-brand hover:underline">
							Privacy Policy
						</Link>
						.
					</p>
				</div>
			</section>

			{/* Pricing band */}
			<section className="border-t border-border/60 bg-secondary/40">
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[96px]">
					<div className="reveal flex flex-wrap items-center justify-between gap-8">
						<div className="max-w-xl">
							<h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
								Model rates plus 5% on top-ups. That's the whole bill.
							</h2>
							<ul className="mt-5 space-y-2 text-sm text-muted-foreground">
								<li>No subscription or minimum spend</li>
								<li>Spend limits per API key</li>
								<li>Invoices for every top-up</li>
							</ul>
						</div>
						<Link
							href="/pricing/"
							className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-medium transition-colors hover:bg-accent"
						>
							See pricing
							<ArrowRight className="size-4" />
						</Link>
					</div>
				</div>
			</section>

			{/* FAQ */}
			<section className="mx-auto max-w-[760px] px-5 py-[72px] sm:px-8 sm:py-[96px]">
				<SectionHeading title="Frequently asked questions" />
				<div className="reveal mt-10 divide-y divide-border border-y border-border">
					{FAQS.map((f) => (
						<details key={f.q} className="group py-4">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium marker:hidden">
								{f.q}
								<span className="text-muted-foreground transition-transform group-open:rotate-45">
									+
								</span>
							</summary>
							<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
								{f.a}
							</p>
						</details>
					))}
				</div>
			</section>

			{/* Final CTA */}
			<section className="border-t border-border/60">
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] text-center sm:px-8 sm:py-[96px]">
					<div className="reveal mx-auto max-w-xl">
						<VicharMark className="mx-auto size-8 text-brand" />
						<h2 className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
							Start building in minutes.
						</h2>
						<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
							<a
								href={site.urls.signup}
								className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
							>
								Get API key
								<ArrowRight className="size-4" />
							</a>
							<a
								href={site.urls.docs}
								className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-accent"
							>
								Read the docs
							</a>
						</div>
					</div>
				</div>
			</section>
		</main>
	);
}
