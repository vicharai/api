import { ArrowUpRight, BookOpen, Handshake, LifeBuoy } from "lucide-react";

import { ContactForm } from "@/components/contact-form";
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
		tone: "bg-g-blue-soft text-g-blue-deep",
		body: "Help with your account, billing or the API.",
		label: site.emails.support,
		href: `mailto:${site.emails.support}`,
	},
	{
		icon: Handshake,
		title: "Sales and partnerships",
		tone: "bg-g-green-soft text-g-green-deep",
		body: "Volume pricing, integrations and anything else.",
		label: site.emails.sales,
		href: `mailto:${site.emails.sales}`,
	},
	{
		icon: BookOpen,
		title: "Documentation",
		tone: "bg-g-yellow-soft text-g-yellow-deep",
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
				sub="Send us a message and we'll reply by email, usually within one business day."
			/>
			<section className="mx-auto grid max-w-[1100px] gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1fr)_340px]">
				<div className="min-w-0">
					<h2 className="mb-5 text-[22px] font-medium">Send a message</h2>
					<ContactForm />
				</div>
				<div className="min-w-0">
					<h2 className="mb-5 text-[22px] font-medium">
						Other ways to reach us
					</h2>
					<Stagger className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
						{CHANNELS.map((c) => (
							<StaggerItem key={c.title}>
								<a
									href={c.href}
									className="group flex h-full gap-4 rounded-[28px] bg-canvas p-5 transition-shadow hover:shadow-[0_1px_3px_rgb(60_64_67/0.15),0_4px_8px_3px_rgb(60_64_67/0.08)] sm:flex-col lg:flex-row"
								>
									<span
										className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${c.tone}`}
									>
										<c.icon className="size-5" />
									</span>
									<span className="min-w-0">
										<span className="block text-[17px] font-medium">
											{c.title}
										</span>
										<span className="mt-1 block text-[14px] text-body">
											{c.body}
										</span>
										<span className="mt-2 inline-flex max-w-full items-center gap-1 text-[14px] font-medium text-g-blue">
											<span className="truncate">{c.label}</span>
											<ArrowUpRight className="size-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
										</span>
									</span>
								</a>
							</StaggerItem>
						))}
					</Stagger>
				</div>
			</section>
		</main>
	);
}
