import { site } from "@/lib/site";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Contact",
	description: "Get in touch with Vichar for support, sales and partnerships.",
	alternates: { canonical: "/contact/" },
};

const CHANNELS = [
	{
		title: "Support",
		body: "Help with your account, billing or the API.",
		email: site.emails.support,
	},
	{
		title: "Sales and partnerships",
		body: "Volume pricing, integrations and anything else.",
		email: site.emails.sales,
	},
];

export default function ContactPage() {
	return (
		<main className="mx-auto max-w-[720px] px-5 py-16 sm:px-8 sm:py-24">
			<h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
				Contact
			</h1>
			<p className="mt-3 text-[15px] text-muted-foreground">
				We read every message and reply by email.
			</p>
			<div className="mt-10 grid gap-4 sm:grid-cols-2">
				{CHANNELS.map((c) => (
					<div
						key={c.title}
						className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
					>
						<h2 className="font-display text-base font-semibold tracking-tight">
							{c.title}
						</h2>
						<p className="mt-1.5 text-sm text-muted-foreground">{c.body}</p>
						<a
							href={`mailto:${c.email}`}
							className="mt-4 inline-block font-mono text-sm text-brand hover:underline"
						>
							{c.email}
						</a>
					</div>
				))}
			</div>
			<p className="mt-10 text-sm text-muted-foreground">
				Documentation lives at{" "}
				<a href={site.urls.docs} className="text-brand hover:underline">
					docs.vichar.io
				</a>
				.
			</p>
		</main>
	);
}
