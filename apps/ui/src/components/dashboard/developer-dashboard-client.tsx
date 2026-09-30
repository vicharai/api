"use client";

import { format } from "date-fns";
import { Coins, Hash, KeyRound, Zap } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

import { currencyFormatter } from "@/components/analytics/chart-helpers";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
	DateRangePicker,
	getDateRangeFromParams,
} from "@/components/date-range-picker";
import {
	UsageModeSelector,
	useUsageMode,
} from "@/components/shared/usage-mode-selector";
import { MemberLimitsCard } from "@/components/team/member-limits-card";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import { useZonedRangeDefaults } from "@/hooks/useZonedRangeDefaults";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { useApi } from "@/lib/fetch-client";
import { applyUsageMode, pickCost, pickRequests } from "@/lib/usage-mode";

import {
	formatBucketLabel,
	formatBucketLabelWithZone,
} from "@llmgateway/shared";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { MyMemberBudgetData } from "@/hooks/useTeam";

export function DeveloperDashboardClient({
	initialMemberBudget,
}: {
	initialMemberBudget?: MyMemberBudgetData;
}) {
	const params = useParams();
	const organizationId = params.orgId as string;
	const projectId = params.projectId as string;
	const { buildUrl } = useDashboardNavigation();
	const router = useRouter();
	const searchParams = useSearchParams();
	const api = useApi();
	const {
		from: defaultFrom,
		to: defaultTo,
		timeZone: displayTimeZone,
		markGenerated,
		shouldApplyDefaults,
	} = useZonedRangeDefaults();

	useEffect(() => {
		if (!shouldApplyDefaults(searchParams)) {
			return;
		}
		const next = new URLSearchParams(searchParams.toString());
		next.delete("days");
		next.set("from", defaultFrom);
		next.set("to", defaultTo);
		markGenerated(next);
		router.replace(`${buildUrl("me")}?${next.toString()}`);
	}, [
		searchParams,
		router,
		buildUrl,
		defaultFrom,
		defaultTo,
		markGenerated,
		shouldApplyDefaults,
	]);

	const { from, to } = getDateRangeFromParams(searchParams, displayTimeZone);
	const fromStr = format(from, "yyyy-MM-dd");
	const toStr = format(to, "yyyy-MM-dd");

	const { data, isLoading } = api.useQuery(
		"get",
		"/analytics/me",
		{
			params: {
				query: {
					organizationId,
					projectId,
					from: fromStr,
					to: toStr,
					timezone: displayTimeZone,
				},
			},
		},
		{ enabled: !!organizationId && !!projectId, refetchOnWindowFocus: false },
	);

	const usageMode = useUsageMode();
	const summary = data?.summary;
	const activity = (data?.activity ?? []).map((row) =>
		applyUsageMode(row, usageMode),
	);

	const stats = [
		{
			label: "Total cost",
			value: currencyFormatter.format(
				summary ? pickCost(summary, usageMode) : 0,
			),
			icon: Coins,
			accent: "brand",
		},
		{
			label: "Requests",
			value: formatNumber(summary ? pickRequests(summary, usageMode) : 0),
			icon: Zap,
			accent: "purple",
		},
		{
			label: "Tokens",
			value: formatNumber(summary?.totalTokens ?? 0),
			icon: Hash,
			accent: "violet",
		},
		{
			label: "Active API keys",
			value: formatNumber(summary?.apiKeyCount ?? 0),
			icon: KeyRound,
			accent: "magenta",
		},
	] as const;

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5 p-4 pt-6 md:p-6">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<h1 className="text-xl font-medium tracking-tight">Dashboard</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Your usage and API keys for this project
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
						<DateRangePicker buildUrl={buildUrl} path="me" />
						<UsageModeSelector />
					</div>
				</div>

				<MemberLimitsCard
					organizationId={organizationId}
					initialData={initialMemberBudget}
				/>

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					{stats.map((stat) => (
						<MetricCard
							key={stat.label}
							label={stat.label}
							value={stat.value}
							icon={<stat.icon className="h-4 w-4" />}
							accent={stat.accent}
							isLoading={isLoading}
						/>
					))}
				</div>

				<SquircleSurface className="border border-border p-1 shadow-sm">
					<div className="flex flex-wrap items-start justify-between gap-3 pb-2 pl-3.5 pr-2 pt-1.5">
						<div className="ml-1 min-w-0">
							<h2 className="text-sm font-medium text-foreground/80">
								Cost over time
							</h2>
							<p className="mt-0.5 text-xs text-muted-foreground">
								Your spend across the selected window
							</p>
						</div>
					</div>
					<SquirclePanel className="px-4 py-4">
						<ResponsiveContainer width="100%" height={280}>
							<AreaChart
								data={activity}
								margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
							>
								<defs>
									<linearGradient id="devCost" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stopColor="#6314b8" stopOpacity={0.35} />
										<stop offset="100%" stopColor="#6314b8" stopOpacity={0} />
									</linearGradient>
								</defs>
								<XAxis
									dataKey="date"
									tickFormatter={(d: string) =>
										formatBucketLabel(d, "monthDay")
									}
									tickLine={false}
									axisLine={false}
									className="text-xs"
									minTickGap={24}
								/>
								<YAxis
									tickFormatter={(v: number) => `$${v.toFixed(2)}`}
									tickLine={false}
									axisLine={false}
									width={64}
									className="text-xs"
								/>
								<Tooltip
									formatter={(v: number) => currencyFormatter.format(v)}
									labelFormatter={(d: string) =>
										formatBucketLabelWithZone(
											d,
											"monthDayYear",
											displayTimeZone,
										)
									}
								/>
								<Area
									type="monotone"
									dataKey="cost"
									stroke="#6314b8"
									strokeWidth={2}
									fill="url(#devCost)"
								/>
							</AreaChart>
						</ResponsiveContainer>
					</SquirclePanel>
				</SquircleSurface>
			</div>
		</div>
	);
}
