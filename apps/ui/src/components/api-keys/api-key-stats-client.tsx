"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
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
import { ApiKeyLimitsDialog } from "@/components/api-keys/api-key-limits-dialog";
import {
	UsageModeSelector,
	useUsageMode,
} from "@/components/shared/usage-mode-selector";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import { useZonedRangeDefaults } from "@/hooks/useZonedRangeDefaults";
import { Button } from "@/lib/components/button";
import {
	EmptyState,
	PageHeader,
	Section,
	StatCell,
	StatStrip,
} from "@/lib/components/page-layout";
import { SquircleSurface } from "@/lib/components/squircle";
import { StatusBadge } from "@/lib/components/status-badge";
import { useApi } from "@/lib/fetch-client";
import { applyUsageModeToDaily } from "@/lib/usage-mode";

import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiKeyLimitPayload } from "@/components/api-keys/api-key-limit-fields";
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
		{ label: "Total cost", value: currencyFormatter.format(summary.cost) },
		{ label: "Total tokens", value: formatNumber(summary.totalTokens) },
		{ label: "Requests", value: formatNumber(summary.requestCount) },
		{ label: "Error rate", value: `${errorRate.toFixed(1)}%` },
	] as const;

	const queryClient = useQueryClient();
	const updateLimitMutation = api.useMutation("patch", "/keys/api/limit/{id}");
	const updateKeyUsageLimit = async (
		payload: ApiKeyLimitPayload,
	): Promise<void> => {
		await updateLimitMutation.mutateAsync(
			{ params: { path: { id: keyId } }, body: payload },
			{
				onSuccess: () => {
					const queryKey = api.queryOptions("get", "/keys/api", {
						params: { query: { projectId: projectId ?? "" } },
					}).queryKey;
					void queryClient.invalidateQueries({ queryKey });
				},
			},
		);
	};

	return (
		<div className="space-y-8">
			<PageHeader
				title={
					<span className="inline-flex items-center gap-2.5">
						{apiKey?.description || "API Key"}
						{apiKey && <StatusBadge status={apiKey.status} />}
					</span>
				}
				description={
					<span className="inline-flex items-center gap-2 font-mono text-xs">
						{apiKey?.maskedToken ?? keyId}
						{apiKey?.createdAt && (
							<span className="font-sans text-muted-foreground">
								· created{" "}
								{new Date(apiKey.createdAt).toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
									year: "numeric",
								})}
							</span>
						)}
					</span>
				}
				actions={
					<>
						<UsageModeSelector />
						<AnalyticsDateRange
							isEnterprise={isEnterprise}
							buildUrl={buildUrl}
							path={`api-keys/${keyId}`}
						/>
					</>
				}
			/>
			<Link
				href={buildUrl("api-keys")}
				className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
				prefetch={true}
			>
				<ArrowLeftIcon className="h-4 w-4" />
				Back to API keys
			</Link>

			<StatStrip>
				{stats.map((stat) => (
					<StatCell
						key={stat.label}
						label={stat.label}
						value={stat.value}
						isLoading={isLoading}
					/>
				))}
			</StatStrip>

			{apiKey && (
				<Section title="Limits" description="Spend limits on this key">
					<div className="flex items-center justify-between gap-4 px-4 py-3.5">
						<div className="min-w-0 text-sm text-muted-foreground">
							{apiKey.usageLimit
								? `$${Number(apiKey.usageLimit).toFixed(2)} all-time`
								: "No all-time limit"}
						</div>
						<ApiKeyLimitsDialog apiKey={apiKey} onSubmit={updateKeyUsageLimit}>
							<Button variant="outline" size="sm">
								Edit limits
							</Button>
						</ApiKeyLimitsDialog>
					</div>
					<Link
						href={buildUrl(
							`api-keys/${keyId}/iam` as Parameters<typeof buildUrl>[0],
						)}
						className="flex items-center justify-between gap-4 border-t border-border px-4 py-3.5 text-sm transition-colors hover:bg-muted/50"
					>
						<span className="font-medium">IAM rules</span>
						<span className="text-muted-foreground">
							Control model and provider access →
						</span>
					</Link>
				</Section>
			)}

			{!isLoading && summary.requestCount === 0 ? (
				<SquircleSurface>
					<EmptyState
						title="No usage in this range"
						hint="Requests made with this key appear here."
					/>
				</SquircleSurface>
			) : (
				<div className="space-y-8">
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
			)}
		</div>
	);
}
