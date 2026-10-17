"use client";

import {
	differenceInCalendarDays,
	format,
	formatDistanceToNowStrict,
	subDays,
} from "date-fns";
import {
	Activity,
	ArrowRight,
	ArrowUpRight,
	Boxes,
	CircleDollarSign,
	Key,
	ShieldCheck,
	Wallet,
	Zap,
} from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CreateApiKeyDialog } from "@/components/api-keys/create-api-key-dialog";
import { GetStartedChecklist } from "@/components/dashboard/get-started";
import { MetricCard } from "@/components/dashboard/metric-card";
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
import { useUser } from "@/hooks/useUser";
import { Button } from "@/lib/components/button";
import { EmptyState, Section } from "@/lib/components/page-layout";
import { Skeleton } from "@/lib/components/skeleton";
import { SquircleSurface } from "@/lib/components/squircle";
import { useApi } from "@/lib/fetch-client";
import { providerLabel } from "@/lib/provider-label";
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

const sectionVariants = {
	hidden: { opacity: 0, y: 6 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.25, ease: "easeOut" },
	},
} as const;

const theadRow =
	"border-b border-border text-left text-xs text-muted-foreground";

function greetingFor(date: Date): string {
	const hour = date.getHours();
	if (hour < 12) {
		return "Good morning";
	}
	if (hour < 18) {
		return "Good afternoon";
	}
	return "Good evening";
}

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
	const { user } = useUser();
	// Resolved after mount so the server render and hydration agree.
	const [greeting, setGreeting] = useState("Welcome back");
	useEffect(() => {
		setGreeting(greetingFor(new Date()));
	}, []);

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
	const hasRequests =
		(!isLoading && totalRequests > 0) || recentLogs.length > 0;
	const allStarted = hasApiKey && hasRequests && (credits ?? 0) > 0;
	const activityHref = buildUrl("activity") as Route;

	const comparisonTotals = (() => {
		if (!comparisonRange || !comparisonActivityData) {
			return null;
		}
		let requests = 0;
		let spend = 0;
		let errors = 0;
		for (const day of comparisonActivityData) {
			requests += day.requestCount;
			spend += day.cost + day.dataStorageCost;
			errors += day.errorCount;
		}
		return {
			requests,
			spend,
			errorRate: requests > 0 ? (errors / requests) * 100 : 0,
		};
	})();
	const pctChange = (current: number, previous: number | undefined) =>
		previous === undefined || previous === 0
			? null
			: ((current - previous) / previous) * 100;
	const sortedDays = [...activityData].sort((a, b) =>
		a.date < b.date ? -1 : 1,
	);
	const spendTrend = sortedDays.map((d) => d.cost + d.dataStorageCost);
	const requestTrend = sortedDays.map((d) => d.requestCount);
	const errorTrend = sortedDays.map((d) =>
		d.requestCount > 0 ? (d.errorCount / d.requestCount) * 100 : 0,
	);
	const rangeLabel = `${format(from, "MMM d")} – ${format(to, "MMM d")}`;
	const topModelMaxCost = topModels[0]?.[1].cost ?? 0;
	const firstName = user?.name?.split(" ")[0];

	if (!selectedOrganization) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-14 w-full rounded-lg" />
				<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<SquircleSurface key={i} className="p-4">
							<Skeleton className="h-8 w-8 rounded-lg" />
							<Skeleton className="mt-4 h-7 w-24" />
							<Skeleton className="mt-2 h-3 w-16" />
						</SquircleSurface>
					))}
				</div>
			</div>
		);
	}

	return (
		<MotionConfig reducedMotion="user">
			<motion.div
				className="space-y-6 sm:space-y-8"
				initial="hidden"
				animate="show"
				variants={{ show: { transition: { staggerChildren: 0.04 } } }}
			>
				<motion.section variants={sectionVariants}>
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="min-w-0">
							<h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-heading sm:text-2xl">
								{greeting}
								{firstName ? `, ${firstName}` : null}
							</h1>
							<p className="mt-1 truncate text-sm text-muted-foreground">
								{selectedProject?.name ?? selectedOrganization.name} ·{" "}
								{rangeLabel}
							</p>
						</div>
						<div className="flex shrink-0 flex-wrap items-center gap-2">
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
						</div>
					</div>
				</motion.section>

				{!allStarted && selectedProject && (
					<motion.div variants={sectionVariants}>
						<GetStartedChecklist
							selectedProject={selectedProject}
							selectedOrganization={selectedOrganization}
							hasApiKey={hasApiKey}
							hasRequests={hasRequests}
							isOrgAdmin={isOrgAdmin}
						/>
					</motion.div>
				)}

				<motion.div
					className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4"
					variants={{ show: { transition: { staggerChildren: 0.04 } } }}
				>
					<MetricCard
						label="Balance"
						icon={<Wallet />}
						value={credits !== null ? `$${credits.toFixed(2)}` : "—"}
						subtitle={
							isOrgAdmin ? (
								<Link
									href={
										`/dashboard/${selectedOrganization.id}/org/billing` as Route
									}
									className="inline-flex items-center gap-0.5 font-medium text-brand hover:underline"
								>
									Add credits
									<ArrowUpRight className="size-3" />
								</Link>
							) : (
								"Prepaid workspace credits"
							)
						}
					/>
					<MetricCard
						label="Spend"
						icon={<CircleDollarSign />}
						value={`$${totalSpend.toFixed(2)}`}
						subtitle={rangeLabel}
						delta={pctChange(totalSpend, comparisonTotals?.spend)}
						deltaTone="neutral"
						trend={spendTrend}
						isLoading={isLoading}
					/>
					<MetricCard
						label="Requests"
						icon={<Zap />}
						value={formatNumber(totalRequests)}
						subtitle={
							totalCached > 0
								? `${cacheHitRate.toFixed(0)}% cache hit`
								: rangeLabel
						}
						delta={pctChange(totalRequests, comparisonTotals?.requests)}
						trend={requestTrend}
						isLoading={isLoading}
					/>
					<MetricCard
						label="Error rate"
						icon={<ShieldCheck />}
						value={`${errorRate.toFixed(1)}%`}
						subtitle={`${formatNumber(totalErrors)} errors`}
						delta={pctChange(errorRate, comparisonTotals?.errorRate)}
						deltaTone="up-bad"
						trend={errorTrend}
						isLoading={isLoading}
					/>
				</motion.div>

				<motion.div variants={sectionVariants}>
					<SquircleSurface className="overflow-hidden">
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
							<div>
								<h2 className="text-[15px] font-semibold text-heading">
									Usage
								</h2>
								<p className="text-xs text-muted-foreground">
									Daily spend · {rangeLabel}
								</p>
							</div>
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
						<div className="px-2 py-4 sm:px-3">
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
				</motion.div>

				<motion.div
					variants={sectionVariants}
					className="grid gap-6 lg:grid-cols-2"
				>
					<Section
						title="Top models"
						description="Ranked by spend in range"
						className="[&_[data-slot=squircle-surface]]:overflow-hidden"
					>
						{topModels.length === 0 ? (
							<EmptyState
								icon={<Boxes />}
								title="No usage yet"
								hint="Model spend shows up here after your first requests."
							/>
						) : (
							<table className="w-full text-sm">
								<thead>
									<tr className={theadRow}>
										<th className="px-4 py-2.5 font-medium">Model</th>
										<th className="px-4 py-2.5 text-right font-medium">
											Requests
										</th>
										<th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
											Tokens
										</th>
										<th className="px-4 py-2.5 text-right font-medium">Cost</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{topModels.map(([id, m], i) => (
										<tr key={id} className="transition-colors hover:bg-muted">
											<td className="max-w-0 px-4 py-2.5">
												<div className="flex items-center gap-2.5">
													<span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
														{i + 1}
													</span>
													<div className="min-w-0 flex-1">
														<p className="truncate font-mono text-[12.5px] font-medium">
															{id}
														</p>
														<div className="mt-1 flex items-center gap-2">
															<span className="truncate text-xs text-muted-foreground">
																{providerLabel(m.provider)}
															</span>
															<span className="h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-muted">
																<span
																	className="block h-full rounded-full bg-brand"
																	style={{
																		width:
																			topModelMaxCost > 0
																				? `${Math.max((m.cost / topModelMaxCost) * 100, 3)}%`
																				: "0%",
																	}}
																/>
															</span>
														</div>
													</div>
												</div>
											</td>
											<td className="px-4 py-2.5 text-right tabular-nums">
												{formatNumber(m.requests)}
											</td>
											<td className="hidden px-4 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">
												{formatTokens(m.tokens)}
											</td>
											<td className="px-4 py-2.5 text-right font-medium tabular-nums">
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
						description="Latest calls to this project"
						className="[&_[data-slot=squircle-surface]]:overflow-hidden"
						action={
							<Link
								href={activityHref}
								className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-brand transition-colors hover:bg-brand-soft focus-ring"
							>
								View all
								<ArrowRight className="size-3.5" />
							</Link>
						}
					>
						{recentLogs.length === 0 ? (
							<EmptyState
								icon={<Activity />}
								title="No requests yet"
								hint="Calls to this project appear here."
							/>
						) : (
							<table className="w-full text-sm">
								<thead>
									<tr className={theadRow}>
										<th className="px-4 py-2.5 font-medium">Model</th>
										<th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
											Tokens
										</th>
										<th className="px-4 py-2.5 text-right font-medium">Cost</th>
										<th className="px-4 py-2.5 text-right font-medium">Time</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{recentLogs.slice(0, 6).map((log) => {
										const href = buildUrl(
											`activity/${log.id}` as Parameters<typeof buildUrl>[0],
										) as Route;
										const slash = log.usedModel.indexOf("/");
										const modelName =
											slash >= 0
												? log.usedModel.slice(slash + 1)
												: log.usedModel;
										const provider =
											providerLabel(log.usedProvider) ||
											(slash >= 0 ? log.usedModel.slice(0, slash) : "");
										const finish = log.unifiedFinishReason;
										const dotClass = log.hasError
											? "bg-destructive"
											: finish === "content_filter" || finish === "length"
												? "bg-warning"
												: "bg-success";
										const createdAt = new Date(log.createdAt);
										const cell = "px-4 py-2.5";
										return (
											<tr
												key={log.id}
												className="relative h-12 transition-colors hover:bg-muted"
											>
												<td className={cn(cell, "min-w-0")}>
													<Link
														href={href}
														className="flex min-w-0 items-center gap-2.5 after:absolute after:inset-0 after:content-['']"
													>
														<span
															className={cn(
																"size-1.5 shrink-0 rounded-full",
																dotClass,
															)}
														/>
														<span className="min-w-0">
															<span className="block truncate text-[13px] font-medium leading-tight">
																{modelName}
															</span>
															{provider ? (
																<span className="block truncate text-xs leading-tight text-muted-foreground">
																	{provider}
																</span>
															) : null}
														</span>
													</Link>
												</td>
												<td
													className={cn(
														cell,
														"hidden whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground sm:table-cell",
													)}
												>
													{formatTokens(Number(log.promptTokens ?? 0))}
													<span className="mx-1 opacity-60">→</span>
													{formatTokens(Number(log.completionTokens ?? 0))}
												</td>
												<td
													className={cn(
														cell,
														"whitespace-nowrap text-right text-[13px] font-medium tabular-nums",
													)}
												>
													{log.cost !== null
														? `$${Number(log.cost).toFixed(4)}`
														: "—"}
												</td>
												<td
													className={cn(
														cell,
														"whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground",
													)}
													title={format(createdAt, "PPpp")}
												>
													{formatDistanceToNowStrict(createdAt, {
														addSuffix: true,
													})}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						)}
					</Section>
				</motion.div>
			</motion.div>
		</MotionConfig>
	);
}
