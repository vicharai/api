import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { site } from "@/lib/site";

import type { ReactNode } from "react";

/** Inner-page hero with breadcrumbs (and matching BreadcrumbList JSON-LD). */
export function PageHero({
	eyebrow,
	title,
	sub,
	crumbs,
	children,
}: {
	eyebrow?: string;
	title: ReactNode;
	sub?: ReactNode;
	crumbs: Array<{ label: string; href: string }>;
	children?: ReactNode;
}) {
	const trail = [{ label: "Home", href: "/" }, ...crumbs];
	return (
		<section className="relative -mt-16 overflow-hidden border-b border-border pt-16">
			<JsonLd
				data={{
					"@context": "https://schema.org",
					"@type": "BreadcrumbList",
					itemListElement: trail.map((c, i) => ({
						"@type": "ListItem",
						position: i + 1,
						name: c.label,
						item: `${site.domain}${c.href}`,
					})),
				}}
			/>
			<div
				aria-hidden="true"
				className="hero-aurora pointer-events-none absolute inset-0 opacity-80"
			/>
			<div
				aria-hidden="true"
				className="line-grid pointer-events-none absolute inset-0"
			/>
			<div className="relative mx-auto max-w-[1200px] px-5 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-14">
				<nav aria-label="Breadcrumb" className="rise">
					<ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
						{trail.map((c, i) => (
							<li key={c.href} className="flex items-center gap-1">
								{i > 0 && <ChevronRight className="size-3 opacity-60" />}
								{i === trail.length - 1 ? (
									<span aria-current="page" className="text-foreground">
										{c.label}
									</span>
								) : (
									<Link href={c.href} className="hover:text-foreground">
										{c.label}
									</Link>
								)}
							</li>
						))}
					</ol>
				</nav>
				{eyebrow && (
					<p
						className="rise mt-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand"
						style={{ "--d": "60ms" } as React.CSSProperties}
					>
						<span className="size-1.5 rounded-full bg-brand" />
						{eyebrow}
					</p>
				)}
				<h1
					className="rise mt-4 max-w-3xl font-display text-4xl font-extrabold tracking-[-0.02em] text-balance sm:text-[56px] sm:leading-[1.05]"
					style={{ "--d": "100ms" } as React.CSSProperties}
				>
					{title}
				</h1>
				{sub && (
					<p
						className="rise mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty"
						style={{ "--d": "160ms" } as React.CSSProperties}
					>
						{sub}
					</p>
				)}
				{children && (
					<div
						className="rise mt-8"
						style={{ "--d": "220ms" } as React.CSSProperties}
					>
						{children}
					</div>
				)}
			</div>
		</section>
	);
}
