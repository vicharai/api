import Markdown from "markdown-to-jsx";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/page-hero";
import {
	LEGAL_SLUGS,
	LEGAL_TITLES,
	getLegalMarkdown,
	type LegalSlug,
} from "@/lib/legal";

import type { Metadata } from "next";

export function generateStaticParams() {
	return LEGAL_SLUGS.map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	if (!(LEGAL_SLUGS as readonly string[]).includes(slug)) {
		return {};
	}
	const s = slug as LegalSlug;
	return {
		title: LEGAL_TITLES[s],
		alternates: { canonical: `/legal/${s}/` },
	};
}

export default async function LegalPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	if (!(LEGAL_SLUGS as readonly string[]).includes(slug)) {
		notFound();
	}
	const s = slug as LegalSlug;

	return (
		<main>
			<PageHero
				crumbs={[{ label: LEGAL_TITLES[s], href: `/legal/${s}/` }]}
				title={LEGAL_TITLES[s]}
			/>
			<div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[220px_1fr]">
				<nav
					aria-label="Legal pages"
					className="min-w-0 lg:sticky lg:top-24 lg:self-start"
				>
					<ul className="flex gap-2 overflow-x-auto lg:flex-col">
						{LEGAL_SLUGS.map((l) => (
							<li key={l}>
								<Link
									href={`/legal/${l}/`}
									className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
										l === s
											? "bg-brand/10 font-semibold text-brand"
											: "text-muted-foreground hover:bg-accent hover:text-foreground"
									}`}
									aria-current={l === s ? "page" : undefined}
								>
									{LEGAL_TITLES[l]}
								</Link>
							</li>
						))}
					</ul>
				</nav>
				<article className="prose prose-neutral dark:prose-invert min-w-0 max-w-[760px] break-words text-[15px] prose-headings:font-display prose-headings:tracking-tight prose-a:text-brand">
					<Markdown>{getLegalMarkdown(s)}</Markdown>
				</article>
			</div>
		</main>
	);
}
