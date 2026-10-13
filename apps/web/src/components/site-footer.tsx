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
			{ label: "Docs", href: site.urls.docs, external: true },
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
		<footer className="border-t border-border/60">
			<div className="mx-auto max-w-[1200px] px-5 py-14 sm:px-8">
				<div className="flex flex-col gap-10 md:flex-row md:justify-between">
					<div>
						<Link
							href="/"
							className="flex items-center gap-2 font-medium tracking-tight"
						>
							<VicharMark className="size-5 text-brand" />
							<span>Vichar</span>
						</Link>
						<p className="mt-3 text-sm text-muted-foreground">{site.tagline}</p>
					</div>
					<div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
						{COLUMNS.map((col) => (
							<div key={col.title}>
								<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
									{col.title}
								</h3>
								<ul className="mt-4 space-y-2.5 text-sm">
									{col.links.map((l) => (
										<li key={l.label}>
											{l.external ? (
												<a
													href={l.href}
													className="text-muted-foreground transition-colors hover:text-foreground"
												>
													{l.label}
												</a>
											) : (
												<Link
													href={l.href}
													className="text-muted-foreground transition-colors hover:text-foreground"
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
				<div className="mt-12 border-t border-border/60 pt-6 text-sm text-muted-foreground">
					© 2026 Vichar
				</div>
			</div>
		</footer>
	);
}
