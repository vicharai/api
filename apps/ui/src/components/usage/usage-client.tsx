"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import {
	UsageModeSelector,
	useUsageMode,
} from "@/components/shared/usage-mode-selector";
import {
	TimeRangePicker,
	type TimeRangeValue,
} from "@/components/time-range-picker";
import { CacheRateChart } from "@/components/usage/cache-rate-chart";
import { CostBreakdownChart } from "@/components/usage/cost-breakdown-chart";
import { ErrorRateChart } from "@/components/usage/error-rate-chart";
import { ModelUsageTable } from "@/components/usage/model-usage-table";
import { UsageChart } from "@/components/usage/usage-chart";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import { GENERATED_RANGE_PARAM } from "@/hooks/useZonedRangeDefaults";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/lib/components/select";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/lib/components/tabs";
import { useApi } from "@/lib/fetch-client";
import { USAGE_MODE_ALL_TRAFFIC_NOTE } from "@/lib/usage-mode";
import { cn } from "@/lib/utils";

import {
	formatDayKey,
	shiftDayKey,
	useDisplayTimeZone,
} from "@llmgateway/shared";

import type { ActivitT } from "@/types/activity";

interface UsageClientProps {
	initialActivityData?: ActivitT;
	projectId: string | undefined;
	/** Canonical route this client is mounted on (the analytics hub). */
	routePath?: string;
	/** Hide the internal title block — the hub renders its own. */
	embedded?: boolean;
}

function UsageSection({
	title,
	description,
	panelClassName,
	children,
}: {
	title: string;
	description: React.ReactNode;
	panelClassName?: string;
	children: React.ReactNode;
}) {
	return (
		<SquircleSurface className="border border-border p-1 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3 pb-2 pl-3.5 pr-2 pt-1.5">
				<div className="ml-1 min-w-0">
					<h2 className="text-sm font-medium text-foreground/80">{title}</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
				</div>
			</div>
			<SquirclePanel className={panelClassName}>{children}</SquirclePanel>
		</SquircleSurface>
	);
}

/** Day keys for a range, in the zone the queries bucket by. Deriving them
 *  from the browser calendar would ask for a day the API considers the future
 *  whenever the two zones are on different dates. */
function timeRangeToDayKeys(timeRange: TimeRangeValue, timeZone: string) {
	const now = new Date();
	const today = formatDayKey(now, timeZone);
	// Sub-day windows straddle midnight whenever "now" is less than the window
	// length into the day, so take the day the window actually starts on rather
	// than assuming it is today.
	const hoursAgo = (hours: number) => {
		const windowMs = hours * 60 * 60 * 1000;
		return formatDayKey(new Date(now.getTime() - windowMs), timeZone);
	};
	switch (timeRange) {
		case "1h":
			return { from: hoursAgo(1), to: today };
		case "4h":
			return { from: hoursAgo(4), to: today };
		case "24h":
			return { from: hoursAgo(24), to: today };
		case "7d":
			return { from: shiftDayKey(today, -7), to: today };
		case "30d":
			return { from: shiftDayKey(today, -30), to: today };
	}
}

export function UsageClient({
	initialActivityData,
	projectId,
	routePath = "usage",
	embedded = false,
}: UsageClientProps) {
	const router = useRouter();
	const { timeZone: displayTimeZone } = useDisplayTimeZone();
	const searchParams = useSearchParams();
	const { buildUrl } = useDashboardNavigation();
	const api = useApi();
	const usageMode = useUsageMode();

	// Fetch API keys for the project
	const { data: apiKeysData } = api.useQuery(
		"get",
		"/keys/api",
		{
			params: {
				query: {
					projectId: projectId ?? "",
				},
			},
		},
		{
			enabled: !!projectId,
		},
	);

	const apiKeys =
		apiKeysData?.apiKeys.filter((key) => key.status !== "deleted") ?? [];

	// Get apiKeyId and timeRange from URL
	const apiKeyId = searchParams.get("apiKeyId") ?? undefined;
	const timeRange = (searchParams.get("timeRange") as TimeRangeValue) ?? "7d";

	// If no from/to params, set them based on timeRange
	useEffect(() => {
		const { from, to } = timeRangeToDayKeys(timeRange, displayTimeZone);
		const currentFrom = searchParams.get("from");
		const currentTo = searchParams.get("to");
		// Leave a range the user picked alone; refresh one we generated, so a
		// zone toggle moves it instead of stranding it in the previous zone.
		if (
			currentFrom &&
			currentTo &&
			searchParams.get(GENERATED_RANGE_PARAM) !== "1"
		) {
			return;
		}
		if (currentFrom === from && currentTo === to) {
			return;
		}
		const params = new URLSearchParams(searchParams);
		params.set(GENERATED_RANGE_PARAM, "1");
		params.delete("days");
		params.set("from", from);
		params.set("to", to);
		if (!params.has("timeRange")) {
			params.set("timeRange", timeRange);
		}
		router.replace(`${buildUrl(routePath)}?${params.toString()}`);
	}, [searchParams, router, buildUrl, routePath, timeRange, displayTimeZone]);

	// Function to update apiKeyId in URL
	const updateApiKeyIdInUrl = (newApiKeyId: string | undefined) => {
		const params = new URLSearchParams(searchParams);
		if (newApiKeyId) {
			params.set("apiKeyId", newApiKeyId);
		} else {
			params.delete("apiKeyId");
		}
		router.push(`${buildUrl(routePath)}?${params.toString()}`);
	};

	// Function to update timeRange in URL
	const updateTimeRange = (newTimeRange: TimeRangeValue) => {
		const { from, to } = timeRangeToDayKeys(newTimeRange, displayTimeZone);
		const params = new URLSearchParams(searchParams);
		// Derived from the time-range control, so a zone toggle should re-derive
		// it rather than preserve stale day keys.
		params.set(GENERATED_RANGE_PARAM, "1");
		params.set("timeRange", newTimeRange);
		params.set("from", from);
		params.set("to", to);
		params.delete("days");
		router.push(`${buildUrl(routePath)}?${params.toString()}`);
	};

	return (
		<div className="flex flex-col">
			<div className={cn("flex-1 space-y-5", !embedded && "p-4 pt-6 md:p-6")}>
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					{!embedded && (
						<h1 className="text-xl font-medium tracking-tight">
							Usage & Metrics
						</h1>
					)}
					<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
						<Select
							value={apiKeyId ?? "all"}
							onValueChange={(value) =>
								updateApiKeyIdInUrl(value === "all" ? undefined : value)
							}
						>
							<SelectTrigger size="sm" className="w-full sm:w-[180px]">
								<SelectValue placeholder="All API Keys" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All API Keys</SelectItem>
								{apiKeys.map((key) => (
									<SelectItem key={key.id} value={key.id}>
										{key.description}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<TimeRangePicker value={timeRange} onChange={updateTimeRange} />
						<UsageModeSelector />
					</div>
				</div>
				<Tabs defaultValue="requests" className="space-y-4">
					<TabsList className="max-w-full overflow-x-auto border border-border bg-panel">
						<TabsTrigger
							value="requests"
							className="data-[state=active]:bg-card data-[state=active]:shadow-xs"
						>
							Requests
						</TabsTrigger>
						<TabsTrigger
							value="models"
							className="data-[state=active]:bg-card data-[state=active]:shadow-xs"
						>
							Models
						</TabsTrigger>
						<TabsTrigger
							value="errors"
							className="data-[state=active]:bg-card data-[state=active]:shadow-xs"
						>
							Errors
						</TabsTrigger>
						<TabsTrigger
							value="cache"
							className="data-[state=active]:bg-card data-[state=active]:shadow-xs"
						>
							Cache
						</TabsTrigger>
						<TabsTrigger
							value="costs"
							className="data-[state=active]:bg-card data-[state=active]:shadow-xs"
						>
							Costs
						</TabsTrigger>
					</TabsList>
					<TabsContent value="requests" className="space-y-4">
						<UsageSection
							title="Request Volume"
							description="Number of API requests over time"
							panelClassName="h-[400px] p-4"
						>
							<UsageChart
								initialData={apiKeyId ? undefined : initialActivityData}
								projectId={projectId}
								apiKeyId={apiKeyId}
							/>
						</UsageSection>
					</TabsContent>
					<TabsContent value="models" className="space-y-4">
						<UsageSection
							title="Top Used Models"
							description="Usage breakdown by model"
							panelClassName="p-3 sm:p-4"
						>
							<ModelUsageTable
								initialData={apiKeyId ? undefined : initialActivityData}
								projectId={projectId}
								apiKeyId={apiKeyId}
							/>
						</UsageSection>
					</TabsContent>
					<TabsContent value="errors" className="space-y-4">
						<UsageSection
							title="Error Rate"
							description={
								<>
									API request error rate over time
									{usageMode !== "total" && ` — ${USAGE_MODE_ALL_TRAFFIC_NOTE}`}
								</>
							}
							panelClassName="h-[400px] p-4"
						>
							<ErrorRateChart
								initialData={apiKeyId ? undefined : initialActivityData}
								projectId={projectId}
								apiKeyId={apiKeyId}
							/>
						</UsageSection>
					</TabsContent>
					<TabsContent value="cache" className="space-y-4">
						<UsageSection
							title="Cache Rate"
							description={
								<>
									API request cache rate over time
									{usageMode !== "total" && ` — ${USAGE_MODE_ALL_TRAFFIC_NOTE}`}
								</>
							}
							panelClassName="h-[400px] p-4"
						>
							<CacheRateChart
								initialData={apiKeyId ? undefined : initialActivityData}
								projectId={projectId}
								apiKeyId={apiKeyId}
							/>
						</UsageSection>
					</TabsContent>
					<TabsContent value="costs" className="space-y-4">
						<UsageSection
							title="Cost Breakdown"
							description="Estimated costs by provider and model"
							panelClassName="p-4"
						>
							<CostBreakdownChart
								initialData={apiKeyId ? undefined : initialActivityData}
								projectId={projectId}
								apiKeyId={apiKeyId}
							/>
						</UsageSection>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
