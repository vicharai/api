import { ArrowRight, Check, Gift, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { LegalFooter, LegalHeader } from "@/components/legal/legal-shell";
import { RefCookieSetter } from "@/components/ref-cookie-setter";
import { Badge } from "@/lib/components/badge";
import { Button } from "@/lib/components/button";
import { Card, CardContent } from "@/lib/components/card";
import { createServerApiClient } from "@/lib/server-api";

import type { Metadata } from "next";
import type { Route } from "next";

const fetchReferralInfo = cache(async (orgId: string) => {
	const $api = await createServerApiClient();
	const { data } = await $api.GET("/referral/{orgId}", {
		params: { path: { orgId } },
	});
	return data ?? null;
});

export async function generateMetadata({
	params,
}: {
	params: Promise<{ orgId: string }>;
}): Promise<Metadata> {
	const { orgId } = await params;
	const info = await fetchReferralInfo(orgId);

	if (!info) {
		return {
			title: "Join Vichar",
			robots: { index: false, follow: false },
		};
	}

	const title = `${info.name} invited you to join Vichar`;
	const description = info.referralBonusEnabled
		? `Sign up through ${info.name} and get a ${info.referralBonusPercent}% bonus on your first top-up.`
		: `Sign up through ${info.name} and get one API for models from leading AI labs.`;

	return {
		title,
		description,
		robots: { index: false, follow: false },
		openGraph: {
			title,
			description,
			type: "website",
			images: ["/opengraph.png?v=2"],
		},
		twitter: { card: "summary_large_image", title, description },
	};
}

const benefits = [
	"Access models from OpenAI, Anthropic, DeepSeek, Moonshot and more through one API",
	"Automatic failover keeps your requests flowing when a provider goes down",
	"Just a 5% platform fee, with one balance across every provider",
	"Prompt caching, smart routing, and request-level analytics",
];

export default async function ReferralLandingPage({
	params,
}: {
	params: Promise<{ orgId: string }>;
}) {
	const { orgId } = await params;
	const info = await fetchReferralInfo(orgId);

	if (!info) {
		notFound();
	}

	const hasBonus = info.referralBonusEnabled && info.referralBonusPercent > 0;

	// Include ?ref= so attribution still works if the cookie POST is blocked or
	// the user clicks before the RefCookieSetter effect runs; the signup page's
	// ReferralHandler picks the param up.
	const signupHref = `/signup?ref=${encodeURIComponent(info.id)}` as Route;

	return (
		<div className="min-h-screen bg-background text-foreground">
			<RefCookieSetter orgId={info.id} />
			<LegalHeader />

			<section className="border-b border-divider bg-app-canvas pt-14">
				<div className="container mx-auto px-4 py-16 md:py-24">
					<div className="mx-auto max-w-3xl space-y-8 text-center">
						<Badge
							variant="secondary"
							className="inline-flex items-center gap-2 rounded-full bg-google-blue-soft px-4 py-1.5 text-google-blue"
						>
							<Gift className="h-3.5 w-3.5" />
							<span className="text-sm font-medium">
								You&apos;ve been invited
							</span>
						</Badge>

						<h1 className="text-balance text-[36px] font-normal leading-[44px] text-heading sm:text-[45px] sm:leading-[52px]">
							<span className="text-brand">{info.name}</span> invited you to
							join Vichar
						</h1>

						<p className="text-pretty text-base text-muted-foreground sm:text-lg">
							One OpenAI-compatible API for leading AI models. Sign up to claim
							your invite.
						</p>

						{hasBonus && (
							<Card className="mx-auto max-w-xl">
								<CardContent className="flex items-center gap-4 p-6 text-left">
									<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-google-yellow-soft">
										<Sparkles className="h-6 w-6 text-google-yellow" />
									</div>
									<div>
										<p className="text-lg font-medium text-heading">
											Get a {info.referralBonusPercent}% bonus
										</p>
										<p className="text-sm text-muted-foreground">
											Sign up with this invite and we&apos;ll add{" "}
											{info.referralBonusPercent}% extra credits on your first
											top-up.
										</p>
									</div>
								</CardContent>
							</Card>
						)}

						<div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row">
							<Button size="lg" className="group h-12 px-8 text-base" asChild>
								<Link href={signupHref}>
									Accept invite
									<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
								</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>

			<section>
				<div className="container mx-auto px-4 py-16 md:py-24">
					<div className="mx-auto max-w-2xl space-y-6">
						<h2 className="text-center text-[28px] font-normal leading-9 text-heading">
							Why teams use Vichar
						</h2>
						<div className="space-y-4">
							{benefits.map((benefit) => (
								<div key={benefit} className="flex items-start gap-3">
									<div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft">
										<Check className="h-3 w-3 text-success" />
									</div>
									<span className="text-sm leading-relaxed text-muted-foreground">
										{benefit}
									</span>
								</div>
							))}
						</div>
						<div className="flex justify-center pt-4">
							<Button size="lg" className="group h-12 px-8 text-base" asChild>
								<Link href={signupHref}>
									Get started
									<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
								</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>

			<LegalFooter />
		</div>
	);
}
