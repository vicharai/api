import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { site } from "@/lib/site";

import type { ReactNode } from "react";

/** Inner-page title block with breadcrumbs (and matching BreadcrumbList JSON-LD). */
export function PageHero({
	title,
	sub,
	crumbs,
	children,
}: {
	title: ReactNode;
	sub?: ReactNode;
	crumbs: Array<{ label: string; href: string }>;
	children?: ReactNode;
}) {
	const trail = [{ label: "Home", href: "/" }, ...crumbs];
	return (
		<section className="border-b border-border">
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
			<div className="mx-auto max-w-[1100px] px-5 pb-14 pt-8 sm:px-8 sm:pb-16">
				<nav aria-label="Breadcrumb">
					<ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
						{trail.map((c, i) => (
							<li key={c.href} className="flex items-center gap-1">
								{i > 0 && <ChevronRight className="size-3 opacity-60" />}
								{i === trail.length - 1 ? (
									<span aria-current="page" className="text-body">
										{c.label}
									</span>
								) : (
									<Link href={c.href} className="hover:text-brand">
										{c.label}
									</Link>
								)}
							</li>
						))}
					</ol>
				</nav>
				<div className="mt-12 text-center sm:mt-14">
					<h1 className="rise mx-auto max-w-3xl text-[34px] font-normal leading-tight tracking-tight sm:text-[52px]">
						{title}
					</h1>
					{sub && (
						<p
							className="rise mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-body"
							style={{ "--d": "80ms" } as React.CSSProperties}
						>
							{sub}
						</p>
					)}
					{children && (
						<div
							className="rise mt-8 flex justify-center"
							style={{ "--d": "140ms" } as React.CSSProperties}
						>
							{children}
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
