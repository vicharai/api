import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";

import { site } from "@/lib/site";
import { VicharMark } from "@/lib/vichar-logo";

const COLUMNS: Array<{
	title: string;
	links: Array<{ label: string; href: string; external?: boolean }>;
}> = [
	{
		title: "Product",
		links: [
			{ label: "Models", href: "/models/" },
			{ label: "Pricing", href: "/pricing/" },
			{ label: "Dashboard", href: site.urls.app, external: true },
			{ label: "API reference", href: site.urls.docs, external: true },
		],
	},
	{
		title: "Developers",
		links: [
			{
				label: "Quick start",
				href: `${site.urls.docs}/quick-start`,
				external: true,
			},
			{
				label: "OpenAI SDK",
				href: `${site.urls.docs}/openai-sdk`,
				external: true,
			},
			{
				label: "Vercel AI SDK",
				href: `${site.urls.docs}/vercel-ai-sdk`,
				external: true,
			},
			{
				label: "Coding tools",
				href: `${site.urls.docs}/coding-tools`,
				external: true,
			},
		],
	},
	{
		title: "Company",
		links: [
			{ label: "About", href: "/about/" },
			{ label: "Contact", href: "/contact/" },
		],
	},
	{
		title: "Legal",
		links: [
			{ label: "Terms", href: "/legal/terms/" },
			{ label: "Privacy", href: "/legal/privacy/" },
			{ label: "Sub-processors", href: "/legal/sub-processors/" },
		],
	},
];

export function SiteFooter() {
	return (
		<footer className="relative overflow-hidden bg-navy text-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[900px] -translate-x-1/2 rounded-full bg-[#387ed1]/25 blur-[120px]"
			/>
			<div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
				<div className="flex flex-col items-start justify-between gap-6 border-b border-white/10 py-12 md:flex-row md:items-center">
					<div>
						<p className="font-display text-2xl font-semibold tracking-tight">
							Ship on every model, from one key.
						</p>
						<p className="mt-1.5 text-sm text-white/60">
							Create an account, top up, and make your first request in minutes.
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<a
							href={site.urls.signup}
							className="group inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-navy transition-colors hover:bg-white/90"
						>
							Get API key
							<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
						</a>
						<a
							href={site.urls.docs}
							className="inline-flex h-11 items-center rounded-lg border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/10"
						>
							Read the docs
						</a>
					</div>
				</div>

				<div className="grid gap-10 py-14 lg:grid-cols-[1.3fr_2fr]">
					<div>
						<Link
							href="/"
							className="flex items-center gap-2 font-display text-lg font-bold tracking-tight"
						>
							<span className="flex size-7 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
								<VicharMark className="size-4 text-[#5b9bea]" />
							</span>
							Vichar
						</Link>
						<p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
							{site.description}
						</p>
						<a
							href={`mailto:${site.emails.support}`}
							className="mt-5 inline-flex items-center gap-2 text-sm text-white/80 transition-colors hover:text-white"
						>
							<Mail className="size-4" />
							{site.emails.support}
						</a>
					</div>
					<div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
						{COLUMNS.map((col) => (
							<div key={col.title}>
								<h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
									{col.title}
								</h3>
								<ul className="mt-4 space-y-3 text-sm">
									{col.links.map((l) => (
										<li key={l.label}>
											{l.external ? (
												<a
													href={l.href}
													className="text-white/70 transition-colors hover:text-white"
												>
													{l.label}
												</a>
											) : (
												<Link
													href={l.href}
													className="text-white/70 transition-colors hover:text-white"
												>
													{l.label}
												</Link>
											)}
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-3 border-t border-white/10 py-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
					<span>© {new Date().getFullYear()} Vichar. All rights reserved.</span>
					<span className="font-mono">{site.tagline}</span>
				</div>
			</div>
		</footer>
	);
}
