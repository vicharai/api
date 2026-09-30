"use client";

import { AlertCircle, CheckCircle, Clock, CreditCard } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useEffect, useRef } from "react";

import { Button } from "@/lib/components/button";
import { useDashboardState } from "@/lib/dashboard-state";
import { useApi } from "@/lib/fetch-client";

export function CreditsBalance() {
	const { selectedOrganization } = useDashboardState();
	const api = useApi();
	const posthog = usePostHog();
	const tracked = useRef(false);

	const { data: runwayData } = api.useQuery(
		"get",
		"/orgs/{id}/credits-runway",
		{ params: { path: { id: selectedOrganization?.id ?? "" } } },
		{ enabled: !!selectedOrganization?.id },
	);

	useEffect(() => {
		if (runwayData && !tracked.current) {
			tracked.current = true;
			const bucket =
				runwayData.runwayDays === null
					? "no_usage"
					: runwayData.runwayDays > 30
						? "30+"
						: runwayData.runwayDays > 14
							? "14+"
							: runwayData.runwayDays >= 3
								? "3-14"
								: "0-3";
			posthog.capture("runway_display_viewed", { runway_bucket: bucket });
		}
	}, [runwayData, posthog]);

	if (!selectedOrganization) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="flex items-center gap-2 text-muted-foreground">
					<CreditCard className="h-5 w-5" />
					<span>Loading credits...</span>
				</div>
			</div>
		);
	}

	const creditsBalance = Number(selectedOrganization.credits);
	const formattedBalance = creditsBalance.toFixed(2);

	const isLowCredits = creditsBalance < 1;
	const hasNoCredits = creditsBalance <= 0;

	const runwayDays = runwayData?.runwayDays ?? null;
	const avgDailySpend = runwayData?.avgDailySpend7d ?? 0;
	const hasUsage = avgDailySpend > 0;

	const runwayColor =
		runwayDays === null
			? "text-muted-foreground"
			: runwayDays > 14
				? "text-emerald-600 dark:text-emerald-400"
				: runwayDays >= 3
					? "text-amber-600 dark:text-amber-400"
					: "text-destructive";

	const runwayLabel = !hasUsage
		? "No recent usage"
		: runwayDays !== null && runwayDays > 30
			? "30+ days of credits remaining"
			: runwayDays !== null
				? `~${runwayDays} day${runwayDays !== 1 ? "s" : ""} of credits remaining at your current usage`
				: null;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between rounded-xl border border-border bg-card p-5">
				<div className="flex items-center gap-4">
					<div
						className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
							hasNoCredits
								? "border-destructive/30 bg-destructive/10 text-destructive"
								: isLowCredits
									? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
									: "border-brand-orange/30 bg-brand-orange/10 text-brand-orange"
						}`}
					>
						<CreditCard className="h-5 w-5" />
					</div>
					<div>
						<p className="text-sm text-muted-foreground font-medium">
							Available Balance
						</p>
						<p className="text-3xl font-medium tabular-nums tracking-tight">
							${formattedBalance}
						</p>
						{runwayLabel && (
							<div className={`flex items-center gap-1 mt-1 ${runwayColor}`}>
								<Clock className="h-3.5 w-3.5" />
								<p className="text-sm">{runwayLabel}</p>
							</div>
						)}
					</div>
				</div>
				{runwayDays !== null && runwayDays < 3 && hasUsage && (
					<Button size="sm" asChild>
						<a href="#top-up">Top up now</a>
					</Button>
				)}
			</div>

			{hasNoCredits && (
				<div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
					<AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
					<div>
						<p className="font-medium text-destructive">No credits remaining</p>
						<p className="text-sm text-muted-foreground mt-1">
							Your credit balance is empty. Top up now to continue using the
							service.
						</p>
					</div>
				</div>
			)}

			{isLowCredits && !hasNoCredits && (
				<div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
					<AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
					<div>
						<p className="font-medium text-amber-700 dark:text-amber-400">
							Low credits
						</p>
						<p className="text-sm text-muted-foreground mt-1">
							Your credit balance is running low. Consider topping up to avoid
							service interruption.
						</p>
					</div>
				</div>
			)}

			{!isLowCredits && !hasNoCredits && (
				<div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
					<CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
					<div>
						<p className="font-medium text-emerald-700 dark:text-emerald-400">
							Healthy balance
						</p>
						<p className="text-sm text-muted-foreground mt-1">
							Your credit balance is sufficient for continued service.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
