import { site } from "@/lib/site";

import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "About",
	description:
		"Vichar is one OpenAI-compatible API for models from many providers, built for developers who don't want to manage many provider accounts.",
	alternates: { canonical: "/about/" },
};

export default function AboutPage() {
	return (
		<main className="mx-auto max-w-[720px] px-5 py-16 sm:px-8 sm:py-24">
			<h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
				About
			</h1>
			<div className="mt-8 space-y-5 text-[15px] leading-relaxed text-muted-foreground">
				<p>
					Vichar is a single API for models from many providers. It exists for
					developers who don't want to manage a separate account, key and
					billing relationship for every lab they use.
				</p>
				<p>
					One key and one OpenAI-compatible endpoint reach the whole catalogue.
					When a provider slows down or fails, requests reroute to another
					healthy one, so your application keeps answering.
				</p>
				<p>What we care about:</p>
				<ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground/60">
					<li>Transparent per-token billing at the listed model rate.</li>
					<li>Reliability through automatic failover across providers.</li>
					<li>
						Privacy by default: we store request metadata (tokens, cost,
						latency, provider), not your prompts or responses.
					</li>
				</ul>
				{/* TODO: add company details (entity name, address) once confirmed. */}
				<p>
					Questions or partnership ideas?{" "}
					<a
						href={`mailto:${site.emails.sales}`}
						className="text-brand hover:underline"
					>
						{site.emails.sales}
					</a>
					.
				</p>
			</div>
		</main>
	);
}
