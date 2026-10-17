import {
	ArrowRight,
	BadgeCheck,
	CircleDollarSign,
	FileText,
	Gauge,
	Receipt,
	ShieldOff,
} from "lucide-react";
import Link from "next/link";

import { CostCalculator } from "@/components/cost-calculator";
import { JsonLd } from "@/components/json-ld";
import { FadeIn, HoverLift, Stagger, StaggerItem } from "@/components/motion";
import { PageHero } from "@/components/page-hero";
import { fetchCatalog } from "@/lib/models";
import { site } from "@/lib/site";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Pricing - pay per token, no subscription",
	description:
		"Vichar pricing: usage-based billing at listed per-token model rates, 0% token markup, a flat 5% platform fee on credit top-ups, and no subscription or seat fees.",
	alternates: { canonical: "/pricing/" },
	openGraph: {
		title: "Vichar pricing - pay per token, no subscription",
		url: "/pricing/",
	},
};

const POINTS = [
	{
		icon: CircleDollarSign,
		title: "Listed per-token rates",
		body: (
			<>
				Every request is billed at the model's published input and output rates.
				See the{" "}
				<Link
					href="/models/"
					className="font-medium text-brand hover:underline"
				>
					models page
				</Link>{" "}
				for current prices.
			</>
		),
	},
	{
		icon: Receipt,
		title: "5% platform fee on top-ups",
		body: "A flat fee applies when you add credits. A $20 top-up costs $21.",
	},
	{
		icon: BadgeCheck,
		title: "$20 minimum top-up",
		body: "Prepaid credits start at $20. Auto top-up is available but optional.",
	},
	{
		icon: FileText,
		title: "Invoices for every top-up",
		body: "Each purchase produces an invoice in your dashboard and in your inbox.",
	},
	{
		icon: Gauge,
		title: "Spend limits per key",
		body: "Cap spend on any API key so a runaway workload cannot drain your balance.",
	},
	{
		icon: ShieldOff,
		title: "Failed requests are not billed",
		body: "Requests that fail before a provider answers do not deduct credits.",
	},
];

const INCLUDED = [
	"Every model in the catalogue",
	"OpenAI & Anthropic compatible endpoints",
	"Automatic retries and failover",
	"Usage and cost analytics dashboard",
	"Unlimited API keys with spend caps",
	"Key expiry and instant revocation",
	"600 requests/min to start",
	"Email support",
];

const FAQS = [
	{
		q: "Is there a free tier or subscription?",
		a: "There is no subscription. You prepay credits and pay only for the tokens you use at listed model rates.",
	},
	{
		q: "What does the 5% fee cover?",
		a: "Payment processing and platform costs. It applies to credit top-ups only; per-token usage carries no markup.",
	},
	{
		q: "Do credits expire?",
		a: "See the Terms of Use for the current credit policy. Your balance and every transaction are visible in the dashboard.",
	},
	{
		q: "Can I get volume pricing?",
		a: `Yes. Email ${site.emails.sales} to talk about committed volume.`,
	},
];

export default async function PricingPage() {
	const models = await fetchCatalog();
	return (
		<main>
			<JsonLd
				data={{
					"@context": "https://schema.org",
					"@type": "FAQPage",
					mainEntity: FAQS.map((f) => ({
						"@type": "Question",
						name: f.q,
						acceptedAnswer: { "@type": "Answer", text: f.a },
					})),
				}}
			/>
			<PageHero
				crumbs={[{ label: "Pricing", href: "/pricing/" }]}
				eyebrow="Pricing"
				title={
					<>
						Simple, <span className="text-gradient">usage-based</span> pricing.
					</>
				}
				sub="Pay for the tokens you use at the listed model rate. No subscription, no seat fees, no monthly minimum."
			/>

			<section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20">
				<div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
					<FadeIn>
						<div className="relative h-full overflow-hidden rounded-3xl bg-navy p-8 text-white shadow-float">
							<div
								aria-hidden="true"
								className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-[#387ed1]/40 blur-3xl"
							/>
							<div className="relative">
								<p className="text-xs font-semibold uppercase tracking-wider text-[#8dbbf2]">
									Pay as you go
								</p>
								<p className="mt-4 flex items-baseline gap-2 font-display">
									<span className="text-6xl font-extrabold tracking-tight">
										0%
									</span>
									<span className="text-white/60">token markup</span>
								</p>
								<p className="mt-3 text-sm leading-relaxed text-white/65">
									Listed model rates plus a 5% fee on credit top-ups. That is
									the whole bill.
								</p>
								<a
									href={site.urls.signup}
									className="group mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-navy transition-colors hover:bg-white/90"
								>
									Create account
									<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
								</a>
								<ul className="mt-8 grid gap-3 border-t border-white/10 pt-6 text-sm text-white/80">
									{INCLUDED.map((i) => (
										<li key={i} className="flex items-center gap-2.5">
											<BadgeCheck className="size-4 shrink-0 text-[#4fd1c5]" />
											{i}
										</li>
									))}
								</ul>
							</div>
						</div>
					</FadeIn>

					<Stagger className="grid gap-4 sm:grid-cols-2">
						{POINTS.map((p) => (
							<StaggerItem key={p.title}>
								<HoverLift className="h-full rounded-2xl border border-border bg-card p-6 shadow-card">
									<span className="flex size-10 items-center justify-center rounded-xl bg-brand/10">
										<p.icon className="size-5 text-brand" />
									</span>
									<h2 className="mt-4 font-display text-base font-semibold">
										{p.title}
									</h2>
									<p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
										{p.body}
									</p>
								</HoverLift>
							</StaggerItem>
						))}
					</Stagger>
				</div>
			</section>

			<section className="border-y border-border bg-canvas">
				<div className="mx-auto max-w-[1000px] px-5 py-16 sm:px-8 sm:py-20">
					<FadeIn className="mb-10 text-center">
						<h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
							Estimate your monthly cost
						</h2>
						<p className="mt-3 text-muted-foreground">
							Pick a model and your expected volume. Rates come from the live
							catalogue.
						</p>
					</FadeIn>
					<FadeIn>
						<CostCalculator models={models} />
					</FadeIn>
				</div>
			</section>

			<section className="mx-auto max-w-[860px] px-5 py-16 sm:px-8 sm:py-20">
				<FadeIn>
					<h2 className="font-display text-3xl font-bold tracking-tight">
						Pricing questions
					</h2>
				</FadeIn>
				<Stagger className="mt-8 space-y-3">
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
			</section>
		</main>
	);
}
