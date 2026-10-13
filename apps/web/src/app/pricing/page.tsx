import Link from "next/link";

import { CostCalculator } from "@/components/cost-calculator";
import { fetchCatalog } from "@/lib/models";
import { site } from "@/lib/site";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Pricing",
	description:
		"Usage-based pricing at listed per-token rates, a flat 5% platform fee on top-ups, and no subscription.",
	alternates: { canonical: "/pricing/" },
};

const POINTS = [
	{
		title: "Listed per-token rates",
		body: (
			<>
				Every request is billed at the model's published input and output rates.
				See the{" "}
				<Link href="/models/" className="text-brand hover:underline">
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

export default async function PricingPage() {
	const models = await fetchCatalog();
	return (
		<main className="mx-auto max-w-[880px] px-5 py-16 sm:px-8 sm:py-24">
			<h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
				Simple, usage-based pricing
			</h1>
			<p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
				Pay for the tokens you use at the listed model rate. No subscription, no
				seat fees, no monthly minimum.
			</p>

			<ul className="mt-12 grid gap-4 sm:grid-cols-2">
				{POINTS.map((p) => (
					<li
						key={p.title}
						className="rounded-2xl border border-border bg-card p-5"
					>
						<h2 className="text-sm font-semibold">{p.title}</h2>
						<p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
							{p.body}
						</p>
					</li>
				))}
			</ul>

			<div className="mt-14">
				<CostCalculator models={models} />
			</div>

			<p className="mt-10 text-sm text-muted-foreground">
				Ready to start?{" "}
				<a href={site.urls.signup} className="text-brand hover:underline">
					Create an account
				</a>{" "}
				and top up from the dashboard.
			</p>
		</main>
	);
}
