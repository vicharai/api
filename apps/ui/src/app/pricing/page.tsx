import Footer from "@/components/landing/footer";
import { HeroRSC } from "@/components/landing/hero-rsc";
import { PricingFaq } from "@/components/pricing/pricing-faq";
import { PricingHero } from "@/components/pricing/pricing-hero";
import { PricingTable } from "@/components/pricing/pricing-table";
import { JsonLd } from "@/components/seo/json-ld";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "LLM API Pricing — Provider Rates",
	description:
		"Pay per-token at provider rates with a flat 5% platform fee on credits. One bill across 40+ LLM providers.",
	alternates: { canonical: "/pricing" },
	openGraph: {
		title: "LLM API Pricing — Provider Rates",
		description:
			"Pay per-token at provider rates with a flat 5% platform fee on credits. One bill across 40+ LLM providers.",
		type: "website",
		url: "https://app.vichar.io/pricing",
	},
	twitter: {
		card: "summary_large_image",
		title: "LLM API Pricing — Provider Rates",
		description:
			"Pay per-token at provider rates with a flat 5% platform fee on credits. One bill across 40+ LLM providers.",
	},
};

const pricingSchema = {
	"@context": "https://schema.org",
	"@type": "Product",
	name: "Vichar API",
	description:
		"Unified API for 200+ LLM models across 40+ providers. Pay per-token at provider rates with a flat 5% platform fee on credits.",
	brand: {
		"@type": "Brand",
		name: "Vichar",
	},
	url: "https://app.vichar.io/pricing",
	offers: {
		"@type": "AggregateOffer",
		priceCurrency: "USD",
		lowPrice: "0",
		offerCount: 1,
		offers: [
			{
				"@type": "Offer",
				name: "Free",
				price: "0",
				priceCurrency: "USD",
				description:
					"Access all 200+ models with a flat 5% platform fee on credit purchases.",
				url: "https://app.vichar.io/pricing",
			},
		],
	},
};

const breadcrumbSchema = {
	"@context": "https://schema.org",
	"@type": "BreadcrumbList",
	itemListElement: [
		{
			"@type": "ListItem",
			position: 1,
			name: "Home",
			item: "https://app.vichar.io",
		},
		{
			"@type": "ListItem",
			position: 2,
			name: "Pricing",
			item: "https://app.vichar.io/pricing",
		},
	],
};

export default function PricingPage() {
	return (
		<>
			<JsonLd data={[pricingSchema, breadcrumbSchema]} />
			<HeroRSC navbarOnly />
			<main>
				<PricingHero />
				<PricingTable />
				<PricingFaq />
			</main>
			<Footer />
		</>
	);
}
