import {
	ArrowRight,
	ArrowUpRight,
	Bot,
	Check,
	Code2,
	FileSearch,
	KeyRound,
	Layers,
	Minus,
	Plug,
	Rocket,
	ShieldCheck,
	Sparkles,
	Workflow,
	X,
} from "lucide-react";
import Link from "next/link";

import { BentoFeatures } from "@/components/bento";
import { CodeCard } from "@/components/code-card";
import { DashboardShot } from "@/components/dashboard-shot";
import { FailoverViz } from "@/components/failover-viz";
import { HeroConsole } from "@/components/hero-console";
import { JsonLd } from "@/components/json-ld";
import { ModelSwitcher } from "@/components/model-switcher";
import {
	CountUp,
	FadeIn,
	HoverLift,
	Stagger,
	StaggerItem,
} from "@/components/motion";
import { PrivacyRecord } from "@/components/privacy-record";
import { Reveal } from "@/components/reveal";
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
import { VicharMark } from "@/lib/vichar-logo";

import type { Metadata } from "next";

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
	TypeScript: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.vichar.io/v1",
  apiKey: process.env.VICHAR_API_KEY,
});

const resp = await client.chat.completions.create({
  model: "vichar-sonnet-5.5",
  messages: [{ role: "user", content: "Hello" }],
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

const STEPS = [
	{
		icon: KeyRound,
		title: "Create a key",
		body: "Sign up, add prepaid credits, and generate an API key with its own spend limit.",
		code: "vc_live_7fK…a91",
	},
	{
		icon: Plug,
		title: "Point your SDK",
		body: "Set baseURL to the Vichar endpoint. Every OpenAI-compatible client just works.",
		code: "api.vichar.io/v1",
	},
	{
		icon: Rocket,
		title: "Ship on any model",
		body: "Change one string to switch labs. Track every token and dollar in the dashboard.",
		code: 'model: "vichar-opus-5.5"',
	},
];

const USE_CASES = [
	{
		icon: Bot,
		title: "Chat & assistants",
		body: "Stream responses from frontier chat models with tool calling and structured outputs.",
		tags: ["streaming", "tools", "json"],
	},
	{
		icon: Code2,
		title: "Coding agents",
		body: "Plug Cline, OpenCode or your own agent into one key and pick the best coder per task.",
		tags: ["long context", "reasoning"],
	},
	{
		icon: FileSearch,
		title: "RAG & search",
		body: "Feed long documents into million-token context windows at transparent per-token rates.",
		tags: ["1M context", "caching"],
	},
	{
		icon: Workflow,
		title: "Pipelines & batch",
		body: "Run background jobs with per-key spend caps so a runaway loop never drains your balance.",
		tags: ["spend limits", "retries"],
	},
];

const COMPARISON: Array<{
	label: string;
	direct: boolean | string;
	vichar: boolean | string;
}> = [
	{ label: "Accounts to manage", direct: "One per lab", vichar: "One" },
	{ label: "API keys", direct: "One per lab", vichar: "One, with limits" },
	{
		label: "Billing relationships",
		direct: "Many invoices",
		vichar: "One balance",
	},
	{ label: "OpenAI-compatible across labs", direct: false, vichar: true },
	{ label: "Automatic failover between routes", direct: false, vichar: true },
	{ label: "Unified usage & cost analytics", direct: false, vichar: true },
	{ label: "Per-key spend caps & expiry", direct: "Varies", vichar: true },
	{ label: "Per-token markup", direct: "—", vichar: "0%" },
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
	{
		q: "Does Vichar support the Anthropic Messages format?",
		a: "Yes. Alongside /v1/chat/completions, the API accepts the Anthropic /v1/messages request format.",
	},
];

function SectionHeading({
	eyebrow,
	title,
	sub,
	center = false,
}: {
	eyebrow?: string;
	title: React.ReactNode;
	sub?: string;
	center?: boolean;
}) {
	return (
		<FadeIn className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
			{eyebrow && (
				<p
					className={`inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand ${center ? "" : ""}`}
				>
					<span className="size-1.5 rounded-full bg-brand" />
					{eyebrow}
				</p>
			)}
			<h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-balance sm:text-[42px] sm:leading-[1.1]">
				{title}
			</h2>
			{sub && (
				<p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty">
					{sub}
				</p>
			)}
		</FadeIn>
	);
}

function CheckList({ items }: { items: string[] }) {
	return (
		<ul className="mt-7 space-y-3 text-[15px] text-muted-foreground">
			{items.map((t) => (
				<li key={t} className="flex items-start gap-3">
					<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10">
						<Check className="size-3 text-brand" strokeWidth={3} />
					</span>
					{t}
				</li>
			))}
		</ul>
	);
}

function Cell({ v, strong }: { v: boolean | string; strong?: boolean }) {
	if (v === true) {
		return (
			<span className="inline-flex size-6 items-center justify-center rounded-full bg-success/12">
				<Check className="size-3.5 text-success" strokeWidth={3} />
				<span className="sr-only">Yes</span>
			</span>
		);
	}
	if (v === false) {
		return (
			<span className="inline-flex size-6 items-center justify-center rounded-full bg-secondary">
				<X className="size-3.5 text-muted-foreground" />
				<span className="sr-only">No</span>
			</span>
		);
	}
	return (
		<span
			className={
				strong ? "font-semibold text-foreground" : "text-muted-foreground"
			}
		>
			{v}
		</span>
	);
}

export default async function Home() {
	const models = await fetchCatalog();

	const previewModels = PREVIEW_IDS.map((id) =>
		models.find((m) => m.id === id && !m.free),
	).filter((m): m is CatalogModel => m !== undefined);

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

	const labCount = new Set(models.map(labForModel).filter(Boolean)).size;
	const maxContext = Math.max(...models.map((m) => m.contextLength));

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
			<section className="relative -mt-16 overflow-hidden pt-16">
				<div
					aria-hidden="true"
					className="hero-aurora pointer-events-none absolute inset-0"
				/>
				<div
					aria-hidden="true"
					className="line-grid pointer-events-none absolute inset-0"
				/>
				<div className="relative mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-5 pb-20 pt-14 sm:px-8 md:pb-28 md:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center">
					<div className="min-w-0">
						<div
							className="rise"
							style={{ "--d": "0ms" } as React.CSSProperties}
						>
							<a
								href={`${site.urls.docs}/quick-start`}
								className="group inline-flex items-center gap-2 rounded-full border border-border bg-card/80 py-1 pl-1 pr-3 text-xs shadow-card backdrop-blur transition-colors hover:border-brand/40"
							>
								<span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
									New
								</span>
								<span className="text-muted-foreground transition-colors group-hover:text-foreground">
									{models.length} models live · OpenAI-compatible
								</span>
								<ArrowRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
							</a>
						</div>
						<div
							className="rise"
							style={{ "--d": "50ms" } as React.CSSProperties}
						>
							<h1 className="mt-7 font-display text-[44px] font-extrabold leading-[1.02] tracking-[-0.03em] text-balance sm:text-6xl lg:text-[72px]">
								One API for <span className="text-gradient">every model</span>.
							</h1>
						</div>
						<div
							className="rise"
							style={{ "--d": "120ms" } as React.CSSProperties}
						>
							<p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
								Call frontier models from {labCount}+ AI labs through a single
								OpenAI-compatible endpoint. Automatic failover, per-key spend
								limits, and real-time cost analytics, at listed per-token rates.
							</p>
						</div>
						<div
							className="rise"
							style={{ "--d": "180ms" } as React.CSSProperties}
						>
							<div className="mt-9 flex flex-wrap items-center gap-3">
								<a
									href={site.urls.signup}
									className="group inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--brand)_60%,transparent),inset_0_1px_0_rgb(255_255_255/0.2)] transition-all hover:-translate-y-0.5 hover:bg-brand-strong"
								>
									Get your API key
									<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
								</a>
								<a
									href={site.urls.docs}
									className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-6 text-[15px] font-semibold text-foreground shadow-card transition-colors hover:border-brand/30 hover:bg-accent"
								>
									<Code2 className="size-4 text-muted-foreground" />
									Read the docs
								</a>
							</div>
						</div>
						<div
							className="rise"
							style={{ "--d": "240ms" } as React.CSSProperties}
						>
							<ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
								{["Pay per token", "No subscription", "0% token markup"].map(
									(t) => (
										<li key={t} className="flex items-center gap-2">
											<Check
												className="size-4 text-success"
												strokeWidth={2.5}
											/>
											{t}
										</li>
									),
								)}
							</ul>
						</div>
					</div>
					<div
						className="rise min-w-0"
						style={{ "--d": "200ms" } as React.CSSProperties}
					>
						<HeroConsole models={SWITCHER_IDS} />
					</div>
				</div>
			</section>

			{/* Logo marquee */}
			<section
				aria-label="Supported AI labs"
				className="border-y border-border bg-canvas py-8"
			>
				<p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
					Frontier models from the world's leading AI labs
				</p>
				<div className="marquee relative mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
					<ul className="marquee-track flex gap-3">
						{(["a", "b"] as const).flatMap((copy) =>
							LABS.map((lab) => (
								<li
									key={`${copy}-${lab.name}`}
									aria-hidden={copy === "b"}
									className="flex shrink-0 items-center gap-2.5 rounded-xl border border-border bg-card px-5 py-3 text-foreground/80 shadow-card"
								>
									<img
										src={`/labs/${lab.icon}.svg`}
										alt=""
										className="size-5 shrink-0 dark:invert"
										loading="lazy"
									/>
									<span className="text-sm font-semibold">{lab.name}</span>
								</li>
							)),
						)}
					</ul>
				</div>
			</section>

			{/* Stats band */}
			<section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20">
				<Stagger className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-card lg:grid-cols-4">
					{[
						{
							value: models.length,
							suffix: "",
							label: "Models available",
							sub: "Reasoning, coding, multimodal",
						},
						{
							value: labCount,
							suffix: "+",
							label: "AI labs",
							sub: "Behind one endpoint",
						},
						{
							value: maxContext / 1_000_000,
							suffix: "M",
							decimals: 1,
							label: "Max context window",
							sub: "Tokens in a single request",
						},
						{
							value: 0,
							suffix: "%",
							label: "Per-token markup",
							sub: "Listed model rates",
						},
					].map((s) => (
						<StaggerItem key={s.label} className="bg-card p-6 sm:p-8">
							<p className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
								<CountUp
									value={s.value}
									suffix={s.suffix}
									decimals={s.decimals ?? 0}
								/>
							</p>
							<p className="mt-2 text-sm font-semibold">{s.label}</p>
							<p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
						</StaggerItem>
					))}
				</Stagger>
			</section>

			{/* How it works */}
			<section className="mx-auto max-w-[1200px] px-5 pb-[80px] sm:px-8 sm:pb-[110px]">
				<SectionHeading
					center
					eyebrow="How it works"
					title="From sign-up to first token in three steps."
					sub="No sales call, no contract. Bring the SDK you already use."
				/>
				<Stagger
					className="relative mt-14 grid gap-5 md:grid-cols-3"
					gap={0.12}
				>
					<div
						aria-hidden="true"
						className="absolute left-[16%] right-[16%] top-[44px] hidden h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent md:block"
					/>
					{STEPS.map((step, i) => (
						<StaggerItem key={step.title}>
							<HoverLift className="relative h-full rounded-2xl border border-border bg-card p-7 shadow-card">
								<div className="flex items-center justify-between">
									<span className="flex size-12 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--brand)_70%,transparent)]">
										<step.icon className="size-5" />
									</span>
									<span className="font-display text-5xl font-bold text-foreground/[0.06]">
										0{i + 1}
									</span>
								</div>
								<h3 className="mt-6 font-display text-lg font-semibold tracking-tight">
									{step.title}
								</h3>
								<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
									{step.body}
								</p>
								<p className="mt-5 truncate rounded-lg border border-border bg-canvas px-3 py-2 font-mono text-xs text-foreground/80">
									{step.code}
								</p>
							</HoverLift>
						</StaggerItem>
					))}
				</Stagger>
			</section>

			{/* Product shot */}
			<section className="relative overflow-hidden border-t border-border bg-canvas">
				<div className="mx-auto max-w-[1200px] px-5 py-[80px] sm:px-8 sm:py-[110px]">
					<SectionHeading
						center
						eyebrow="Dashboard"
						title={
							<>
								Every token and dollar,{" "}
								<span className="text-gradient">in one place.</span>
							</>
						}
						sub="Usage, spend, keys and requests for every model, in real time. Break down cost by project, key, model and provider."
					/>
					<FadeIn className="relative mt-14" y={30}>
						<div
							aria-hidden="true"
							className="absolute inset-x-10 -top-6 bottom-10 rounded-[40px] bg-brand-gradient opacity-[0.10] blur-3xl"
						/>
						<div className="relative rounded-[22px] border border-border bg-card/60 p-2 shadow-float backdrop-blur">
							<ScaleToFit width={1140} height={782}>
								<DashboardShot />
							</ScaleToFit>
						</div>
					</FadeIn>
				</div>
			</section>

			{/* One request. Any model. */}
			<section className="border-t border-border">
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-14 px-5 py-[80px] sm:px-8 sm:py-[110px] lg:grid-cols-2">
					<div>
						<SectionHeading
							eyebrow="Unified API"
							title="One request. Any model."
							sub="Switch models by changing one string. Same request shape, same SDK, same billing balance."
						/>
						<FadeIn delay={0.1}>
							<CheckList
								items={[
									"Same OpenAI-compatible request body across every lab",
									"Live per-token pricing and context windows",
									"Pin a specific model or pass auto for smart routing",
								]}
							/>
						</FadeIn>
					</div>
					<FadeIn delay={0.1} className="min-w-0">
						<ModelSwitcher models={switcherModels} />
					</FadeIn>
				</div>
			</section>

			{/* Built for production (bento) */}
			<section className="border-t border-border bg-canvas">
				<div className="mx-auto max-w-[1200px] px-5 py-[80px] sm:px-8 sm:py-[110px]">
					<SectionHeading
						eyebrow="Controls"
						title="Built for production workloads."
						sub="Spend limits, expiring keys, smart routing and caching come standard on every account."
					/>
					<BentoFeatures />
				</div>
			</section>

			{/* Reliability */}
			<section className="border-t border-border">
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-14 px-5 py-[80px] sm:px-8 sm:py-[110px] lg:grid-cols-2">
					<div>
						<SectionHeading
							eyebrow="Reliability"
							title="Retries and failover, built in."
							sub="When a provider errors or times out, the request is retried and rerouted to another available route for the same model. Failed attempts are not billed."
						/>
						<FadeIn delay={0.1}>
							<CheckList
								items={[
									"Automatic retry on 5xx and upstream timeouts",
									"Failed attempts never deduct from your balance",
									"Send x-no-fallback: true when you want strict single-route calls",
								]}
							/>
						</FadeIn>
					</div>
					<div className="min-w-0">
						<FailoverViz />
					</div>
				</div>
			</section>

			{/* Use cases */}
			<section className="relative overflow-hidden border-t border-border bg-navy text-white">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-[#387ed1]/30 blur-[120px]"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -bottom-40 -left-40 size-[420px] rounded-full bg-[#12b5cb]/20 blur-[120px]"
				/>
				<div className="relative mx-auto max-w-[1200px] px-5 py-[80px] sm:px-8 sm:py-[110px]">
					<FadeIn className="max-w-2xl">
						<p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#8dbbf2]">
							<Sparkles className="size-3.5" />
							Use cases
						</p>
						<h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-balance sm:text-[42px] sm:leading-[1.1]">
							Whatever you are building, route it through one key.
						</h2>
						<p className="mt-4 text-base leading-relaxed text-white/65">
							Pick the right model for each job and change your mind any time,
							without new accounts or new code paths.
						</p>
					</FadeIn>
					<Stagger className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{USE_CASES.map((u) => (
							<StaggerItem key={u.title}>
								<HoverLift className="group h-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition-colors hover:border-white/25 hover:bg-white/[0.07]">
									<span className="flex size-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
										<u.icon className="size-5 text-[#8dbbf2]" />
									</span>
									<h3 className="mt-5 font-display text-lg font-semibold">
										{u.title}
									</h3>
									<p className="mt-2 text-sm leading-relaxed text-white/60">
										{u.body}
									</p>
									<div className="mt-5 flex flex-wrap gap-1.5">
										{u.tags.map((t) => (
											<span
												key={t}
												className="rounded-md bg-white/[0.07] px-2 py-0.5 font-mono text-[11px] text-white/70"
											>
												{t}
											</span>
										))}
									</div>
								</HoverLift>
							</StaggerItem>
						))}
					</Stagger>
				</div>
			</section>

			{/* Switch in two lines */}
			<section className="border-t border-border">
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-14 px-5 py-[80px] sm:px-8 sm:py-[110px] lg:grid-cols-2">
					<div>
						<SectionHeading
							eyebrow="Drop-in migration"
							title="Switch in two lines."
							sub="Already using the OpenAI SDK? Point baseURL at Vichar, swap the API key, and keep the rest of your application untouched."
						/>
						<FadeIn delay={0.1}>
							<CheckList
								items={[
									"Works with streaming, tool calling, and structured outputs",
									"Also supports the Anthropic /v1/messages format",
									"Python, TypeScript, cURL and any HTTP client",
								]}
							/>
						</FadeIn>
					</div>
					<FadeIn delay={0.1} className="min-w-0">
						<div className="rounded-2xl shadow-float">
							<CodeCard
								snippets={{ Diff: DIFF_SNIPPET, ...SNIPPETS }}
								diffTabs={["Diff"]}
							/>
						</div>
					</FadeIn>
				</div>
			</section>

			{/* Works with */}
			<section className="border-t border-border bg-canvas">
				<div className="mx-auto max-w-[1200px] px-5 py-[80px] sm:px-8 sm:py-[110px]">
					<SectionHeading
						eyebrow="Integrations"
						title="Works with your stack."
						sub="Any SDK or coding tool that accepts an OpenAI-compatible base URL works with Vichar."
					/>
					<Stagger className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-5">
						{TOOLS.map((t) => (
							<StaggerItem key={t.name}>
								<a
									href={t.href}
									target="_blank"
									rel="noreferrer"
									className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:border-brand/30 hover:shadow-float sm:flex-col sm:items-start sm:gap-5"
								>
									<div className="flex w-auto items-center justify-between sm:w-full">
										<span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-canvas">
											<img
												src={`/tools/${t.icon}.svg`}
												alt=""
												className="size-5 opacity-80 transition-opacity group-hover:opacity-100 dark:invert"
												loading="lazy"
											/>
										</span>
										<ArrowUpRight className="hidden size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand sm:block" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-semibold text-foreground">
											{t.name}
										</p>
										<p className="truncate text-xs text-muted-foreground">
											{t.sub}
										</p>
									</div>
									<ArrowUpRight className="size-4 shrink-0 text-muted-foreground sm:hidden" />
								</a>
							</StaggerItem>
						))}
					</Stagger>
				</div>
			</section>

			{/* Models preview */}
			<section className="border-t border-border">
				<div className="mx-auto max-w-[1200px] px-5 py-[80px] sm:px-8 sm:py-[110px]">
					<div className="flex flex-wrap items-end justify-between gap-6">
						<SectionHeading
							eyebrow="Catalogue"
							title="Frontier models, ready to call."
							sub="Transparent per-token pricing across reasoning, coding, and multimodal models."
						/>
						<FadeIn>
							<Link
								href="/models/"
								className="group inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-card transition-colors hover:border-brand/30 hover:text-brand"
							>
								Browse all {models.length} models
								<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
							</Link>
						</FadeIn>
					</div>
					<FadeIn className="mt-12 overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
						<table className="w-full text-left text-sm sm:min-w-[640px]">
							<thead>
								<tr className="border-b border-border bg-canvas text-xs uppercase tracking-wider text-muted-foreground">
									<th className="px-6 py-4 font-semibold">Model</th>
									<th className="hidden px-4 py-4 font-semibold sm:table-cell">
										Lab
									</th>
									<th className="px-4 py-4 font-semibold">Context</th>
									<th className="px-4 py-4 text-right font-semibold">
										Input / 1M
									</th>
									<th className="px-6 py-4 text-right font-semibold">
										Output / 1M
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{previewModels.map((m) => {
									const lab = LAB_LABELS[labForModel(m)] ?? "Vichar";
									return (
										<tr
											key={m.id}
											className="group transition-colors hover:bg-brand/[0.03]"
										>
											<td className="px-6 py-4">
												<Link
													href={`/models/${m.id}/`}
													className="font-semibold text-foreground group-hover:text-brand"
												>
													{m.displayName}
												</Link>
												<div className="font-mono text-xs text-muted-foreground">
													{m.id}
												</div>
											</td>
											<td className="hidden px-4 py-4 text-sm text-muted-foreground sm:table-cell">
												{lab}
											</td>
											<td className="px-4 py-4">
												<span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs">
													{formatContext(m.contextLength)}
												</span>
											</td>
											<td className="px-4 py-4 text-right font-mono text-sm font-medium tabular-nums">
												{formatPrice(m.inputPerMillion)}
											</td>
											<td className="px-6 py-4 text-right font-mono text-sm font-medium tabular-nums">
												{formatPrice(m.outputPerMillion)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</FadeIn>
				</div>
			</section>

			{/* Comparison */}
			<section className="border-t border-border bg-cream">
				<div className="mx-auto max-w-[1000px] px-5 py-[80px] sm:px-8 sm:py-[110px]">
					<SectionHeading
						center
						eyebrow="Why Vichar"
						title="One integration instead of many."
						sub="Calling each lab directly means another account, key, invoice and SDK quirk every time you add a model."
					/>
					<FadeIn className="mt-12 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border">
									<th className="px-5 py-4 text-left font-semibold text-muted-foreground sm:px-7">
										<span className="sr-only">Capability</span>
									</th>
									<th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
										Direct to each lab
									</th>
									<th className="bg-brand/[0.06] px-4 py-4 text-center sm:px-7">
										<span className="inline-flex items-center gap-1.5 font-display text-sm font-bold text-brand">
											<VicharMark className="size-4" />
											Vichar
										</span>
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{COMPARISON.map((row) => (
									<tr key={row.label}>
										<td className="px-5 py-4 font-medium sm:px-7">
											{row.label}
										</td>
										<td className="px-4 py-4 text-center">
											<Cell v={row.direct} />
										</td>
										<td className="bg-brand/[0.06] px-4 py-4 text-center sm:px-7">
											<Cell v={row.vichar} strong />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</FadeIn>
				</div>
			</section>

			{/* Privacy & security */}
			<section className="border-t border-border">
				<div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-14 px-5 py-[80px] sm:px-8 sm:py-[110px] lg:grid-cols-2">
					<div>
						<SectionHeading
							eyebrow="Privacy & security"
							title="Privacy and control by default."
							sub="By default, prompts and responses are never written to our database. We keep the metadata needed to bill you, nothing more."
						/>
						<Stagger className="mt-8 space-y-3">
							{PRIVACY_FACTS.map((f) => (
								<StaggerItem key={f.title}>
									<div className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-card">
										<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10">
											<ShieldCheck className="size-4 text-success" />
										</span>
										<div className="min-w-0 flex-1">
											<div className="flex items-center justify-between gap-3">
												<h3 className="text-sm font-semibold">{f.title}</h3>
												<span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
													{f.spec}
												</span>
											</div>
											<p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
												{f.body}
											</p>
										</div>
									</div>
								</StaggerItem>
							))}
						</Stagger>
						<p className="mt-6 text-sm text-muted-foreground">
							Details in the{" "}
							<Link
								href="/legal/privacy/"
								className="font-medium text-brand underline-offset-4 hover:underline"
							>
								Privacy Policy
							</Link>
							.
						</p>
					</div>
					<FadeIn delay={0.1} className="min-w-0">
						<PrivacyRecord />
					</FadeIn>
				</div>
			</section>

			{/* Pricing band */}
			<section className="border-t border-border bg-canvas">
				<div className="mx-auto max-w-[1200px] px-5 py-[80px] sm:px-8 sm:py-[110px]">
					<div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
						<div>
							<SectionHeading
								eyebrow="Pricing"
								title="Model rates plus 5% on top-ups. That's the whole bill."
							/>
							<FadeIn delay={0.1}>
								<CheckList
									items={[
										"No subscription, seat fees, or monthly minimum",
										"Spend limits per API key and optional auto top-up",
										"Downloadable invoices for every top-up",
									]}
								/>
								<div className="mt-8">
									<Link
										href="/pricing/"
										className="group inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-strong"
									>
										See pricing &amp; calculator
										<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
									</Link>
								</div>
							</FadeIn>
						</div>

						<FadeIn delay={0.1}>
							<div className="relative overflow-hidden rounded-2xl border border-border bg-card p-7 shadow-float">
								<div
									aria-hidden="true"
									className="absolute inset-x-0 top-0 h-1 bg-brand-gradient"
								/>
								<div className="flex items-center justify-between border-b border-border pb-5">
									<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
										Pay-as-you-go credits
									</span>
									<span className="rounded-full bg-brand/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-brand">
										$20 minimum
									</span>
								</div>
								<div className="mt-5 grid grid-cols-2 gap-4">
									<div className="rounded-xl border border-border bg-canvas p-4">
										<Layers className="size-4 text-brand" />
										<p className="mt-3 text-xs text-muted-foreground">
											Inference usage
										</p>
										<p className="mt-1 font-display text-2xl font-bold">
											Listed rate
										</p>
										<p className="mt-0.5 text-[11px] text-muted-foreground">
											0% per-token markup
										</p>
									</div>
									<div className="rounded-xl border border-border bg-canvas p-4">
										<Plug className="size-4 text-teal" />
										<p className="mt-3 text-xs text-muted-foreground">
											Credit top-up
										</p>
										<p className="mt-1 font-display text-2xl font-bold">
											5% fee
										</p>
										<p className="mt-0.5 text-[11px] text-muted-foreground">
											$20 top-up = $21 total
										</p>
									</div>
								</div>
								<p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
									<Minus className="size-3.5 text-success" />
									Failed requests and upstream errors are never billed.
								</p>
							</div>
						</FadeIn>
					</div>
				</div>
			</section>

			{/* FAQ */}
			<section className="border-t border-border">
				<div className="mx-auto grid max-w-[1200px] gap-12 px-5 py-[80px] sm:px-8 sm:py-[110px] lg:grid-cols-[1fr_1.4fr]">
					<div>
						<SectionHeading
							eyebrow="FAQ"
							title="Frequently asked questions"
							sub="Can't find what you're looking for?"
						/>
						<FadeIn delay={0.1}>
							<Link
								href="/contact/"
								className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
							>
								Talk to us
								<ArrowRight className="size-4" />
							</Link>
						</FadeIn>
					</div>
					<Stagger className="space-y-3">
						{FAQS.map((f) => (
							<StaggerItem key={f.q}>
								<details className="group rounded-xl border border-border bg-card px-5 shadow-card open:border-brand/25 [&_summary::-webkit-details-marker]:hidden">
									<summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-semibold">
										{f.q}
										<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-transform duration-300 group-open:rotate-45 group-open:bg-brand group-open:text-white">
											+
										</span>
									</summary>
									<p className="-mt-1 pb-4 text-sm leading-relaxed text-muted-foreground">
										{f.a}
									</p>
								</details>
							</StaggerItem>
						))}
					</Stagger>
				</div>
			</section>

			{/* Final CTA */}
			<section className="px-5 pb-[80px] sm:px-8 sm:pb-[110px]">
				<FadeIn className="relative mx-auto max-w-[1200px] overflow-hidden rounded-3xl bg-brand-gradient px-6 py-16 text-center text-white shadow-float sm:px-12 sm:py-20">
					<div
						aria-hidden="true"
						className="line-grid pointer-events-none absolute inset-0 opacity-30"
					/>
					<div className="relative mx-auto max-w-2xl">
						<span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
							<VicharMark className="size-7 text-white" />
						</span>
						<h2 className="mt-6 font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">
							Start building in minutes.
						</h2>
						<p className="mt-4 text-base text-white/80 sm:text-lg">
							One key. {models.length} models. Pay only for the tokens you use.
						</p>
						<div className="mt-9 flex flex-wrap items-center justify-center gap-3">
							<a
								href={site.urls.signup}
								className="group inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-[15px] font-semibold text-navy shadow-lg transition-transform hover:-translate-y-0.5"
							>
								Get your API key
								<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
							</a>
							<a
								href={site.urls.docs}
								className="inline-flex h-12 items-center rounded-xl border border-white/30 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/10"
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
