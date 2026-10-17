import { ArrowUpRight, BookOpen, Handshake, LifeBuoy } from "lucide-react";

import { HoverLift, Stagger, StaggerItem } from "@/components/motion";
import { PageHero } from "@/components/page-hero";
import { site } from "@/lib/site";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Contact",
	description:
		"Get in touch with Vichar for API support, billing questions, sales and partnerships.",
	alternates: { canonical: "/contact/" },
};

const CHANNELS = [
	{
		icon: LifeBuoy,
		title: "Support",
		body: "Help with your account, billing or the API.",
		label: site.emails.support,
		href: `mailto:${site.emails.support}`,
	},
	{
		icon: Handshake,
		title: "Sales and partnerships",
		body: "Volume pricing, integrations and anything else.",
		label: site.emails.sales,
		href: `mailto:${site.emails.sales}`,
	},
	{
		icon: BookOpen,
		title: "Documentation",
		body: "Quick start, SDK guides and the full API reference.",
		label: "docs.vichar.io",
		href: site.urls.docs,
	},
];

export default function ContactPage() {
	return (
		<main>
			<PageHero
				crumbs={[{ label: "Contact", href: "/contact/" }]}
				eyebrow="Contact"
				title="We'd love to hear from you."
				sub="We read every message and reply by email."
			/>
			<section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20">
				<Stagger className="grid gap-5 md:grid-cols-3">
					{CHANNELS.map((c) => (
						<StaggerItem key={c.title}>
							<HoverLift className="h-full">
								<a
									href={c.href}
									className="group flex h-full flex-col rounded-2xl border border-border bg-card p-7 shadow-card transition-colors hover:border-brand/30"
								>
									<div className="flex items-center justify-between">
										<span className="flex size-11 items-center justify-center rounded-xl bg-brand/10">
											<c.icon className="size-5 text-brand" />
										</span>
										<ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
									</div>
									<h2 className="mt-6 font-display text-lg font-semibold tracking-tight">
										{c.title}
									</h2>
									<p className="mt-1.5 flex-1 text-sm text-muted-foreground">
										{c.body}
									</p>
									<span className="mt-6 font-mono text-sm font-medium text-brand">
										{c.label}
									</span>
								</a>
							</HoverLift>
						</StaggerItem>
					))}
				</Stagger>
			</section>
		</main>
	);
}
