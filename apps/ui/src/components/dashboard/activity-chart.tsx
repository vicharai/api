"use client";

import { addDays, differenceInCalendarDays, format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

import { getDateRangeFromParams } from "@/components/date-range-picker";
import { ChartSkeleton } from "@/components/shared/chart-skeleton";
import {
	ChartTooltipHeading,
	ChartTooltipRow,
	ChartTooltipShell,
} from "@/components/shared/chart-tooltip";
import { useUsageMode } from "@/components/shared/usage-mode-selector";
import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/lib/components/select";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { useApi } from "@/lib/fetch-client";
import { applyUsageModeToDaily } from "@/lib/usage-mode";

import {
	formatBucketLabel,
	formatBucketLabelWithZone,
	useDisplayTimeZone,
} from "@llmgateway/shared";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import type { TimeRangeValue } from "@/components/time-range-picker";
import type { GroupBy } from "@/components/usage/group-by";
import type {
	ActivitT,
	ActivityApiKeyUsage,
	ActivityModelUsage,
	ActivityUserUsage,
} from "@/types/activity";
import type { TooltipProps } from "recharts";

interface BreakdownSource {
	modelBreakdown: ActivityModelUsage[];
	apiKeyBreakdown: ActivityApiKeyUsage[];
	userBreakdown: ActivityUserUsage[];
}

interface BreakdownItem {
	id: string;
	label?: string;
	requestCount: number;
	totalTokens: number;
	cost: number;
}

// Pick the breakdown for the requested dimension, normalizing each dimension's
// display field (model id / key description / member name) into `label`.
function pickBreakdown(
	day: BreakdownSource,
	groupBy: GroupBy,
): BreakdownItem[] {
	switch (groupBy) {
		case "apiKey":
			return day.apiKeyBreakdown.map((item) => ({
				...item,
				label: item.description,
			}));
		case "user":
			return day.userBreakdown.map((item) => ({ ...item, label: item.name }));
		case "model":
		default:
			return day.modelBreakdown;
	}
}

const DIMENSION_LABELS: Record<
	GroupBy,
	{ noun: string; entity: string; cardTitle: string }
> = {
	model: { noun: "model", entity: "Model", cardTitle: "Model Usage Overview" },
	apiKey: {
		noun: "API key",
		entity: "API key",
		cardTitle: "API Key Usage Overview",
	},
	user: { noun: "user", entity: "User", cardTitle: "User Usage Overview" },
};

// Helper function to get all unique series (model, api key or member ids) from the data
function getUniqueSeries(data: BreakdownSource[], groupBy: GroupBy): string[] {
	if (!data || data.length === 0) {
		return [];
	}

	const all = new Set<string>();
	data.forEach((day) => {
		pickBreakdown(day, groupBy).forEach((item) => {
			all.add(item.id);
		});
	});

	return Array.from(all);
}

// Vichar series ramp — purple first, then accent/neutral alternates (matches
// the --chart-* tokens, kept as hex literals for recharts SVG attributes).
const SERIES_COLORS = [
	"#4f80ff", // purple
	"#ff6a1a", // orange
	"#0ea5e9", // magenta
	"#93b8ff", // soft violet
	"#64748b", // slate
	"#1e44ac", // deep violet
	"#ff8a3d", // light orange
	"#38bdf8", // light magenta
	"#94a3b8", // light slate
	"#6d94e8", // indigo violet
];

// Helper function to generate colors for each series
function getSeriesColor(_series: string, index: number): string {
	// Use modulo to cycle through colors if there are more models than colors
	return SERIES_COLORS[index % SERIES_COLORS.length];
}

function isHourlyRange(
	timeRange: TimeRangeValue | undefined,
): timeRange is "1h" | "4h" | "24h" {
	return timeRange === "1h" || timeRange === "4h" || timeRange === "24h";
}

function getTimeRangeHours(timeRange: TimeRangeValue): number {
	switch (timeRange) {
		case "1h":
			return 1;
		case "4h":
			return 4;
		case "24h":
			return 24;
		case "7d":
			return 7 * 24;
		case "30d":
			return 30 * 24;
	}
}

interface TooltipPayload {
	dataKey: string;
	name: string;
	value: number;
	color: string;
	payload: BreakdownSource & {
		requestCount: number;
		totalTokens: number;
		cost: number;
	};
}

interface CustomTooltipProps extends TooltipProps<number, string> {
	active?: boolean;
	payload?: TooltipPayload[];
	label?: string;
	breakdownField?: "requests" | "cost" | "tokens";
	hourly?: boolean;
	groupBy?: GroupBy;
}

const CustomTooltip = ({
	active,
	payload,
	label,
	breakdownField = "requests",
	hourly = false,
	groupBy = "model",
}: CustomTooltipProps) => {
	// Reads the zone from context rather than a prop: recharts owns this
	// element, so the parent can't thread anything into it.
	const { timeZone } = useDisplayTimeZone();
	if (active && payload && payload.length) {
		const data = payload[0].payload;
		const items = pickBreakdown(data, groupBy);
		return (
			<ChartTooltipShell>
				<ChartTooltipHeading>
					{label &&
						formatBucketLabelWithZone(
							label,
							hourly ? "monthDayYearHourMinute" : "monthDayYear",
							timeZone,
						)}
				</ChartTooltipHeading>
				<div className="mt-1 space-y-1">
					<ChartTooltipRow
						label="Requests"
						value={formatNumber(data.requestCount)}
					/>
					<ChartTooltipRow
						label="Tokens"
						value={formatNumber(data.totalTokens)}
					/>
					<ChartTooltipRow
						label="Estimated cost"
						value={`$${data.cost.toFixed(4)}`}
					/>
				</div>
				{items.length === 1 && (
					<p className="mt-2 text-xs text-white/60">
						{DIMENSION_LABELS[groupBy].entity}:{" "}
						<span className="font-medium text-white">
							{items[0].label ?? items[0].id}
						</span>
					</p>
				)}
				{payload.length > 1 && (
					<div className="mt-2 border-t border-white/15 pt-2">
						<p className="text-xs font-medium text-white/60">
							{DIMENSION_LABELS[groupBy].entity} breakdown
						</p>
						<div className="mt-1 space-y-1">
							{payload.map((entry, index) => {
								// Skip the entry if it's not a model (e.g., it's the total requestCount)
								if (entry.dataKey === "requestCount") {
									return null;
								}

								// Calculate percentage based on the selected breakdown field
								let total = data.requestCount;
								if (breakdownField === "cost") {
									total = data.cost;
								} else if (breakdownField === "tokens") {
									total = data.totalTokens;
								}
								const percentage =
									entry.value && total
										? Math.round((entry.value / total) * 100)
										: 0;

								return (
									<ChartTooltipRow
										key={`${entry.dataKey}-${index}`}
										color={entry.color}
										label={entry.name}
										value={
											<>
												{breakdownField === "cost"
													? `$${Number(entry.value).toFixed(4)}`
													: formatNumber(entry.value)}{" "}
												({percentage}%)
											</>
										}
									/>
								);
							})}
						</div>
					</div>
				)}
			</ChartTooltipShell>
		);
	}

	return null;
};

function ChartFrame({
	title,
	description,
	action,
	children,
}: {
	title: string;
	description?: React.ReactNode;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<SquircleSurface className="border border-border p-1 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3 pb-2 pl-3.5 pr-2 pt-1.5">
				<div className="ml-1 min-w-0">
					<h2 className="text-sm font-medium text-foreground/80">{title}</h2>
					{description ? (
						<p className="mt-0.5 text-xs text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				{action}
			</div>
			<SquirclePanel className="p-4">{children}</SquirclePanel>
		</SquircleSurface>
	);
}

interface ActivityChartProps {
	initialData?: ActivitT;
	apiKeyId?: string;
	timeRange?: TimeRangeValue;
	groupBy?: GroupBy;
}

export function ActivityChart({
	initialData,
	apiKeyId,
	timeRange,
	groupBy = "model",
}: ActivityChartProps) {
	const searchParams = useSearchParams();
	const [breakdownField, setBreakdownField] = useState<
		"requests" | "cost" | "tokens"
	>("requests");
	const [showAllModels, setShowAllModels] = useState(false);
	const { selectedProject } = useDashboardNavigation();
	const api = useApi();
	const { timeZone: displayTimeZone } = useDisplayTimeZone();

	const hourly = isHourlyRange(timeRange);

	// Build query params based on whether we're using timeRange or date range
	const queryParams = useMemo(() => {
		const breakdownParam = groupBy === "model" ? {} : { groupBy };
		const timezone = displayTimeZone;
		if (timeRange) {
			return {
				timeRange,
				timezone,
				...(selectedProject?.id ? { projectId: selectedProject.id } : {}),
				...(apiKeyId ? { apiKeyId } : {}),
				...breakdownParam,
			};
		}
		const { from, to } = getDateRangeFromParams(searchParams, displayTimeZone);
		return {
			from: format(from, "yyyy-MM-dd"),
			to: format(to, "yyyy-MM-dd"),
			timezone,
			...(selectedProject?.id ? { projectId: selectedProject.id } : {}),
			...(apiKeyId ? { apiKeyId } : {}),
			...breakdownParam,
		};
	}, [
		timeRange,
		searchParams,
		selectedProject?.id,
		apiKeyId,
		groupBy,
		displayTimeZone,
	]);

	const {
		data: rawData,
		isLoading,
		error,
	} = api.useQuery(
		"get",
		"/activity",
		{
			params: {
				query: queryParams,
			},
		},
		{
			enabled: !!selectedProject?.id,
			initialData: timeRange ? undefined : initialData,
		},
	);

	const usageMode = useUsageMode();
	const data = useMemo(
		() =>
			rawData
				? {
						...rawData,
						activity: rawData.activity.map((day) =>
							applyUsageModeToDaily(day, usageMode),
						),
					}
				: rawData,
		[rawData, usageMode],
	);

	const periodLabel = useMemo(() => {
		if (timeRange) {
			const hours = getTimeRangeHours(timeRange);
			if (hours < 24) {
				return `last ${hours} hour${hours > 1 ? "s" : ""}`;
			}
			if (hours === 24) {
				return "last 24 hours";
			}
			return `last ${hours / 24} days`;
		}
		const { from, to } = getDateRangeFromParams(searchParams, displayTimeZone);
		const days = differenceInCalendarDays(to, from) + 1;
		return `${days} days`;
	}, [timeRange, searchParams, displayTimeZone]);

	const seriesNoun = DIMENSION_LABELS[groupBy].noun;
	const cardTitle = DIMENSION_LABELS[groupBy].cardTitle;

	if (!selectedProject) {
		return (
			<ChartFrame
				title={cardTitle}
				description="Please select a project to view activity data"
			>
				<div className="flex h-[350px] items-center justify-center">
					<p className="text-muted-foreground">No project selected</p>
				</div>
			</ChartFrame>
		);
	}

	if (isLoading) {
		return (
			<ChartFrame
				title={cardTitle}
				description={`Stacked ${seriesNoun} ${breakdownField} over ${periodLabel}`}
			>
				<ChartSkeleton />
			</ChartFrame>
		);
	}

	if (error) {
		return (
			<ChartFrame
				title={cardTitle}
				description={`Stacked ${seriesNoun} ${breakdownField} over ${periodLabel}`}
			>
				<div className="flex h-[350px] items-center justify-center">
					<p className="text-destructive">Error loading activity data</p>
				</div>
			</ChartFrame>
		);
	}

	if (!data || data.activity.length === 0) {
		return (
			<ChartFrame
				title={cardTitle}
				description={
					<>
						Stacked {seriesNoun} {breakdownField} over {periodLabel}
						{selectedProject && (
							<span className="block mt-1">
								Project: {selectedProject.name}
							</span>
						)}
					</>
				}
			>
				<div className="flex h-[350px] items-center justify-center">
					<p className="text-muted-foreground">No activity data available</p>
				</div>
			</ChartFrame>
		);
	}

	// Generate the expected time slots (hourly or daily). For timeRange queries
	// the backend already returns padded, ordered buckets in the requested
	// timezone, so use them as-is instead of regenerating them locally.
	const slots: string[] = [];
	if (timeRange) {
		slots.push(...data.activity.map((item) => item.date));
	} else {
		const { from, to } = getDateRangeFromParams(searchParams, displayTimeZone);
		const totalDays = differenceInCalendarDays(to, from) + 1;
		for (let i = 0; i < totalDays; i++) {
			const date = addDays(from, i);
			slots.push(format(date, "yyyy-MM-dd"));
		}
	}

	// Create a map of existing data by date/timestamp
	const dataByDate = new Map(data.activity.map((item) => [item.date, item]));

	// Fill in the chart data with all slots, using zero values for missing ones
	const chartData = slots.map((slot) => {
		if (dataByDate.has(slot)) {
			const dayData = dataByDate.get(slot)!;

			// Process breakdown data for stacked bars
			const result: Record<
				string,
				| string
				| number
				| ActivityModelUsage[]
				| ActivityApiKeyUsage[]
				| ActivityUserUsage[]
			> = {
				...dayData,
				formattedDate: hourly
					? formatBucketLabel(slot, "hourMinute")
					: formatBucketLabel(slot, "monthDay"),
			};

			// Add each series' selected metric as a separate property for stacking
			pickBreakdown(dayData, groupBy).forEach((item) => {
				switch (breakdownField) {
					case "cost":
						result[item.id] = item.cost;
						break;
					case "tokens":
						result[item.id] = item.totalTokens;
						break;
					case "requests":
					default:
						result[item.id] = item.requestCount;
						break;
				}
			});

			return result;
		}
		return {
			date: slot,
			formattedDate: hourly
				? formatBucketLabel(slot, "hourMinute")
				: formatBucketLabel(slot, "monthDay"),
			requestCount: 0,
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			cost: 0,
			modelBreakdown: [],
			apiKeyBreakdown: [],
			userBreakdown: [],
		};
	});

	const uniqueSeries = getUniqueSeries(data.activity, groupBy);
	const visibleSeries = showAllModels ? uniqueSeries : uniqueSeries.slice(0, 7);

	// Models are keyed by their own id, so only the labelled dimensions need a
	// lookup table.
	const seriesLabelById = new Map<string, string>();
	data.activity.forEach((day) => {
		pickBreakdown(day, groupBy).forEach((item) => {
			if (item.label && !seriesLabelById.has(item.id)) {
				seriesLabelById.set(item.id, item.label);
			}
		});
	});
	const getSeriesLabel = (id: string) => seriesLabelById.get(id) ?? id;

	return (
		<ChartFrame
			title={cardTitle}
			description={
				<>
					Stacked {seriesNoun} {breakdownField} over {periodLabel}
					{selectedProject && (
						<span className="block mt-1">Project: {selectedProject.name}</span>
					)}
				</>
			}
			action={
				<Select
					value={breakdownField}
					onValueChange={(value) =>
						setBreakdownField(value as "requests" | "cost" | "tokens")
					}
				>
					<SelectTrigger size="sm" className="w-[140px]">
						<SelectValue placeholder="Select metric" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="requests">Requests</SelectItem>
						<SelectItem value="cost">Cost</SelectItem>
						<SelectItem value="tokens">Tokens</SelectItem>
					</SelectContent>
				</Select>
			}
		>
			{uniqueSeries.length > 0 && (
				<div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
					{visibleSeries.map((id) => (
						<span key={id} className="inline-flex items-center gap-1.5">
							<span
								className="inline-block h-2.5 w-2.5 rounded-[2px]"
								style={{
									backgroundColor: getSeriesColor(id, uniqueSeries.indexOf(id)),
								}}
							/>
							<span className="max-w-[140px] truncate">
								{getSeriesLabel(id)}
							</span>
						</span>
					))}
					{uniqueSeries.length > 7 && (
						<button
							type="button"
							onClick={() => setShowAllModels((prev) => !prev)}
							className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
						>
							{showAllModels ? "Show less" : `+${uniqueSeries.length - 7} more`}
						</button>
					)}
				</div>
			)}

			<ResponsiveContainer width="100%" height={350}>
				<BarChart
					data={chartData}
					margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
					barCategoryGap="18%"
					barGap={3}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						vertical={false}
						stroke="#8d94a6"
						opacity={0.3}
					/>
					<XAxis
						dataKey="date"
						tickFormatter={(value: string) => {
							try {
								return hourly
									? formatBucketLabel(value, "hourMinute")
									: formatBucketLabel(value, "monthDay");
							} catch {
								return value;
							}
						}}
						stroke="#8d94a6"
						fontSize={12}
						tickLine={false}
						axisLine={false}
					/>
					<YAxis
						stroke="#8d94a6"
						fontSize={12}
						tickLine={false}
						axisLine={false}
						tickFormatter={(value: number) => {
							if (breakdownField === "cost") {
								return `$${Number(value).toFixed(2)}`;
							}
							return formatCompactNumber(value);
						}}
					/>
					<Tooltip
						content={
							<CustomTooltip
								breakdownField={breakdownField}
								hourly={hourly}
								groupBy={groupBy}
							/>
						}
						cursor={{ stroke: "currentColor", strokeOpacity: 0.15 }}
					/>

					{/* Generate a Bar for each unique series in the dataset */}
					{uniqueSeries.length > 0 ? (
						uniqueSeries.map((id, index) => (
							<Bar
								key={`${id}-${index}`}
								dataKey={id}
								name={getSeriesLabel(id)}
								stackId="series"
								fill={getSeriesColor(id, index)}
								radius={
									index === uniqueSeries.length - 1
										? [5, 5, 0, 0]
										: [0, 0, 0, 0]
								}
								maxBarSize={56}
								isAnimationActive={false}
							/>
						))
					) : (
						<Bar
							dataKey={
								breakdownField === "cost"
									? "cost"
									: breakdownField === "tokens"
										? "totalTokens"
										: "requestCount"
							}
							name={
								breakdownField === "cost"
									? "Cost"
									: breakdownField === "tokens"
										? "Tokens"
										: "Requests"
							}
							fill="#4f80ff"
							radius={[5, 5, 0, 0]}
							maxBarSize={56}
							isAnimationActive={false}
						/>
					)}
				</BarChart>
			</ResponsiveContainer>
		</ChartFrame>
	);
}
