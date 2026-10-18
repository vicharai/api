"use client";

import { AlertCircle, Clock, CreditCard } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useEffect, useRef } from "react";

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
				? "text-success"
				: runwayDays >= 3
					? "text-warning"
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
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<p className="mt-1 text-3xl font-medium tabular-nums tracking-tight">
						${formattedBalance}
					</p>
					{runwayLabel && (
						<div
							className={`mt-1 flex items-center gap-1 text-sm ${runwayColor}`}
						>
							<Clock className="h-3.5 w-3.5" />
							{runwayLabel}
						</div>
					)}
				</div>
				<div className="flex items-center gap-2">
					{runwayDays !== null && runwayDays < 3 && hasUsage && (
						<span className="text-xs text-destructive">
							Balance running low
						</span>
					)}
				</div>
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
				<div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft p-4">
					<AlertCircle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
					<div>
						<p className="font-medium text-warning">Low credits</p>
						<p className="text-sm text-muted-foreground mt-1">
							Your credit balance is running low. Consider topping up to avoid
							service interruption.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
