import Markdown from "markdown-to-jsx";
import Link from "next/link";
import { notFound } from "next/navigation";

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
		<main className="mx-auto max-w-[760px] px-5 py-16 sm:px-8 sm:py-24">
			<nav className="flex gap-4 text-sm" aria-label="Legal pages">
				{LEGAL_SLUGS.map((l) => (
					<Link
						key={l}
						href={`/legal/${l}/`}
						className={
							l === s
								? "font-medium text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}
						aria-current={l === s ? "page" : undefined}
					>
						{LEGAL_TITLES[l]}
					</Link>
				))}
			</nav>
			<h1 className="mt-8 font-display text-4xl font-semibold tracking-tight">
				{LEGAL_TITLES[s]}
			</h1>
			<article className="prose prose-neutral dark:prose-invert mt-10 max-w-none text-[15px]">
				<Markdown>{getLegalMarkdown(s)}</Markdown>
			</article>
		</main>
	);
}
