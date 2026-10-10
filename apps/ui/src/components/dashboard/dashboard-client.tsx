"use client";

import { addDays, differenceInCalendarDays, format, subDays } from "date-fns";
import {
	CreditCard,
	Zap,
	Key,
	CircleDollarSign,
	TrendingDown,
	ArrowDownToLine,
	ArrowUpFromLine,
	Server,
	Crown,
	MessageSquare,
	Wallet,
	Gift,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { CreateApiKeyDialog } from "@/components/api-keys/create-api-key-dialog";
import { TopUpCreditsButton } from "@/components/credits/top-up-credits-dialog";
import { CostBreakdownCard } from "@/components/dashboard/cost-breakdown-card";
import { ErrorsReliabilityCard } from "@/components/dashboard/errors-reliability-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Overview } from "@/components/dashboard/overview";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import {
	parseUsageComparisonMode,
	resolveUsageComparisonRange,
} from "@/components/dashboard/usage-comparison";
import { UsageComparisonPicker } from "@/components/dashboard/usage-comparison-picker";
import {
	DateRangePicker,
	getDateRangeFromParams,
} from "@/components/date-range-picker";
import { QuickStartSection } from "@/components/shared/quick-start-snippet";
import {
	UsageModeSelector,
	useUsageMode,
} from "@/components/shared/usage-mode-selector";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import { Button } from "@/lib/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/lib/components/card";
import { Skeleton } from "@/lib/components/skeleton";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { useApi } from "@/lib/fetch-client";
import { applyUsageModeToDaily } from "@/lib/usage-mode";
import { cn } from "@/lib/utils";

import { useDisplayTimeZone } from "@llmgateway/shared";
import {
	formatCompactNumber as formatTokens,
	formatNumber,
} from "@llmgateway/shared/number-format";
import { isOrganizationAdmin } from "@llmgateway/shared/organization-roles";

import type {
	UsageComparisonMode,
	UsageDateRange,
} from "@/components/dashboard/usage-comparison";
import type { ActivitT } from "@/types/activity";

interface DashboardClientProps {
	initialActivityData?: ActivitT;
	initialActivityRange?: { from: string; to: string };
	/** Zone the server fetched `initialActivityData` in, so the client can tell
	 *  whether it still matches the zone it now wants to render. */
	initialActivityTimeZone?: string;
}

function formatCredits(credits: number) {
	return credits.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: credits !== 0 && Math.abs(credits) < 1 ? 4 : 2,
	});
}

function pctChange(current: number, previous: number): number | null {
	if (previous <= 0) {
		return null;
	}
	return ((current - previous) / previous) * 100;
}

function StatCell({
	icon: Icon,
	label,
	value,
	sub,
	isLoading,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: string;
	sub?: string;
	isLoading?: boolean;
}) {
	return (
		<div className="min-w-0 lg:px-6 lg:first:pl-0 lg:last:pr-0">
			<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
				<Icon className="h-3.5 w-3.5" />
				<span className="truncate">{label}</span>
			</div>
			{isLoading ? (
				<Skeleton className="mt-2 h-6 w-20" />
			) : (
				<p className="mt-1.5 truncate text-lg font-medium tabular-nums tracking-tight">
					{value}
				</p>
			)}
			{isLoading ? (
				<Skeleton className="mt-1.5 h-3 w-24" />
			) : sub ? (
				<p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
			) : null}
		</div>
	);
}

export function DashboardClient({
	initialActivityData,
	initialActivityRange,
	initialActivityTimeZone,
}: DashboardClientProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { buildUrl } = useDashboardNavigation();

	// Get date range from URL params
	const { timeZone: displayTimeZone } = useDisplayTimeZone();
	const { from, to } = getDateRangeFromParams(searchParams, displayTimeZone);
	const fromStr = format(from, "yyyy-MM-dd");
	const toStr = format(to, "yyyy-MM-dd");

	const rangeDays = differenceInCalendarDays(to, from) + 1;
	const prevFrom = subDays(from, rangeDays);
	const prevTo = subDays(from, 1);

	// Get metric type from URL params, default to "costs"
	const metricParam = searchParams.get("metric");
	const metric = (metricParam === "requests" ? "requests" : "costs") as
		"costs" | "requests";
	const costView =
		searchParams.get("costView") === "breakdown" ? "breakdown" : "total";
	const requestedComparisonMode = parseUsageComparisonMode(
		searchParams.get("compare"),
	);
	const comparisonMode = rangeDays <= 366 ? requestedComparisonMode : "off";
	const comparisonRange = resolveUsageComparisonRange(
		comparisonMode,
		{ from, to },
		searchParams,
	);

	// If no from/to params exist, add them to the URL immediately
	useEffect(() => {
		if (!searchParams.get("from") || !searchParams.get("to")) {
			const params = new URLSearchParams(searchParams.toString());
			params.delete("days");
			const today = new Date();
			params.set("from", format(subDays(today, 6), "yyyy-MM-dd"));
			params.set("to", format(today, "yyyy-MM-dd"));
			router.replace(`${buildUrl()}?${params.toString()}`);
		}
	}, [searchParams, router, buildUrl]);

	const { selectedOrganization, selectedProject } = useDashboardNavigation();
	const isOrgAdmin = isOrganizationAdmin(selectedOrganization?.role);
	const api = useApi();

	const { data, isLoading } = api.useQuery(
		"get",
		"/activity",
		{
			params: {
				query: {
					from: fromStr,
					to: toStr,
					timezone: displayTimeZone,
					...(selectedProject?.id ? { projectId: selectedProject.id } : {}),
				},
			},
		},
		{
			enabled: !!selectedProject?.id,
			// Reuse the server payload for the matching range and time zone,
			// including the default range before dates are added to the URL.
			initialData:
				initialActivityRange?.from === fromStr &&
				initialActivityRange.to === toStr &&
				initialActivityTimeZone === displayTimeZone
					? initialActivityData
					: undefined,
			refetchOnWindowFocus: false,
			staleTime: 1000 * 60 * 5, // 5 minutes
		},
	);

	// Previous period of the same length, used for trend deltas on the KPI
	// cards. Skipped for very long ranges (e.g. "All time") where a
	// comparison window is meaningless.
	const { data: prevData } = api.useQuery(
		"get",
		"/activity",
		{
			params: {
				query: {
					from: format(prevFrom, "yyyy-MM-dd"),
					to: format(prevTo, "yyyy-MM-dd"),
					timezone: displayTimeZone,
					...(selectedProject?.id ? { projectId: selectedProject.id } : {}),
				},
			},
		},
		{
			enabled: !!selectedProject?.id && rangeDays <= 366,
			refetchOnWindowFocus: false,
			staleTime: 1000 * 60 * 5, // 5 minutes
		},
	);

	const {
		data: comparisonData,
		isLoading: isComparisonLoading,
		isError: isComparisonError,
	} = api.useQuery(
		"get",
		"/activity",
		{
			params: {
				query: {
					from: comparisonRange
						? format(comparisonRange.from, "yyyy-MM-dd")
						: fromStr,
					to: comparisonRange
						? format(comparisonRange.to, "yyyy-MM-dd")
						: toStr,
					timezone: displayTimeZone,
					...(selectedProject?.id ? { projectId: selectedProject.id } : {}),
				},
			},
		},
		{
			enabled: !!selectedProject?.id && comparisonRange !== null,
			refetchOnWindowFocus: false,
			staleTime: 1000 * 60 * 5,
		},
	);

	// Get API keys data to check plan limits
	const { data: apiKeysData } = api.useQuery(
		"get",
		"/keys/api",
		{
			params: {
				query: { projectId: selectedProject?.id ?? "" },
			},
		},
		{
			enabled: !!selectedProject?.id,
			staleTime: 5 * 60 * 1000, // 5 minutes
			refetchOnWindowFocus: false,
		},
	);

	const planLimits = apiKeysData?.planLimits;

	// Function to update URL with new metric parameter
	const updateMetricInUrl = (newMetric: "costs" | "requests") => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("metric", newMetric);
		router.push(`${buildUrl()}?${params.toString()}`, { scroll: false });
	};

	const updateCostViewInUrl = (newView: "total" | "breakdown") => {
		const params = new URLSearchParams(searchParams.toString());
		if (newView === "total") {
			params.delete("costView");
		} else {
			params.set("costView", newView);
		}
		router.push(`${buildUrl()}?${params.toString()}`, { scroll: false });
	};

	const updateComparisonInUrl = (
		newMode: UsageComparisonMode,
		selectedRange?: UsageDateRange,
	) => {
		const params = new URLSearchParams(searchParams.toString());
		if (newMode === "off") {
			params.delete("compare");
			params.delete("compareFrom");
			params.delete("compareTo");
		} else {
			params.set("compare", newMode);
			if (newMode === "custom" && selectedRange) {
				params.set("compareFrom", format(selectedRange.from, "yyyy-MM-dd"));
				params.set("compareTo", format(selectedRange.to, "yyyy-MM-dd"));
			} else if (
				(newMode === "previous-week" || newMode === "previous-month") &&
				selectedRange
			) {
				params.set("compareFrom", format(selectedRange.from, "yyyy-MM-dd"));
				params.delete("compareTo");
			} else {
				params.delete("compareFrom");
				params.delete("compareTo");
			}
		}
		router.push(`${buildUrl()}?${params.toString()}`, { scroll: false });
	};

	// Mode-normalized rows: cost/requestCount reflect the selected billing view
	// (credits vs BYOK); token, error and cache measures stay blended.
	const usageMode = useUsageMode();
	const rawActivityData = data?.activity ?? [];
	const activityData = rawActivityData.map((day) =>
		applyUsageModeToDaily(day, usageMode),
	);
	const prevActivityData = (prevData?.activity ?? []).map((day) =>
		applyUsageModeToDaily(day, usageMode),
	);
	const comparisonActivityData = comparisonData?.activity.map((day) =>
		applyUsageModeToDaily(day, usageMode),
	);

	const totalRequests =
		activityData.reduce((sum, day) => sum + day.requestCount, 0) ?? 0;

	// Track when user reaches 50+ calls for invite banner eligibility
	useEffect(() => {
		if (totalRequests >= 50) {
			localStorage.setItem("user_has_50_plus_calls", "true");
		}
	}, [totalRequests]);
	const totalCost = activityData.reduce((sum, day) => sum + day.cost, 0) ?? 0;
	const totalInputCost =
		activityData.reduce((sum, day) => sum + day.inputCost, 0) ?? 0;
	const totalOutputCost =
		activityData.reduce((sum, day) => sum + day.outputCost, 0) ?? 0;
	const totalDataStorageCost =
		activityData.reduce((sum, day) => sum + day.dataStorageCost, 0) ?? 0;
	const totalRequestCost =
		activityData.reduce((sum, day) => sum + day.requestCost, 0) ?? 0;
	const totalSavings =
		activityData.reduce((sum, day) => sum + day.discountSavings, 0) ?? 0;
	const totalInputTokens =
		activityData.reduce((sum, day) => sum + day.inputTokens, 0) ?? 0;
	const totalOutputTokens =
		activityData.reduce((sum, day) => sum + day.outputTokens, 0) ?? 0;
	const totalCachedTokens =
		activityData.reduce((sum, day) => sum + day.cachedTokens, 0) ?? 0;
	const totalCachedInputCost =
		activityData.reduce((sum, day) => sum + day.cachedInputCost, 0) ?? 0;
	const totalErrors =
		activityData.reduce((sum, day) => sum + day.errorCount, 0) ?? 0;
	const totalCached =
		activityData.reduce((sum, day) => sum + day.cacheCount, 0) ?? 0;

	const prevRequests = prevActivityData.reduce(
		(sum, day) => sum + day.requestCount,
		0,
	);
	const prevCost = prevActivityData.reduce(
		(sum, day) => sum + day.cost + day.dataStorageCost,
		0,
	);
	const prevSavings = prevActivityData.reduce(
		(sum, day) => sum + day.discountSavings,
		0,
	);

	const cacheHitRate =
		totalRequests > 0 ? (totalCached / totalRequests) * 100 : 0;
	// Data retention storage is billed on top of inference costs, so the
	// headline spend includes it.
	const totalSpend = totalCost + totalDataStorageCost;
	const avgCostPerRequest = totalRequests > 0 ? totalSpend / totalRequests : 0;

	// Day-by-day series for the KPI sparklines, with missing days filled as 0.
	const { requestsTrend, costTrend } = (() => {
		if (rangeDays > 400) {
			const sorted = [...activityData].sort((a, b) =>
				a.date < b.date ? -1 : 1,
			);
			return {
				requestsTrend: sorted.map((day) => day.requestCount),
				costTrend: sorted.map((day) => day.cost + day.dataStorageCost),
			};
		}
		const byDate = new Map(activityData.map((day) => [day.date, day]));
		const requests: number[] = [];
		const costs: number[] = [];
		for (let i = 0; i < rangeDays; i++) {
			const day = byDate.get(format(addDays(from, i), "yyyy-MM-dd"));
			requests.push(day?.requestCount ?? 0);
			costs.push(day ? day.cost + day.dataStorageCost : 0);
		}
		return { requestsTrend: requests, costTrend: costs };
	})();

	const { mostUsedModel, mostUsedProvider } = (() => {
		const modelCostMap = new Map<string, { cost: number; provider: string }>();
		for (const day of activityData) {
			for (const m of day.modelBreakdown) {
				const existing = modelCostMap.get(m.id);
				if (existing) {
					existing.cost += m.cost;
				} else {
					modelCostMap.set(m.id, { cost: m.cost, provider: m.provider });
				}
			}
		}
		let topModel = "";
		let topProvider = "";
		let topCost = 0;
		for (const [model, { cost, provider }] of Array.from(modelCostMap)) {
			if (cost > topCost) {
				topCost = cost;
				topModel = model;
				topProvider = provider;
			}
		}
		return { mostUsedModel: topModel, mostUsedProvider: topProvider };
	})();

	const showPlanAllowance =
		isOrgAdmin &&
		selectedOrganization &&
		selectedOrganization.devPlan !== "none";
	const kpiCount = (isOrgAdmin ? 1 : 0) + (showPlanAllowance ? 1 : 0) + 3;

	const isInitialLoading = !selectedOrganization;

	if (isInitialLoading) {
		return (
			<div className="flex flex-col">
				<div className="flex-1 space-y-6">
					<div className="flex flex-col md:flex-row items-center justify-between space-y-2">
						<div>
							<h1 className="text-xl font-medium tracking-tight">Dashboard</h1>
							<div className="h-4 w-48 bg-muted animate-pulse rounded mt-1.5" />
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
						{Array.from({ length: 4 }).map((_, i) => (
							<SquircleSurface
								key={i}
								className="border border-border p-1 shadow-sm"
							>
								<div className="pb-1.5 pl-3.5 pr-3 pt-1">
									<div className="h-4 w-24 bg-muted animate-pulse rounded" />
								</div>
								<SquirclePanel className="px-4 py-3">
									<div className="h-7 w-20 bg-muted animate-pulse rounded mb-2 sm:h-8" />
									<div className="h-3 w-16 bg-muted animate-pulse rounded" />
								</SquirclePanel>
							</SquircleSurface>
						))}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<h1 className="text-xl font-medium tracking-tight">Dashboard</h1>
					</div>
					<div className="flex items-center gap-2">
						{selectedOrganization && selectedProject && (
							<>
								<CreateApiKeyDialog
									selectedProject={selectedProject}
									disabled={
										planLimits
											? planLimits.currentCount >= planLimits.maxKeys
											: false
									}
									disabledMessage={
										planLimits
											? `${planLimits.plan === "enterprise" ? "Enterprise" : planLimits.plan === "pro" ? "Pro" : "Free"} plan allows maximum ${planLimits.maxKeys} API keys per workspace`
											: undefined
									}
								>
									<Button
										disabled={
											!selectedProject ||
											(planLimits
												? planLimits.currentCount >= planLimits.maxKeys
												: false)
										}
										className="flex items-center"
									>
										<Key className="mr-2 h-4 w-4" />
										Create API Key
									</Button>
								</CreateApiKeyDialog>
							</>
						)}
						{isOrgAdmin && !selectedProject && <TopUpCreditsButton />}
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<DateRangePicker buildUrl={buildUrl} />
					<UsageModeSelector />
					{rangeDays <= 366 && (
						<p className="text-xs text-muted-foreground">
							Trends compare to {format(prevFrom, "MMM d")} –{" "}
							{format(prevTo, "MMM d")}
						</p>
					)}
				</div>

				<div className="stagger-rise space-y-4">
					<div
						className={cn(
							"stagger-rise grid grid-cols-2 gap-3",
							kpiCount >= 5
								? "lg:grid-cols-5"
								: kpiCount === 4
									? "lg:grid-cols-4"
									: "lg:grid-cols-3",
						)}
					>
						{isOrgAdmin && (
							<MetricCard
								label="Workspace Credits"
								value={`$${
									selectedOrganization
										? formatCredits(Number(selectedOrganization.credits))
										: "0.00"
								}`}
								subtitle="Available balance"
								icon={<CreditCard className="h-4 w-4" />}
								accent="orange"
							/>
						)}
						{showPlanAllowance && selectedOrganization && (
							<MetricCard
								label="Plan Allowance"
								value={`$${formatCredits(
									Math.max(
										0,
										Number(selectedOrganization.devPlanCreditsLimit) -
											Number(selectedOrganization.devPlanCreditsUsed) -
											Number(selectedOrganization.reservedCredits ?? 0),
									),
								)}`}
								subtitle={`remaining of $${formatCredits(
									Number(selectedOrganization.devPlanCreditsLimit),
								)} this cycle`}
								icon={<Zap className="h-4 w-4" />}
								accent="magenta"
							/>
						)}
						{isOrgAdmin &&
							selectedOrganization &&
							selectedOrganization.devPlan !== "none" && (
								<MetricCard
									label="Plan Allowance"
									value={`$${formatCredits(
										Math.max(
											0,
											Number(selectedOrganization.devPlanCreditsLimit) -
												Number(selectedOrganization.devPlanCreditsUsed) -
												Number(selectedOrganization.reservedCredits ?? 0),
										),
									)}`}
									subtitle={`remaining of $${formatCredits(
										Number(selectedOrganization.devPlanCreditsLimit),
									)} this cycle`}
									icon={<Zap className="h-4 w-4" />}
									accent="green"
								/>
							)}
						<MetricCard
							label="Total Requests"
							value={formatNumber(totalRequests)}
							subtitle={
								totalRequests > 0
									? `${cacheHitRate.toFixed(1)}% cache hit rate • ${formatNumber(totalErrors)} errors`
									: `${format(from, "MMM d")} – ${format(to, "MMM d")}`
							}
							icon={<Zap className="h-4 w-4" />}
							accent="purple"
							delta={pctChange(totalRequests, prevRequests)}
							trend={requestsTrend}
							isLoading={isLoading}
						/>
						<MetricCard
							label={usageMode === "credits" ? "Credits Spend" : "Total Spend"}
							value={`$${totalSpend.toFixed(2)}`}
							subtitle={
								totalRequests > 0
									? `avg $${avgCostPerRequest.toFixed(4)} per request${
											totalRequestCost > 0
												? ` • $${totalRequestCost.toFixed(2)} requests`
												: ""
										}${
											totalDataStorageCost > 0
												? ` • $${totalDataStorageCost.toFixed(4)} storage`
												: ""
										}`
									: `${format(from, "MMM d")} – ${format(to, "MMM d")}`
							}
							icon={<CircleDollarSign className="h-4 w-4" />}
							accent="brand"
							delta={pctChange(totalSpend, prevCost)}
							trend={costTrend}
							isLoading={isLoading}
						/>
						<MetricCard
							label="Total Savings"
							value={`$${totalSavings.toFixed(2)}`}
							subtitle="Discounts this period"
							icon={<TrendingDown className="h-4 w-4" />}
							accent="green"
							delta={pctChange(totalSavings, prevSavings)}
							isLoading={isLoading}
						/>
					</div>

					<SquirclePanel className="grid grid-cols-2 gap-x-4 gap-y-5 border border-border bg-card px-5 py-4 shadow-xs lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-border lg:py-4">
						<StatCell
							icon={ArrowDownToLine}
							label="Input tokens"
							value={formatTokens(totalInputTokens)}
							sub={`$${totalInputCost.toFixed(2)} spend`}
							isLoading={isLoading}
						/>
						<StatCell
							icon={ArrowUpFromLine}
							label="Output tokens"
							value={formatTokens(totalOutputTokens)}
							sub={`$${totalOutputCost.toFixed(2)} spend`}
							isLoading={isLoading}
						/>
						<StatCell
							icon={Server}
							label="Cached tokens"
							value={formatTokens(totalCachedTokens)}
							sub={`$${totalCachedInputCost.toFixed(2)} • included in input`}
							isLoading={isLoading}
						/>
						<StatCell
							icon={Crown}
							label="Top model"
							value={mostUsedModel || "—"}
							sub={
								mostUsedProvider ? `via ${mostUsedProvider}` : "No usage yet"
							}
							isLoading={isLoading}
						/>
					</SquirclePanel>

					{!isLoading && totalRequests < 5 ? (
						<div>
							{(() => {
								const credits = selectedOrganization
									? Number(selectedOrganization.credits)
									: 0;
								// Cohort-safe: only treat this as onboarding for orgs created
								// recently. An org with 0 credits and 0 recent requests may be
								// a returning user that has since run out — the date-windowed
								// totalRequests alone cannot distinguish them from a brand-new
								// org. Using createdAt avoids showing onboarding copy to
								// returning users.
								const createdAtMs = selectedOrganization?.createdAt
									? new Date(selectedOrganization.createdAt).getTime()
									: null;
								const isNewOrganization =
									createdAtMs !== null &&
									Date.now() - createdAtMs < 7 * 24 * 60 * 60 * 1000;
								const needsTopUp =
									isOrgAdmin &&
									!Number.isNaN(credits) &&
									credits <= 0 &&
									totalRequests === 0 &&
									isNewOrganization;

								if (needsTopUp) {
									return (
										<Card className="min-w-0 border-primary/25 bg-gradient-to-br from-brand-softer via-transparent to-transparent">
											<CardHeader>
												<div className="flex items-center gap-2">
													<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
														<Wallet className="h-4 w-4" />
													</div>
													<div>
														<CardTitle>
															Top up to start making requests
														</CardTitle>
														<CardDescription className="mt-1">
															Add credits to your workspace to unlock all paid
															models. Free models are always available.
														</CardDescription>
													</div>
												</div>
											</CardHeader>
											<CardContent className="space-y-4">
												<div className="grid gap-3 sm:grid-cols-3">
													<div className="rounded-xl bg-panel p-3">
														<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
															<Zap className="h-3.5 w-3.5" />
															Pay as you go
														</div>
														<p className="mt-1 text-sm">
															Credits never expire. Only pay for what you use.
														</p>
													</div>
													<div className="rounded-xl bg-panel p-3">
														<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
															<Gift className="h-3.5 w-3.5" />
															Free models
														</div>
														<p className="mt-1 text-sm">
															Try{" "}
															<Link
																href={`/dashboard/${selectedOrganization?.id}/org/models`}
																className="underline hover:text-foreground"
																prefetch={true}
															>
																free models
															</Link>{" "}
															without topping up.
														</p>
													</div>
													<div className="rounded-xl bg-panel p-3">
														<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
															<CreditCard className="h-3.5 w-3.5" />
															Secure checkout
														</div>
														<p className="mt-1 text-sm">
															Secure billing by Dodo Payments. Cancel or refund
															anytime.
														</p>
													</div>
												</div>
												<div className="flex flex-wrap gap-2">
													{isOrgAdmin && <TopUpCreditsButton />}
												</div>
											</CardContent>
										</Card>
									);
								}

								return (
									<Card className="min-w-0">
										<CardHeader>
											<CardTitle>Get Started</CardTitle>
											<CardDescription>
												{totalRequests > 0
													? `You made ${totalRequests === 1 ? "your first call" : `${totalRequests} calls`} during setup! Now integrate Vichar in your own code.`
													: "Integrate Vichar in 1 line — just change your base URL."}
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											<QuickStartSection />
											<div className="flex flex-wrap gap-2">
												<Button asChild variant="outline" size="sm">
													<Link
														href={`/dashboard/${selectedOrganization?.id}/org/models`}
														prefetch={true}
													>
														<MessageSquare className="mr-2 h-4 w-4" />
														Models
													</Link>
												</Button>
											</div>
										</CardContent>
									</Card>
								);
							})()}
						</div>
					) : (
						<div>
							<SquircleSurface className="min-w-0 border border-border p-1 shadow-sm">
								<div className="flex flex-wrap items-start justify-between gap-3 pb-2 pl-3.5 pr-2 pt-1.5">
									<div className="ml-1 min-w-0">
										<h2 className="text-sm font-medium text-foreground/80">
											Usage overview
										</h2>
										<p className="mt-0.5 text-xs text-muted-foreground">
											{metric === "costs"
												? costView === "total"
													? "Daily total inference spend (provider list price)"
													: "Daily inference spend by token type"
												: "Daily request volume"}
										</p>
									</div>
									<div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
										<div className="inline-flex items-center whitespace-nowrap rounded-lg border border-border bg-panel p-0.5">
											{(["costs", "requests"] as const).map((option) => (
												<button
													key={option}
													type="button"
													onClick={() => updateMetricInUrl(option)}
													className={cn(
														"rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
														metric === option
															? "bg-card text-foreground shadow-xs"
															: "text-muted-foreground hover:text-foreground",
													)}
												>
													{option}
												</button>
											))}
										</div>
										{metric === "costs" && (
											<div className="inline-flex items-center whitespace-nowrap rounded-lg border border-border bg-panel p-0.5">
												{(["total", "breakdown"] as const).map((option) => (
													<button
														key={option}
														type="button"
														onClick={() => updateCostViewInUrl(option)}
														className={cn(
															"rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
															costView === option
																? "bg-card text-foreground shadow-xs"
																: "text-muted-foreground hover:text-foreground",
														)}
													>
														{option}
													</button>
												))}
											</div>
										)}
										<UsageComparisonPicker
											mode={comparisonMode}
											currentRange={{ from, to }}
											comparisonRange={comparisonRange}
											disabled={rangeDays > 366}
											onChange={updateComparisonInUrl}
										/>
									</div>
								</div>
								<SquirclePanel className="overflow-hidden pt-3">
									<Overview
										data={activityData}
										comparisonData={comparisonActivityData}
										comparisonRange={comparisonRange}
										comparisonMode={comparisonMode}
										isLoading={isLoading}
										isComparisonLoading={isComparisonLoading}
										isComparisonError={isComparisonError}
										metric={metric}
										costView={costView}
									/>
								</SquirclePanel>
							</SquircleSurface>
						</div>
					)}

					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
						<div className="min-w-0 lg:col-span-4 space-y-4">
							<CostBreakdownCard initialActivityData={initialActivityData} />
							<RecentActivityCard
								activityData={activityData}
								isLoading={isLoading}
							/>
						</div>
						<div className="min-w-0 lg:col-span-3">
							<ErrorsReliabilityCard
								activityData={activityData}
								isLoading={isLoading}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
