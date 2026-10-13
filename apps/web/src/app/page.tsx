import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { CodeCard } from "@/components/code-card";
import { Reveal } from "@/components/reveal";
import {
	LAB_LABELS,
	fetchCatalog,
	formatContext,
	formatPrice,
	labForModel,
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

const EXAMPLE_INPUT_TOKENS = [400, 537, 674, 811, 948];
const EXAMPLE_OUTPUT_TOKENS = [120, 181, 242, 303, 364];

const FEATURES = [
	{
		title: "One key, every model",
		body: "A single API key and endpoint for models from multiple labs. Swap models by changing one string.",
	},
	{
		title: "Automatic failover",
		body: "When a provider slows down or fails, requests reroute to a healthy one, so your app keeps answering.",
	},
	{
		title: "Pay for what you use",
		body: "Prepaid credits at listed per-token rates. No subscription, no seat fees, no monthly minimum.",
	},
	{
		title: "Your prompts stay yours",
		body: "We log usage metadata like tokens, cost and latency. Prompt and response content is not stored by default.",
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

	const rowCost = (m: CatalogModel, i: number) => {
		const inputTokens = EXAMPLE_INPUT_TOKENS[i] ?? 400;
		const outputTokens = EXAMPLE_OUTPUT_TOKENS[i] ?? 120;
		const inputCost = (m.inputPerMillion ?? 0) * inputTokens * 1e-6;
		const outputCost = (m.outputPerMillion ?? 0) * outputTokens * 1e-6;
		return inputCost + outputCost;
	};
	const activityRows = [...models]
		.filter((m) => !m.free)
		.slice(0, 5)
		.map((m, i) => ({
			model: m.id,
			provider: LAB_LABELS[labForModel(m)] ?? "auto",
			in: EXAMPLE_INPUT_TOKENS[i] ?? 400,
			out: EXAMPLE_OUTPUT_TOKENS[i] ?? 120,
			cost: `$${rowCost(m, i).toFixed(4)}`,
			time: `${i + 2} min ago`,
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

			{/* Features */}
			<section className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[120px]">
				<SectionHeading title="Why Vichar" />
				<div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{FEATURES.map((f) => (
						<div
							key={f.title}
							className="reveal rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
						>
							<h3 className="font-display text-base font-semibold tracking-tight">
								{f.title}
							</h3>
							<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
								{f.body}
							</p>
						</div>
					))}
				</div>
			</section>

			{/* Switch in two lines */}
			<section className="border-t border-border/60">
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-5 py-[72px] sm:px-8 sm:py-[120px] lg:grid-cols-2">
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

			{/* Product preview */}
			<section className="border-t border-border/60">
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[120px]">
					<SectionHeading
						title="See every request."
						sub="Per-request cost, tokens, latency and provider, with analytics and spend limits per key."
					/>
					<div className="reveal mt-12 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
						<div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
							<span className="size-2.5 rounded-full bg-border" />
							<span className="size-2.5 rounded-full bg-border" />
							<span className="size-2.5 rounded-full bg-border" />
							<span className="ml-3 font-mono text-xs text-muted-foreground">
								app.vichar.io
							</span>
						</div>
						<div className="overflow-x-auto">
							<table
								className="w-full min-w-[560px] text-left text-sm"
								aria-hidden="true"
							>
								<caption className="sr-only">
									Example of the Vichar dashboard
								</caption>
								<thead>
									<tr className="border-b border-border text-xs text-muted-foreground">
										<th className="px-4 py-3 font-medium">Model</th>
										<th className="px-4 py-3 font-medium">Tokens</th>
										<th className="px-4 py-3 font-medium">Cost</th>
										<th className="px-4 py-3 font-medium">Time</th>
									</tr>
								</thead>
								<tbody>
									{activityRows.map((r) => (
										<tr
											key={r.model}
											className="border-b border-border/50 last:border-0"
										>
											<td className="px-4 py-3">
												<div className="flex items-center gap-2">
													<span className="size-1.5 rounded-full bg-success" />
													<span className="font-mono text-xs">{r.model}</span>
												</div>
												<div className="pl-3.5 text-xs text-muted-foreground">
													{r.provider}
												</div>
											</td>
											<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
												{r.in} → {r.out}
											</td>
											<td className="px-4 py-3 font-mono text-xs">{r.cost}</td>
											<td className="px-4 py-3 text-xs text-muted-foreground">
												{r.time}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</section>

			{/* Models preview */}
			<section className="border-t border-border/60">
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[120px]">
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

			{/* Pricing band */}
			<section className="border-t border-border/60 bg-secondary/40">
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] sm:px-8 sm:py-[100px]">
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
			<section className="mx-auto max-w-[760px] px-5 py-[72px] sm:px-8 sm:py-[120px]">
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
				<div className="mx-auto max-w-[1200px] px-5 py-[72px] text-center sm:px-8 sm:py-[120px]">
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
