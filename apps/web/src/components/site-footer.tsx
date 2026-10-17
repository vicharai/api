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
			{
				label: "Model catalogue (JSON)",
				href: site.urls.apiModels,
				external: true,
			},
		],
	},
	{
		title: "Developers",
		links: [
			{ label: "Documentation", href: site.urls.docs, external: true },
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
			{ label: "Terms of use", href: "/legal/terms/" },
			{ label: "Privacy policy", href: "/legal/privacy/" },
			{ label: "Sub-processors", href: "/legal/sub-processors/" },
		],
	},
];

export function SiteFooter() {
	return (
		<footer className="border-t border-border bg-canvas">
			<div className="mx-auto max-w-[1100px] px-5 pb-10 pt-14 sm:px-8">
				<div className="grid gap-10 lg:grid-cols-[1fr_3fr]">
					<div>
						<Link
							href="/"
							className="flex items-center gap-2 text-lg font-semibold tracking-tight text-brand"
						>
							<VicharMark className="size-5" />
							VICHAR
						</Link>
						<p className="mt-4 text-sm text-muted-foreground">
							© {new Date().getFullYear()} Vichar.
							<br />
							All rights reserved.
						</p>
						<a
							href={`mailto:${site.emails.support}`}
							className="mt-4 inline-block text-sm text-body hover:text-brand"
						>
							{site.emails.support}
						</a>
					</div>
					<div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
						{COLUMNS.map((col) => (
							<div key={col.title}>
								<h3 className="text-[15px] font-medium text-foreground">
									{col.title}
								</h3>
								<ul className="mt-4 space-y-3 text-sm">
									{col.links.map((l) => (
										<li key={l.label}>
											{l.external ? (
												<a
													href={l.href}
													className="text-body transition-colors hover:text-brand"
												>
													{l.label}
												</a>
											) : (
												<Link
													href={l.href}
													className="text-body transition-colors hover:text-brand"
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
				<div className="mt-12 space-y-3 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
					<p>
						Vichar provides access to third-party AI models through a single
						API. Model names and logos belong to their respective owners. Prices
						shown are per million tokens in USD and come from the live model
						catalogue; the rate applied to a request is the one listed at the
						time it is made.
					</p>
					<p>
						Prompts and responses are not stored by default. See the{" "}
						<Link href="/legal/privacy/" className="text-brand hover:underline">
							privacy policy
						</Link>{" "}
						and{" "}
						<Link href="/legal/terms/" className="text-brand hover:underline">
							terms of use
						</Link>{" "}
						for details.
					</p>
				</div>
			</div>
		</footer>
	);
}
