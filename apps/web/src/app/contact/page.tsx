import { ArrowUpRight, BookOpen, Handshake, LifeBuoy } from "lucide-react";

import { Stagger, StaggerItem } from "@/components/motion";
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
				title="Contact us"
				sub="We read every message and reply by email."
			/>
			<section className="mx-auto max-w-[1100px] px-5 py-20 sm:px-8">
				<Stagger className="grid gap-5 md:grid-cols-3">
					{CHANNELS.map((c) => (
						<StaggerItem key={c.title}>
							<a
								href={c.href}
								className="group flex h-full flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-brand/40"
							>
								<c.icon className="size-6 text-brand" strokeWidth={1.75} />
								<h2 className="mt-5 text-lg font-semibold">{c.title}</h2>
								<p className="mt-1.5 flex-1 text-[15px] text-body">{c.body}</p>
								<span className="mt-5 inline-flex items-center gap-1 text-[15px] font-medium text-brand">
									{c.label}
									<ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
								</span>
							</a>
						</StaggerItem>
					))}
				</Stagger>
			</section>
		</main>
	);
}
