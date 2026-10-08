import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";

import {
	MARKETING_STATS,
	SELF_REFUND_USAGE_PERCENT,
	SELF_REFUND_WINDOW_DAYS,
} from "@llmgateway/shared";

interface PricingFaqItem {
	question: string;
	/** Plain text — rendered on the page and reused verbatim for FAQPage JSON-LD. */
	answer: string;
	links?: Array<{ href: string; label: string }>;
}

const FAQ_ITEMS: PricingFaqItem[] = [
	{
		question: "How much does Vichar cost?",
		answer: `You pay per-token at each provider's own rates. The only platform fee is a flat ${MARKETING_STATS.platformFee} when you buy credits — no seats, no minimums, no subscription. You can start free without a credit card.`,
	},
	{
		question: "How much do tokens cost for each model?",
		answer:
			"Every model's input and output price per million tokens is listed in the models directory, alongside context size and capabilities. The token cost calculator turns those rates into a monthly estimate for your actual traffic.",
		links: [{ href: "/models", label: "Browse model pricing" }],
	},
	{
		question: "Can I get a refund?",
		answer: `Yes — refunds are self-serve. If you've used less than ${SELF_REFUND_USAGE_PERCENT}% of a credit purchase, open Billing in your dashboard and hit Refund on the charge within ${SELF_REFUND_WINDOW_DAYS} days of buying: the money goes back to your card, no support ticket needed.`,
	},
	{
		question: "Can I self-host Vichar?",
		answer:
			"Yes. Vichar is open source under AGPLv3, so you can self-host the gateway for free — or use the hosted platform and pay only the credit fee.",
		links: [
			{
				href: "https://github.com/vicharai/api",
				label: "See the open-source project",
			},
		],
	},
];

const faqSchema = {
	"@context": "https://schema.org",
	"@type": "FAQPage",
	mainEntity: FAQ_ITEMS.map((item) => ({
		"@type": "Question",
		name: item.question,
		acceptedAnswer: {
			"@type": "Answer",
			text: item.answer,
		},
	})),
};

export function PricingFaq() {
	return (
		<section className="w-full py-16 md:py-24" id="faq">
			<JsonLd data={faqSchema} />
			<div className="container mx-auto px-4 md:px-6">
				<p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-10 text-center">
					LLM API pricing, answered
				</p>
				<div className="grid gap-x-12 gap-y-10 md:grid-cols-2 max-w-5xl mx-auto">
					{FAQ_ITEMS.map((item) => (
						<div key={item.question}>
							<h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
								{item.question}
							</h2>
							<p className="mt-3 text-muted-foreground leading-relaxed">
								{item.answer}
							</p>
							{item.links ? (
								<p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
									{item.links.map((link) => (
										<Link
											key={link.href}
											href={link.href}
											className="text-foreground underline underline-offset-4 hover:text-primary"
										>
											{link.label}
										</Link>
									))}
								</p>
							) : null}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
