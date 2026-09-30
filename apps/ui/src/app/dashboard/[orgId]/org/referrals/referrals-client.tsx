"use client";

import { Copy, Gift, Check, AlertCircle, Mail } from "lucide-react";
import { useState, useEffect } from "react";

import { Button } from "@/lib/components/button";
import { SquircleCard } from "@/lib/components/squircle";
import { useDashboardContext } from "@/lib/dashboard-context";

interface Transaction {
	id: string;
	createdAt: string;
	type:
		| "credit_topup"
		| "subscription_start"
		| "subscription_cancel"
		| "subscription_end";
	creditAmount: string | null;
	amount: string | null;
	status: "pending" | "completed" | "failed";
	description: string | null;
}

interface ReferralsClientProps {
	transactions: Transaction[];
	referredCount: number;
}

export function ReferralsClient({
	transactions,
	referredCount,
}: ReferralsClientProps) {
	const { selectedOrganization } = useDashboardContext();
	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const [origin, setOrigin] = useState("https://app.vichar.io");

	useEffect(() => {
		setOrigin(window.location.origin);
	}, []);

	const totalTopUps = transactions
		.filter(
			(t) =>
				t.type === "credit_topup" && t.status === "completed" && t.creditAmount,
		)
		.reduce((sum, t) => sum + Number(t.creditAmount ?? 0), 0);

	const isEligible = totalTopUps >= 100;

	const rootLink = selectedOrganization
		? `${origin}/?ref=${selectedOrganization.id}`
		: "";

	const invitationLink = selectedOrganization
		? `${origin}/ref/${selectedOrganization.id}`
		: "";

	const referralEarnings = selectedOrganization
		? Number(selectedOrganization.referralEarnings).toFixed(8)
		: "0.00";

	const copyToClipboard = async (key: string, value: string) => {
		await navigator.clipboard.writeText(value);
		setCopiedKey(key);
		setTimeout(() => setCopiedKey(null), 2000);
	};

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5 p-4 pt-6 md:p-6">
				<div>
					<h1 className="text-xl font-medium tracking-tight">Referrals</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Earn credits by referring new users
					</p>
				</div>
				<div className="space-y-5">
					{!isEligible ? (
						<SquircleCard
							title="Not eligible yet"
							icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
							hideSeeAll
							panelClassName="space-y-4 p-4 sm:p-5"
						>
							<p className="text-sm text-muted-foreground">
								You need to top up at least $100 in credits to become eligible
								for the referral program
							</p>
							<div className="rounded-xl border border-border bg-card p-4">
								<div className="flex justify-between items-center">
									<span className="text-sm text-muted-foreground">
										Your total top-ups
									</span>
									<span className="font-semibold tabular-nums">
										${totalTopUps.toFixed(2)}
									</span>
								</div>
								<div className="mt-2 h-2 rounded-full bg-panel overflow-hidden">
									<div
										className="h-full bg-primary transition-all duration-300"
										style={{
											width: `${Math.min((totalTopUps / 100) * 100, 100)}%`,
										}}
									/>
								</div>
								<p className="mt-2 text-xs text-muted-foreground">
									${Math.max(0, 100 - totalTopUps).toFixed(2)} more to unlock
									referrals
								</p>
							</div>
							<p className="text-sm text-muted-foreground">
								Once eligible, you&apos;ll earn 1% of all LLM spending from
								users you refer. The credits are added directly to your account
								balance.
							</p>
						</SquircleCard>
					) : (
						<>
							<SquircleCard
								title="Your referral link"
								icon={<Gift className="h-4 w-4" />}
								hideSeeAll
								panelClassName="space-y-6 p-4 sm:p-5"
							>
								<p className="text-sm text-muted-foreground">
									Choose how you want to share your referral. Both options track
									your referral the same way.
								</p>
								<div className="space-y-2">
									<div className="flex items-baseline justify-between gap-2">
										<h4 className="text-sm font-medium">Direct link</h4>
										<span className="text-xs text-muted-foreground">
											Sends people to the homepage
										</span>
									</div>
									<div className="flex gap-2">
										<div className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono break-all">
											{rootLink}
										</div>
										<Button
											variant="outline"
											size="icon"
											onClick={() => copyToClipboard("root", rootLink)}
											className="shrink-0"
										>
											{copiedKey === "root" ? (
												<Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
											) : (
												<Copy className="h-4 w-4" />
											)}
										</Button>
									</div>
								</div>

								<div className="space-y-2">
									<div className="flex items-baseline justify-between gap-2">
										<h4 className="text-sm font-medium">Invitation page</h4>
										<span className="text-xs text-muted-foreground">
											Personalized landing page with your org&apos;s name
										</span>
									</div>
									<div className="flex gap-2">
										<div className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono break-all">
											{invitationLink}
										</div>
										<Button
											variant="outline"
											size="icon"
											onClick={() =>
												copyToClipboard("invitation", invitationLink)
											}
											className="shrink-0"
										>
											{copiedKey === "invitation" ? (
												<Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
											) : (
												<Copy className="h-4 w-4" />
											)}
										</Button>
									</div>
								</div>

								<div className="flex items-start gap-3 rounded-xl border border-brand/20 bg-brand-soft p-4">
									<Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
									<div className="space-y-1 text-sm">
										<p className="font-medium">
											Want to give referred users a top-up bonus?
										</p>
										<p className="text-muted-foreground">
											Contact us at{" "}
											<a
												href="mailto:contact@vichar.io"
												className="font-medium text-primary underline-offset-4 hover:underline"
											>
												contact@vichar.io
											</a>{" "}
											to enable a bonus on your invitation page, so referred
											users get up to 50% bonus credits on their first top-up.
										</p>
									</div>
								</div>
							</SquircleCard>

							<SquircleCard
								title="Your stats"
								hideSeeAll
								panelClassName="p-4 sm:p-5"
							>
								<div className="grid gap-3 md:grid-cols-2">
									<div className="rounded-xl border border-border bg-card p-4">
										<div className="text-sm text-muted-foreground">
											Users Referred
										</div>
										<div className="mt-1 text-2xl font-semibold tabular-nums">
											{referredCount}
										</div>
									</div>
									<div className="rounded-xl border border-border bg-card p-4">
										<div className="text-sm text-muted-foreground">
											Total Earnings
										</div>
										<div className="mt-1 text-2xl font-semibold tabular-nums">
											${referralEarnings}
										</div>
									</div>
								</div>
								<p className="mt-4 text-sm text-muted-foreground">
									Lifetime stats from your referral program
								</p>
							</SquircleCard>

							<SquircleCard
								title="How it works"
								hideSeeAll
								panelClassName="space-y-4 p-4 sm:p-5"
							>
								<div className="grid gap-3 md:grid-cols-3">
									<div className="rounded-xl border border-border bg-card p-4">
										<div className="text-xl font-semibold text-brand">1</div>
										<h4 className="mt-2 text-sm font-medium">
											Share Your Link
										</h4>
										<p className="mt-1 text-sm text-muted-foreground">
											Send your referral link to friends and colleagues
										</p>
									</div>
									<div className="rounded-xl border border-border bg-card p-4">
										<div className="text-xl font-semibold text-brand">2</div>
										<h4 className="mt-2 text-sm font-medium">They Sign Up</h4>
										<p className="mt-1 text-sm text-muted-foreground">
											When they create an account using your link
										</p>
									</div>
									<div className="rounded-xl border border-border bg-card p-4">
										<div className="text-xl font-semibold text-brand">3</div>
										<h4 className="mt-2 text-sm font-medium">Earn Credits</h4>
										<p className="mt-1 text-sm text-muted-foreground">
											Get 1% of their LLM spending as credits
										</p>
									</div>
								</div>
								<div className="rounded-xl border border-border bg-card p-4">
									<h4 className="text-sm font-medium">Important Notes</h4>
									<ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc list-inside">
										<li>
											Earnings are calculated after any discounts are applied
										</li>
										<li>Credits are added to your account automatically</li>
										<li>
											Referral credits can be used for LLM usage but cannot be
											paid out
										</li>
										<li>There is no limit to how many users you can refer</li>
									</ul>
								</div>
							</SquircleCard>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
