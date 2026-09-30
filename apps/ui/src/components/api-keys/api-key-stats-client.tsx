"use client";

import {
	AlertTriangle,
	ArrowLeftIcon,
	CircleDollarSign,
	Hash,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import {
	AnalyticsDateRange,
	getAnalyticsRange,
} from "@/components/analytics/analytics-date-range";
import { currencyFormatter } from "@/components/analytics/chart-helpers";
import { CostByModelCard } from "@/components/analytics/cost-by-model-card";
import { CostByModelOverTimeCard } from "@/components/analytics/cost-by-model-over-time-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
	UsageModeSelector,
	useUsageMode,
} from "@/components/shared/usage-mode-selector";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import { useZonedRangeDefaults } from "@/hooks/useZonedRangeDefaults";
import { useApi } from "@/lib/fetch-client";
import { applyUsageModeToDaily } from "@/lib/usage-mode";

import { formatNumber } from "@llmgateway/shared/number-format";

import type { Route } from "next";

interface ApiKeyStatsClientProps {
	projectId: string | undefined;
	keyId: string;
}

export function ApiKeyStatsClient({
	projectId,
	keyId,
}: ApiKeyStatsClientProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { buildUrl, selectedOrganization } = useDashboardNavigation();
	const api = useApi();
	const {
		from: defaultFrom,
		to: defaultTo,
		timeZone: displayTimeZone,
		markGenerated,
		shouldApplyDefaults,
	} = useZonedRangeDefaults();
	const usageMode = useUsageMode();
	const isEnterprise = selectedOrganization?.enterpriseAccess === true;

	useEffect(() => {
		if (!isEnterprise) {
			return;
		}
		if (!shouldApplyDefaults(searchParams)) {
			return;
		}
		const params = new URLSearchParams(searchParams.toString());
		params.delete("days");
		params.set("from", defaultFrom);
		params.set("to", defaultTo);
		markGenerated(params);
		router.replace(
			`${buildUrl(`api-keys/${keyId}`)}?${params.toString()}` as Route,
		);
	}, [
		searchParams,
		router,
		buildUrl,
		keyId,
		isEnterprise,
		defaultFrom,
		defaultTo,
		markGenerated,
		shouldApplyDefaults,
	]);

	const { fromStr, toStr } = getAnalyticsRange(
		isEnterprise,
		searchParams.get("from"),
		searchParams.get("to"),
		displayTimeZone,
	);

	const { data: apiKeysData } = api.useQuery(
		"get",
		"/keys/api",
		{ params: { query: { projectId: projectId ?? "" } } },
		{ enabled: !!projectId },
	);
	const apiKey = apiKeysData?.apiKeys.find((k) => k.id === keyId);

	const { data, isLoading } = api.useQuery(
		"get",
		"/activity",
		{
			params: {
				query: {
					from: fromStr,
					to: toStr,
					timezone: displayTimeZone,
					apiKeyId: keyId,
					...(projectId ? { projectId } : {}),
				},
			},
		},
		{
			enabled: !!projectId,
			refetchOnWindowFocus: false,
			staleTime: 1000 * 60 * 5,
		},
	);

	const activity = useMemo(
		() =>
			(data?.activity ?? []).map((day) =>
				applyUsageModeToDaily(day, usageMode),
			),
		[data, usageMode],
	);

	const summary = useMemo(() => {
		return activity.reduce(
			(acc, row) => {
				acc.cost += row.cost;
				acc.totalTokens += row.totalTokens;
				acc.requestCount += row.requestCount;
				acc.errorCount += row.errorCount;
				acc.clientErrorCount += row.clientErrorCount;
				return acc;
			},
			{
				cost: 0,
				totalTokens: 0,
				requestCount: 0,
				errorCount: 0,
				clientErrorCount: 0,
			},
		);
	}, [activity]);

	// Errors are only tracked blended, so the rate is computed against all
	// traffic regardless of the selected usage mode.
	const blendedRequestCount = useMemo(
		() =>
			(data?.activity ?? []).reduce(
				(sum, row) => sum + row.requestCount - row.clientErrorCount,
				0,
			),
		[data],
	);

	const errorRate =
		blendedRequestCount > 0
			? (summary.errorCount / blendedRequestCount) * 100
			: 0;

	const stats = [
		{
			label: "Total Cost",
			value: currencyFormatter.format(summary.cost),
			icon: CircleDollarSign,
			accent: "brand",
		},
		{
			label: "Total Tokens",
			value: formatNumber(summary.totalTokens),
			icon: Hash,
			accent: "violet",
		},
		{
			label: "Requests",
			value: formatNumber(summary.requestCount),
			icon: Zap,
			accent: "purple",
		},
		{
			label: "Error Rate",
			value: `${errorRate.toFixed(1)}%`,
			icon: AlertTriangle,
			accent: "magenta",
		},
	] as const;

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5 p-4 pt-6 md:p-6">
				<Link
					href={buildUrl("api-keys")}
					className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
					prefetch={true}
				>
					<ArrowLeftIcon className="h-4 w-4" />
					Back to API keys
				</Link>

				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<h1 className="truncate text-xl font-medium tracking-tight">
							{apiKey?.description || "API Key"}
						</h1>
						<p className="mt-0.5 w-fit truncate rounded-lg bg-panel px-2 py-1 font-mono text-xs text-muted-foreground">
							{apiKey?.maskedToken ?? keyId}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<UsageModeSelector />
						<AnalyticsDateRange
							isEnterprise={isEnterprise}
							buildUrl={buildUrl}
							path={`api-keys/${keyId}`}
						/>
					</div>
				</div>

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

				<CostByModelOverTimeCard
					activity={activity}
					loading={isLoading}
					description="Stacked breakdown of the top 10 models used by this API key"
				/>
				<CostByModelCard
					activity={activity}
					loading={isLoading}
					description="Top 20 models by cost for this API key"
				/>
			</div>
		</div>
	);
}
