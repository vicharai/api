"use client";

import { differenceInCalendarDays, format, subDays } from "date-fns";
import { Activity, Key } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { CreateApiKeyDialog } from "@/components/api-keys/create-api-key-dialog";
import { GetStartedChecklist } from "@/components/dashboard/get-started";
import { Overview } from "@/components/dashboard/overview";
import {
	parseUsageComparisonMode,
	resolveUsageComparisonRange,
} from "@/components/dashboard/usage-comparison";
import { UsageComparisonPicker } from "@/components/dashboard/usage-comparison-picker";
import {
	DateRangePicker,
	getDateRangeFromParams,
} from "@/components/date-range-picker";
import {
	UsageModeSelector,
	useUsageMode,
} from "@/components/shared/usage-mode-selector";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import { Button } from "@/lib/components/button";
import {
	EmptyState,
	PageHeader,
	Section,
	StatCell,
	StatStrip,
} from "@/lib/components/page-layout";
import { Skeleton } from "@/lib/components/skeleton";
import { SquircleSurface } from "@/lib/components/squircle";
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
import type { Route } from "next";

interface DashboardClientProps {
	initialActivityData?: ActivitT;
	initialActivityRange?: { from: string; to: string };
	/** Zone the server fetched `initialActivityData` in, so the client can tell
	 *  whether it still matches the zone it now wants to render. */
	initialActivityTimeZone?: string;
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
	const totalDataStorageCost =
		activityData.reduce((sum, day) => sum + day.dataStorageCost, 0) ?? 0;
	const totalErrors =
		activityData.reduce((sum, day) => sum + day.errorCount, 0) ?? 0;
	const totalCached =
		activityData.reduce((sum, day) => sum + day.cacheCount, 0) ?? 0;

	const cacheHitRate =
		totalRequests > 0 ? (totalCached / totalRequests) * 100 : 0;
	// Data retention storage is billed on top of inference costs, so the
	// headline spend includes it.
	const totalSpend = totalCost + totalDataStorageCost;

	const hasApiKey =
		(apiKeysData?.apiKeys.filter((k) => k.status !== "deleted").length ?? 0) >
		0;

	// Top models across the range, ranked by spend.
	const topModels = (() => {
		const byModel = new Map<
			string,
			{
				provider: string;
				requests: number;
				tokens: number;
				cost: number;
			}
		>();
		for (const day of activityData) {
			for (const m of day.modelBreakdown) {
				const e = byModel.get(m.id) ?? {
					provider: m.provider,
					requests: 0,
					tokens: 0,
					cost: 0,
				};
				e.requests += m.requestCount;
				e.tokens += m.inputTokens + m.outputTokens;
				e.cost += m.cost;
				byModel.set(m.id, e);
			}
		}
		return Array.from(byModel.entries())
			.sort((a, b) => b[1].cost - a[1].cost)
			.slice(0, 6);
	})();

	const { data: recentLogsData } = api.useQuery(
		"get",
		"/logs",
		{
			params: {
				query: {
					projectId: selectedProject?.id ?? "",
					limit: "6",
					orderBy: "createdAt_desc",
				},
			},
		},
		{
			enabled: !!selectedProject?.id,
			refetchOnWindowFocus: false,
			staleTime: 60 * 1000,
		},
	);
	const recentLogs = (recentLogsData?.logs ?? []).filter(
		(l) => !l.retriedByLogId,
	);

	const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
	const credits = selectedOrganization
		? Number(selectedOrganization.credits ?? 0)
		: null;
	const neverRequested = !isLoading && totalRequests === 0;
	const activityHref = buildUrl("activity") as Route;

	if (!selectedOrganization) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-8 w-40" />
				<SquircleSurface className="grid grid-cols-2 lg:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="px-4 py-3.5">
							<Skeleton className="h-4 w-16" />
							<Skeleton className="mt-2 h-7 w-24" />
						</div>
					))}
				</SquircleSurface>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<PageHeader
				title="Overview"
				actions={
					<>
						<DateRangePicker buildUrl={buildUrl} />
						{selectedProject && (
							<CreateApiKeyDialog
								selectedProject={selectedProject}
								disabled={
									planLimits
										? planLimits.currentCount >= planLimits.maxKeys
										: false
								}
								disabledMessage={
									planLimits
										? `${planLimits.plan === "enterprise" ? "Enterprise" : "This"} plan allows maximum ${planLimits.maxKeys} API keys per workspace`
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
								>
									<Key className="mr-1.5 size-4" />
									Create API key
								</Button>
							</CreateApiKeyDialog>
						)}
					</>
				}
			/>

			{neverRequested && selectedProject && (
				<GetStartedChecklist
					selectedProject={selectedProject}
					selectedOrganization={selectedOrganization}
					hasApiKey={hasApiKey}
					isOrgAdmin={isOrgAdmin}
				/>
			)}

			<StatStrip>
				<StatCell
					label="Balance"
					value={credits !== null ? `$${credits.toFixed(2)}` : "—"}
					sub={
						isOrgAdmin ? (
							<Link
								href={
									`/dashboard/${selectedOrganization.id}/org/billing` as Route
								}
								className="text-brand hover:underline"
							>
								Add credits
							</Link>
						) : undefined
					}
				/>
				<StatCell
					label="Spend"
					value={`$${totalSpend.toFixed(2)}`}
					sub={`${format(from, "MMM d")} – ${format(to, "MMM d")}`}
					isLoading={isLoading}
				/>
				<StatCell
					label="Requests"
					value={formatNumber(totalRequests)}
					sub={
						totalCached > 0
							? `${cacheHitRate.toFixed(0)}% cache hit`
							: `${format(from, "MMM d")} – ${format(to, "MMM d")}`
					}
					isLoading={isLoading}
				/>
				<StatCell
					label="Error rate"
					value={`${errorRate.toFixed(1)}%`}
					sub={`${formatNumber(totalErrors)} errors`}
					isLoading={isLoading}
				/>
			</StatStrip>

			<SquircleSurface>
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
					<h2 className="text-sm font-medium">Usage</h2>
					<div className="flex shrink-0 flex-wrap items-center gap-2">
						<UsageModeSelector />
						<UsageComparisonPicker
							mode={comparisonMode}
							currentRange={{ from, to }}
							comparisonRange={comparisonRange}
							disabled={rangeDays > 366}
							onChange={updateComparisonInUrl}
						/>
					</div>
				</div>
				<div className="p-4">
					{!isLoading && totalRequests === 0 ? (
						<EmptyState
							icon={<Activity />}
							title="No usage in this range"
							hint="Daily spend and request volume appear here once traffic starts."
						/>
					) : (
						<Overview
							data={activityData}
							comparisonData={comparisonActivityData}
							comparisonRange={comparisonRange}
							comparisonMode={comparisonMode}
							isLoading={isLoading}
							isComparisonLoading={isComparisonLoading}
							isComparisonError={isComparisonError}
							metric="costs"
							costView="total"
						/>
					)}
				</div>
			</SquircleSurface>

			<div className="grid gap-8 lg:grid-cols-2">
				<Section title="Top models" description="Ranked by spend in range">
					{topModels.length === 0 ? (
						<EmptyState
							title="No usage yet"
							hint="Model spend shows up here after your first requests."
						/>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
									<th className="px-4 py-2.5">Model</th>
									<th className="px-4 py-2.5 text-right">Requests</th>
									<th className="hidden px-4 py-2.5 text-right sm:table-cell">
										Tokens
									</th>
									<th className="px-4 py-2.5 text-right">Cost</th>
								</tr>
							</thead>
							<tbody>
								{topModels.map(([id, m]) => (
									<tr key={id} className="border-b border-border last:border-0">
										<td className="px-4 py-2.5">
											<p className="truncate font-mono text-[12.5px]">{id}</p>
											<p className="text-xs text-muted-foreground">
												{m.provider}
											</p>
										</td>
										<td className="px-4 py-2.5 text-right tabular-nums">
											{formatNumber(m.requests)}
										</td>
										<td className="hidden px-4 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">
											{formatTokens(m.tokens)}
										</td>
										<td className="px-4 py-2.5 text-right tabular-nums">
											${m.cost.toFixed(4)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</Section>

				<Section
					title="Recent requests"
					action={
						<Link
							href={activityHref}
							className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
						>
							View all
						</Link>
					}
				>
					{recentLogs.length === 0 ? (
						<EmptyState
							title="No requests yet"
							hint="Calls to this project appear here."
						/>
					) : (
						<ul className="divide-y divide-border">
							{recentLogs.map((log) => (
								<li key={log.id}>
									<Link
										href={
											buildUrl(
												`activity/${log.id}` as Parameters<typeof buildUrl>[0],
											) as Route
										}
										className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
									>
										<span
											className={cn(
												"size-1.5 shrink-0 rounded-full",
												log.hasError ? "bg-destructive" : "bg-success",
											)}
										/>
										<span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
											{log.usedModel}
										</span>
										<span className="shrink-0 text-xs text-muted-foreground">
											{format(new Date(log.createdAt), "MMM d, HH:mm")}
										</span>
										<span className="w-16 shrink-0 text-right text-[13px] tabular-nums text-muted-foreground">
											{log.cost !== null
												? `$${Number(log.cost).toFixed(4)}`
												: "—"}
										</span>
									</Link>
								</li>
							))}
						</ul>
					)}
				</Section>
			</div>
		</div>
	);
}
