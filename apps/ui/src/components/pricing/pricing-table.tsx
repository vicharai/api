"use client";

import { Check } from "lucide-react";
import Link from "next/link";

import { AuthLink } from "@/components/shared/auth-link";
import { Button } from "@/lib/components/button";
import { cn } from "@/lib/utils";

import { MARKETING_STATS } from "@llmgateway/shared";

type FeatureValue = boolean | string;

interface PricingFeature {
	name: string;
	description?: string;
	learnMoreLink?: string;
	learnMoreText?: string;
	included: FeatureValue;
}

const pricingFeatures: PricingFeature[] = [
	{
		name: "Platform Fees",
		included: "5% on credit usage",
	},
	{
		name: "Free Trial",
		included: "Free forever",
	},
	{
		name: "Models",
		description: "200+ unique models across 40+ providers",
		learnMoreLink: "/models",
		learnMoreText: "Browse all models →",
		included: "All 200+ models",
	},
	{
		name: "Free Models",
		description: "Zero-cost models with rate limits",
		included: "3 (rate limited)",
	},
	{
		name: "Chat and API Access",
		description: "Access via API and Lounge",
		learnMoreLink: "https://docs.vichar.io",
		learnMoreText: "View the docs →",
		included: true,
	},
	{
		name: "Activity Logs & Export",
		included: true,
	},
	{
		name: "Data Retention",
		description: `Metadata is free; full payloads are ${MARKETING_STATS.dataStoragePrice}`,
		learnMoreLink:
			"https://docs.vichar.io/features/data-retention#storage-pricing",
		learnMoreText: "See storage pricing →",
		included: "30 days",
	},
	{
		name: "Auto-routing & Vendor Selection",
		description: "Automatic provider routing",
		learnMoreLink: "https://docs.vichar.io",
		learnMoreText: "Routing docs →",
		included: true,
	},
	{
		name: "Budgets & Spend Controls",
		included: true,
	},
	{
		name: "Prompt Caching",
		description: "Cache prompts for faster responses",
		included: true,
	},
	{
		name: "Team Management",
		included: true,
	},
	{
		name: "Advanced Analytics",
		included: true,
	},
	{
		name: "Payment Options",
		included: "Credit card",
	},
	{
		name: "Rate Limits",
		description: "Paid models are not rate limited",
		included: "20 reqs/min on free models",
	},
	{
		name: "Token Pricing",
		description: "Model pricing details. Non-US cards: +1.5% intl fee",
		learnMoreLink: "/models",
		learnMoreText: "See model prices →",
		included: "Pay per token + 5% fee",
	},
	{
		name: "Support",
		included: "Discord Community",
	},
];

function FeatureCell({ value }: { value: FeatureValue }) {
	if (typeof value === "boolean") {
		return value ? <Check className="size-5 text-green-500 mx-auto" /> : null;
	}
	return (
		<span className="text-sm text-center block text-muted-foreground">
			{value}
		</span>
	);
}

export function PricingTable() {
	return (
		<section className="w-full pb-16 md:pb-24">
			<div className="container mx-auto px-4 md:px-6">
				<h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center mb-8">
					What&apos;s included
				</h2>
				<div className="overflow-x-auto max-w-3xl mx-auto">
					<table className="w-full border-collapse min-w-[400px]">
						{/* Header */}
						<thead>
							<tr>
								<th scope="col" className="text-left p-4 w-2/3">
									<span className="sr-only">Feature</span>
								</th>
								<th
									scope="col"
									className="p-4 text-center w-1/3 bg-blue-600/10 rounded-t-xl border-x border-t border-blue-600/20"
								>
									<div className="font-semibold text-lg text-blue-600 dark:text-blue-400">
										Free
									</div>
									<div className="text-2xl font-bold mt-1">$0</div>
									<div className="text-sm text-muted-foreground">forever</div>
								</th>
							</tr>
						</thead>
						<tbody>
							{pricingFeatures.map((feature, index) => (
								<tr
									key={feature.name}
									className={cn(
										"border-b border-border/50",
										index % 2 === 0 ? "bg-muted/30" : "",
									)}
								>
									<th scope="row" className="p-4 text-left font-normal">
										<div className="font-medium">{feature.name}</div>
										{feature.description && (
											<div className="text-sm text-muted-foreground">
												{feature.description}
											</div>
										)}
										{feature.learnMoreLink && (
											<Link
												href={feature.learnMoreLink as any}
												className="text-xs text-blue-700 underline underline-offset-2 dark:text-blue-400"
											>
												{feature.learnMoreText ?? feature.name}
											</Link>
										)}
									</th>
									<td className="p-4 text-center bg-blue-600/5 border-x border-blue-600/20">
										<FeatureCell value={feature.included} />
									</td>
								</tr>
							))}
							{/* CTA Row */}
							<tr>
								<th scope="row" className="p-4 text-left font-normal">
									<span className="sr-only">Get started</span>
								</th>
								<td className="p-6 text-center bg-blue-600/5 border-x border-b border-blue-600/20 rounded-b-xl">
									<AuthLink href="/signup">
										<Button className="w-full max-w-[200px]">
											Get Started Free
										</Button>
									</AuthLink>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</section>
	);
}
