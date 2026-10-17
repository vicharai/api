import { Eye, Lock, Route, Scale } from "lucide-react";

import { FadeIn, HoverLift, Stagger, StaggerItem } from "@/components/motion";
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
		body: "Per-token billing at the listed model rate. No hidden markup, no seat fees.",
	},
	{
		icon: Route,
		title: "Reliability first",
		body: "Automatic failover across providers keeps your application answering.",
	},
	{
		icon: Lock,
		title: "Privacy by default",
		body: "We store request metadata (tokens, cost, latency, provider), not your prompts or responses.",
	},
	{
		icon: Eye,
		title: "Full visibility",
		body: "Every request, token and dollar is visible in your dashboard in real time.",
	},
];

export default function AboutPage() {
	return (
		<main>
			<PageHero
				crumbs={[{ label: "About", href: "/about/" }]}
				eyebrow="About"
				title={
					<>
						A thought, <span className="text-gradient">routed.</span>
					</>
				}
				sub="Vichar is a single API for models from many providers. It exists for developers who don't want to manage a separate account, key and billing relationship for every lab they use."
			/>

			<section className="mx-auto grid max-w-[1200px] gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.2fr]">
				<FadeIn>
					<h2 className="font-display text-3xl font-bold tracking-tight">
						Why we built it
					</h2>
				</FadeIn>
				<FadeIn delay={0.1}>
					<div className="space-y-5 text-[16px] leading-relaxed text-muted-foreground">
						<p>
							One key and one OpenAI-compatible endpoint reach the whole
							catalogue. When a provider slows down or fails, requests reroute
							to another healthy one, so your application keeps answering.
						</p>
						<p>
							Instead of juggling invoices, SDK quirks and rate limits for every
							lab, you get one balance, one dashboard and one integration that
							grows with the frontier.
						</p>
					</div>
				</FadeIn>
			</section>

			<section className="border-y border-border bg-canvas">
				<div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20">
					<FadeIn>
						<h2 className="font-display text-3xl font-bold tracking-tight">
							What we care about
						</h2>
					</FadeIn>
					<Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{VALUES.map((v) => (
							<StaggerItem key={v.title}>
								<HoverLift className="h-full rounded-2xl border border-border bg-card p-6 shadow-card">
									<span className="flex size-11 items-center justify-center rounded-xl bg-brand-gradient text-white">
										<v.icon className="size-5" />
									</span>
									<h3 className="mt-5 font-display text-lg font-semibold">
										{v.title}
									</h3>
									<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
										{v.body}
									</p>
								</HoverLift>
							</StaggerItem>
						))}
					</Stagger>
				</div>
			</section>

			{/* TODO: add company details (entity name, address) once confirmed. */}
			<section className="mx-auto max-w-[1200px] px-5 py-16 text-center sm:px-8 sm:py-20">
				<FadeIn>
					<h2 className="font-display text-2xl font-bold tracking-tight">
						Questions or partnership ideas?
					</h2>
					<a
						href={`mailto:${site.emails.sales}`}
						className="mt-4 inline-block font-mono text-lg text-brand hover:underline"
					>
						{site.emails.sales}
					</a>
				</FadeIn>
			</section>
		</main>
	);
}
