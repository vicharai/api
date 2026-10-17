import { Eye, Lock, Route, Scale } from "lucide-react";

import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { PageHero } from "@/components/page-hero";
import { site } from "@/lib/site";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "About Vichar",
	description:
		"Vichar is one OpenAI-compatible API for models from many providers, built for developers who don't want to manage many provider accounts.",
	alternates: { canonical: "/about/" },
};

const VALUES = [
	{
		icon: Scale,
		title: "Transparent billing",
		tone: "bg-g-blue-soft text-g-blue-deep",
		body: "Per-token billing at the listed model rate. No hidden markup, no seat fees.",
	},
	{
		icon: Route,
		title: "Reliability first",
		tone: "bg-g-red-soft text-g-red-deep",
		body: "Automatic failover across providers keeps your application answering.",
	},
	{
		icon: Lock,
		title: "Privacy by default",
		tone: "bg-g-yellow-soft text-g-yellow-deep",
		body: "We store request metadata (tokens, cost, latency, provider), not your prompts or responses.",
	},
	{
		icon: Eye,
		title: "Full visibility",
		tone: "bg-g-green-soft text-g-green-deep",
		body: "Every request, token and dollar is visible in your dashboard in real time.",
	},
];

export default function AboutPage() {
	return (
		<main>
			<PageHero
				crumbs={[{ label: "About", href: "/about/" }]}
				title="One key for the whole frontier"
				sub="Vichar is a single API for models from many providers, built for developers who don't want a separate account, key and invoice for every lab they use."
			/>

			<section className="mx-auto grid max-w-[1100px] gap-10 px-5 py-20 text-[17px] leading-relaxed text-body sm:px-8 md:grid-cols-2 md:gap-16">
				<FadeIn className="space-y-5">
					<p>
						One key and one OpenAI-compatible endpoint reach the whole
						catalogue. When a provider slows down or fails, requests reroute to
						another healthy one, so your application keeps answering.
					</p>
				</FadeIn>
				<FadeIn className="space-y-5">
					<p>
						Instead of juggling invoices, SDK quirks and rate limits for every
						lab, you get one balance, one dashboard and one integration that
						grows as new models ship.
					</p>
				</FadeIn>
			</section>

			<section className="border-t border-border bg-canvas">
				<div className="mx-auto max-w-[1100px] px-5 py-20 sm:px-8">
					<h2 className="text-[28px] font-normal tracking-tight">
						What we care about
					</h2>
					<Stagger className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
						{VALUES.map((v) => (
							<StaggerItem key={v.title}>
								<span
									className={`flex size-14 items-center justify-center rounded-2xl ${v.tone}`}
								>
									<v.icon className="size-6" />
								</span>
								<h3 className="mt-5 text-[20px] font-medium">{v.title}</h3>
								<p className="mt-2 text-[15px] leading-relaxed text-body">
									{v.body}
								</p>
							</StaggerItem>
						))}
					</Stagger>
				</div>
			</section>

			{/* TODO: add company details (entity name, address) once confirmed. */}
			<section className="border-t border-border">
				<div className="mx-auto max-w-[1100px] px-5 py-20 text-center sm:px-8">
					<h2 className="text-[28px] font-normal tracking-tight">
						Questions or partnership ideas?
					</h2>
					<p className="mt-3 text-[15px] text-body">
						Write to us at{" "}
						<a
							href={`mailto:${site.emails.sales}`}
							className="text-g-blue hover:underline"
						>
							{site.emails.sales}
						</a>
						.
					</p>
				</div>
			</section>
		</main>
	);
}
