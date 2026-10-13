import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";

import { BentoFeatures } from "@/components/bento";
import { CodeCard } from "@/components/code-card";
import { DashboardShot } from "@/components/dashboard-shot";
import { FailoverViz } from "@/components/failover-viz";
import { HeroVisual } from "@/components/hero-visual";
import { ModelSwitcher } from "@/components/model-switcher";
import { PrivacyRecord } from "@/components/privacy-record";
import { Reveal } from "@/components/reveal";
import {
	fetchCatalog,
	formatContext,
	formatPrice,
	type CatalogModel,
} from "@/lib/models";
import { site } from "@/lib/site";
import { VicharMark } from "@/lib/vichar-logo";

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
	{
		name: "OpenAI SDK",
		sub: "Python & TypeScript",
		icon: "openai",
		href: `${site.urls.docs}/openai-sdk`,
	},
	{
		name: "Vercel AI SDK",
		sub: "TypeScript provider",
		icon: "vercel",
		href: `${site.urls.docs}/vercel-ai-sdk`,
	},
	{
		name: "LangChain",
		sub: "Agents & chains",
		icon: "langchain",
		href: `${site.urls.docs}/langchain`,
	},
	{
		name: "OpenCode",
		sub: "Terminal coding agent",
		icon: "opencode",
		href: `${site.urls.docs}/coding-tools`,
	},
	{
		name: "Cline",
		sub: "IDE coding agent",
		icon: "cline",
		href: `${site.urls.docs}/coding-tools`,
	},
];

const SWITCHER_IDS = [
	"vichar-opus-5.5",
	"vichar-gpt-5.6",
	"vichar-gemini-3.1-pro",
	"vichar-grok-4.7",
	"vichar-deepseek-v4-pro",
	"vichar-kimi-k3",
];

const PRIVACY_FACTS = [
	{
		title: "Keys hashed at rest",
		body: "API keys are stored as one-way hashes. The full key is shown once, at creation.",
		spec: "SHA-256",
	},
	{
		title: "Limits and instant revocation",
		body: "Cap any key's spend or give it an expiry, and revoke it in one click if it leaks.",
		spec: "per key",
	},
	{
		title: "Encrypted in transit",
		body: "The API is HTTPS only, between your app, Vichar, and the model providers.",
		spec: "TLS 1.2+",
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

function labMetaForModel(id: string): { lab: string; icon: string } {
	if (id.includes("opus") || id.includes("sonnet") || id.includes("haiku")) {
		return { lab: "Anthropic", icon: "claude" };
	}
	if (id.includes("gpt")) {
		return { lab: "OpenAI", icon: "openai" };
	}
	if (id.includes("gemini")) {
		return { lab: "Google", icon: "gemini" };
	}
	if (id.includes("grok")) {
		return { lab: "xAI", icon: "grok" };
	}
	if (id.includes("deepseek")) {
		return { lab: "DeepSeek", icon: "deepseek" };
	}
	if (id.includes("kimi")) {
		return { lab: "Moonshot", icon: "kimi" };
	}
	return { lab: "Vichar", icon: "openai" };
}

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
				<div className="relative mx-auto grid max-w-[1200px] grid-cols-1 gap-14 px-5 pb-24 pt-20 sm:px-8 md:pt-28 lg:grid-cols-2 lg:items-center">
					<div className="reveal min-w-0">
						<a
							href={`${site.urls.docs}/quick-start`}
							className="group inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-foreground/20"
						>
							<span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
								/v1
							</span>
							<span className="text-muted-foreground transition-colors group-hover:text-foreground">
								OpenAI-compatible API
							</span>
							<ArrowRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
						</a>
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
						<HeroVisual />
					</div>
				</div>
			</section>

			{/* Logo strip */}
			<section className="border-y border-border/60 py-10">
				<div className="mx-auto max-w-[1200px] px-5 sm:px-8">
					<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Models from leading AI labs
					</p>
					<ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5 lg:grid-cols-10">
						{LABS.map((lab) => (
							<li
								key={lab.name}
								className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-secondary/20 px-3 py-2.5 text-muted-foreground transition-colors hover:border-border hover:bg-secondary/40 hover:text-foreground"
							>
								<img
									src={`/labs/${lab.icon}.svg`}
									alt=""
									className="size-4 shrink-0 opacity-75 dark:invert"
									loading="lazy"
								/>
								<span className="text-xs font-medium">{lab.name}</span>
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
					<div className="w-full" style={{ containerType: "inline-size" }}>
						<div
							style={{ aspectRatio: "1140 / 668" }}
							className="relative w-full overflow-hidden rounded-2xl"
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
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-5 py-[72px] sm:px-8 sm:py-[96px] lg:grid-cols-2">
					<div className="reveal">
						<SectionHeading
							eyebrow="Unified API"
							title="One request. Any model."
							sub="Switch models by changing one string. Same request shape, same SDK, same billing balance."
						/>
						<ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
							<li className="flex items-center gap-2.5">
								<Check className="size-4 text-brand" />
								Same OpenAI-compatible request body across every lab
							</li>
							<li className="flex items-center gap-2.5">
								<Check className="size-4 text-brand" />
								Live per-token pricing and context windows
							</li>
							<li className="flex items-center gap-2.5">
								<Check className="size-4 text-brand" />
								Pin a specific model or pass auto for smart routing
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
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-5 py-[72px] sm:px-8 sm:py-[96px] lg:grid-cols-2">
					<div className="reveal">
						<SectionHeading
							eyebrow="Reliability"
							title="Retries and failover, built in."
							sub="When a provider errors or times out, the request is retried and rerouted to another available route for the same model. Failed attempts are not billed."
						/>
						<ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
							<li className="flex items-center gap-2.5">
								<Check className="size-4 text-brand" />
								Automatic retry on 5xx and upstream timeouts
							</li>
							<li className="flex items-center gap-2.5">
								<Check className="size-4 text-brand" />
								Failed attempts never deduct from your balance
							</li>
							<li className="flex items-center gap-2.5">
								<Check className="size-4 text-brand" />
								Send x-no-fallback: true when you want strict single-route calls
							</li>
						</ul>
					</div>
					<div className="reveal min-w-0">
						<FailoverViz />
					</div>
				</div>
			</section>

			{/* Switch in two lines */}
			<section className="border-t border-border/60">
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-5 py-[72px] sm:px-8 sm:py-[96px] lg:grid-cols-2">
					<div className="reveal">
						<SectionHeading
							eyebrow="Drop-in migration"
							title="Switch in two lines."
							sub="Already using the OpenAI SDK? Point baseURL at Vichar, swap the API key, and keep the rest of your application untouched."
						/>
						<ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
							<li className="flex items-center gap-2.5">
								<Check className="size-4 text-brand" />
								Works with streaming, tool calling, and structured outputs
							</li>
							<li className="flex items-center gap-2.5">
								<Check className="size-4 text-brand" />
								Also supports the Anthropic /v1/messages format
							</li>
						</ul>
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
					<div className="reveal mt-10 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
						{TOOLS.map((t) => (
							<a
								key={t.name}
								href={t.href}
								target="_blank"
								rel="noreferrer"
								className="group flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-0.5 hover:border-foreground/25"
							>
								<div className="flex items-center gap-3">
									<span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-secondary/40">
										<img
											src={`/tools/${t.icon}.svg`}
											alt=""
											className="size-5 opacity-80 transition-opacity group-hover:opacity-100 dark:invert"
											loading="lazy"
										/>
									</span>
									<div>
										<p className="text-sm font-semibold text-foreground">
											{t.name}
										</p>
										<p className="text-xs text-muted-foreground">{t.sub}</p>
									</div>
								</div>
								<ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
							</a>
						))}
					</div>
				</div>
			</section>

			{/* Models preview */}
			<section className="border-t border-border/60">
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[96px]">
					<div className="reveal flex flex-wrap items-end justify-between gap-4">
						<SectionHeading
							eyebrow="Catalogue"
							title="Frontier models, ready to call."
							sub="Transparent per-token pricing across reasoning, coding, and multimodal models."
						/>
						<Link
							href="/models/"
							className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
						>
							Browse all {models.length} models
							<ArrowRight className="size-4" />
						</Link>
					</div>
					<div className="reveal mt-10 overflow-x-auto rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
						<table className="w-full min-w-[600px] text-left text-sm">
							<thead>
								<tr className="border-b border-border bg-secondary/25 text-xs text-muted-foreground">
									<th className="px-5 py-3.5 font-medium">Model</th>
									<th className="px-4 py-3.5 font-medium">Lab</th>
									<th className="px-4 py-3.5 font-medium">Context</th>
									<th className="px-4 py-3.5 font-medium">Input / 1M</th>
									<th className="px-5 py-3.5 font-medium">Output / 1M</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{previewModels.map((m) => {
									const meta = labMetaForModel(m.id);
									return (
										<tr
											key={m.id}
											className="transition-colors hover:bg-secondary/25"
										>
											<td className="px-5 py-3.5">
												<Link
													href={`/models/${m.id}/`}
													className="font-semibold text-foreground hover:text-brand"
												>
													{m.displayName}
												</Link>
												<div className="font-mono text-xs text-muted-foreground">
													{m.id}
												</div>
											</td>
											<td className="px-4 py-3.5">
												<span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
													<img
														src={`/labs/${meta.icon}.svg`}
														alt=""
														className="size-4 opacity-75 dark:invert"
														loading="lazy"
													/>
													{meta.lab}
												</span>
											</td>
											<td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
												{formatContext(m.contextLength)}
											</td>
											<td className="px-4 py-3.5 font-mono text-xs font-medium">
												{formatPrice(m.inputPerMillion)}
											</td>
											<td className="px-5 py-3.5 font-mono text-xs font-medium">
												{formatPrice(m.outputPerMillion)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			{/* Privacy & security */}
			<section className="border-t border-border/60">
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-5 py-[72px] sm:px-8 sm:py-[96px] lg:grid-cols-2">
					<div className="reveal">
						<SectionHeading
							eyebrow="Privacy"
							title="Privacy and control by default."
							sub="By default, prompts and responses are never written to our database. We keep the metadata needed to bill you, nothing more."
						/>
						<dl className="mt-8 divide-y divide-border border-y border-border">
							{PRIVACY_FACTS.map((f) => (
								<div
									key={f.title}
									className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 py-4"
								>
									<dt className="text-sm font-semibold text-foreground">
										{f.title}
									</dt>
									<dd className="row-span-2 self-start pt-0.5 font-mono text-[11px] text-muted-foreground">
										{f.spec}
									</dd>
									<dd className="text-[13px] leading-relaxed text-muted-foreground">
										{f.body}
									</dd>
								</div>
							))}
						</dl>
						<p className="mt-5 text-sm text-muted-foreground">
							Details in the{" "}
							<Link
								href="/legal/privacy/"
								className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
							>
								Privacy Policy
							</Link>
							.
						</p>
					</div>
					<div className="reveal min-w-0">
						<PrivacyRecord />
					</div>
				</div>
			</section>

			{/* Pricing band */}
			<section className="border-t border-border/60 bg-secondary/30">
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[96px]">
					<div className="reveal grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
						<div>
							<p className="text-xs font-medium uppercase tracking-wider text-brand">
								Pricing
							</p>
							<h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
								Model rates plus 5% on top-ups. That's the whole bill.
							</h2>
							<ul className="mt-5 space-y-2.5 text-sm text-muted-foreground">
								<li className="flex items-center gap-2.5">
									<Check className="size-4 text-brand" />
									No subscription, seat fees, or monthly minimum
								</li>
								<li className="flex items-center gap-2.5">
									<Check className="size-4 text-brand" />
									Spend limits per API key and optional auto top-up
								</li>
								<li className="flex items-center gap-2.5">
									<Check className="size-4 text-brand" />
									Downloadable invoices for every top-up
								</li>
							</ul>
							<div className="mt-7">
								<Link
									href="/pricing/"
									className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-medium transition-colors hover:bg-accent"
								>
									See pricing &amp; calculator
									<ArrowRight className="size-4" />
								</Link>
							</div>
						</div>

						<div className="rounded-2xl border border-border bg-card p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
							<div className="flex items-center justify-between border-b border-border pb-4">
								<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Pay-as-you-go credits
								</span>
								<span className="rounded-full bg-brand/10 px-2.5 py-0.5 font-mono text-xs font-medium text-brand">
									$20 minimum
								</span>
							</div>
							<div className="mt-4 grid grid-cols-2 gap-4">
								<div className="rounded-xl border border-border/70 bg-secondary/25 p-3.5">
									<p className="text-xs text-muted-foreground">
										Inference usage
									</p>
									<p className="mt-1 font-display text-xl font-semibold">
										Listed rate
									</p>
									<p className="mt-0.5 text-[11px] text-muted-foreground">
										0% per-token markup
									</p>
								</div>
								<div className="rounded-xl border border-border/70 bg-secondary/25 p-3.5">
									<p className="text-xs text-muted-foreground">Credit top-up</p>
									<p className="mt-1 font-display text-xl font-semibold">
										5% fee
									</p>
									<p className="mt-0.5 text-[11px] text-muted-foreground">
										$20 top-up = $21 total
									</p>
								</div>
							</div>
							<p className="mt-4 font-mono text-xs text-muted-foreground">
								Failed requests and upstream errors are never billed.
							</p>
						</div>
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
