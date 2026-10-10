import { ArrowLeftIcon } from "lucide-react";
import Markdown from "markdown-to-jsx";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LegalFooter, LegalHeader } from "@/components/legal/legal-shell";
import { LegalSummary } from "@/components/legal/legal-summary";
import { getMarkdownOptions } from "@/lib/utils/markdown";

import { allLegals } from "content-collections";

import type { Metadata } from "next";

interface LegalEntryPageProps {
	params: Promise<{ slug: string }>;
}

export default async function LegalEntryPage({ params }: LegalEntryPageProps) {
	const { slug } = await params;

	const entry = allLegals.find((entry) => entry.slug === slug);

	if (!entry) {
		notFound();
	}

	return (
		<>
			<LegalHeader />
			<div className="min-h-screen bg-white text-black dark:bg-black dark:text-white pt-24">
				<main className="container mx-auto px-4 py-8">
					<div className="max-w-4xl mx-auto">
						<div className="mb-8">
							<Link
								href="/legal"
								className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
							>
								<ArrowLeftIcon className="mr-2 h-4 w-4" />
								Back to legal information
							</Link>
						</div>

						<LegalSummary slug={slug} />

						<article className="prose prose-lg dark:prose-invert max-w-none">
							<div className="prose prose-lg dark:prose-invert max-w-none">
								<Markdown options={getMarkdownOptions()}>
									{entry.content}
								</Markdown>
							</div>
						</article>
					</div>
				</main>
				<LegalFooter />
			</div>
		</>
	);
}

export async function generateStaticParams() {
	return allLegals.map((entry) => ({
		slug: entry.slug,
	}));
}

export async function generateMetadata({
	params,
}: LegalEntryPageProps): Promise<Metadata> {
	const { slug } = await params;

	const entry = allLegals.find((entry) => entry.slug === slug);

	if (!entry) {
		return {};
	}

	return {
		title: entry.title,
		description: entry.description ?? "Vichar legal post",
		alternates: { canonical: `/legal/${entry.slug}` },
		openGraph: {
			title: `${entry.title} | Vichar`,
			description: entry.description ?? "Vichar legal post",
			type: "website",
			url: `https://app.vichar.io/legal/${entry.slug}`,
		},
		twitter: {
			card: "summary_large_image",
			title: `${entry.title} | Vichar`,
			description: entry.description ?? "Vichar legal post",
		},
	};
}
