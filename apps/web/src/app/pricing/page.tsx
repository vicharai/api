import { Check } from "lucide-react";
import Link from "next/link";

import { CostCalculator } from "@/components/cost-calculator";
import { JsonLd } from "@/components/json-ld";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
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
		title: "Listed per-token rates",
		body: (
			<>
				Every request is billed at the model's published input and output rates.
				See the{" "}
				<Link href="/models/" className="text-g-blue hover:underline">
					models page
				</Link>{" "}
				for current prices.
			</>
		),
	},
	{
		title: "5% platform fee on top-ups",
		body: "A flat fee applies when you add credits. A $20 top-up costs $21.",
	},
	{
		title: "$20 minimum top-up",
		body: "Prepaid credits start at $20. Auto top-up is available but optional.",
	},
	{
		title: "Invoices for every top-up",
		body: "Each purchase produces an invoice in your dashboard and in your inbox.",
	},
	{
		title: "Spend limits per key",
		body: "Cap spend on any API key so a runaway workload cannot drain your balance.",
	},
	{
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
				title="Pricing"
				sub="Pay for the tokens you use at the listed model rate. No subscription, no seat fees, no monthly minimum."
			/>

			<section className="mx-auto max-w-[1100px] px-5 py-20 sm:px-8">
				<Stagger className="grid gap-3 sm:grid-cols-3 sm:gap-5">
					{[
						[
							"0",
							"%",
							"Markup on per-token model rates",
							"Every request is billed at the model's published input and output rate.",
							"text-g-blue",
						],
						[
							"5",
							"%",
							"Platform fee on credit top-ups",
							"A flat fee when you add credits. A $20 top-up costs $21.",
							"text-g-yellow-deep",
						],
						[
							"$0",
							"",
							"For failed requests",
							"Requests that fail before a provider answers never deduct credits.",
							"text-g-green-deep",
						],
					].map(([n, unit, title, body, color]) => (
						<StaggerItem
							key={title}
							className="flex items-center gap-5 rounded-[24px] bg-canvas p-5 sm:block sm:rounded-[28px] sm:px-6 sm:py-10 sm:text-center"
						>
							<p
								className={`w-[92px] shrink-0 text-[48px] font-normal leading-none tracking-tight sm:w-auto sm:text-[80px] ${color}`}
							>
								{n}
								<span className="text-[26px] sm:text-[40px]">{unit}</span>
							</p>
							<div className="min-w-0">
								<h2 className="text-[17px] font-medium sm:mt-5 sm:text-lg">
									{title}
								</h2>
								<p className="mt-1 text-sm leading-relaxed text-body sm:mx-auto sm:mt-2 sm:max-w-[280px] sm:text-[15px]">
									{body}
								</p>
							</div>
						</StaggerItem>
					))}
				</Stagger>
			</section>

			<section className="border-t border-border">
				<div className="mx-auto grid max-w-[1100px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
					<FadeIn>
						<h2 className="text-[28px] font-normal tracking-tight">
							Included on every account
						</h2>
						<p className="mt-3 max-w-sm text-[15px] leading-relaxed text-body">
							There are no plans or tiers. Everyone gets the same platform.
						</p>
						<a
							href={site.urls.signup}
							className="mt-7 inline-flex h-11 items-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-brand-strong"
						>
							Sign up for free
						</a>
					</FadeIn>
					<FadeIn>
						<ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
							{INCLUDED.map((i) => (
								<li key={i} className="flex items-start gap-3 text-[15px]">
									<Check
										className="mt-0.5 size-4 shrink-0 text-success"
										strokeWidth={2.5}
									/>
									{i}
								</li>
							))}
						</ul>
						<dl className="mt-10 divide-y divide-border border-y border-border">
							{POINTS.slice(2, 5).map((p) => (
								<div
									key={p.title}
									className="grid gap-1 py-4 sm:grid-cols-[200px_1fr] sm:gap-6"
								>
									<dt className="text-[15px] font-medium">{p.title}</dt>
									<dd className="text-[15px] leading-relaxed text-body">
										{p.body}
									</dd>
								</div>
							))}
						</dl>
					</FadeIn>
				</div>
			</section>

			<section className="border-t border-border bg-canvas">
				<div className="mx-auto max-w-[1000px] px-5 py-20 sm:px-8">
					<FadeIn className="mb-10 text-center">
						<h2 className="text-[28px] font-normal tracking-tight">
							Estimate your monthly cost
						</h2>
						<p className="mt-3 text-[15px] text-body">
							Pick a model and your expected volume. Rates come from the live
							catalogue.
						</p>
					</FadeIn>
					<FadeIn>
						<CostCalculator models={models} />
					</FadeIn>
				</div>
			</section>

			<section className="border-t border-border">
				<div className="mx-auto max-w-[800px] px-5 py-20 sm:px-8">
					<h2 className="text-[28px] font-normal tracking-tight">
						Pricing questions
					</h2>
					<div className="mt-8 divide-y divide-border rounded-xl border border-border">
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
				</div>
			</section>
		</main>
	);
}
