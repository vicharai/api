"use client";

import { useCallback, useMemo, useState } from "react";
import {
	Bar,
	Line,
	ComposedChart,
	CartesianGrid,
	XAxis,
	YAxis,
} from "recharts";

import {
	ChartStyleSelector,
	useChartStyle,
} from "@/components/analytics/chart-style";
import {
	ChartTooltipHeading,
	ChartTooltipRow,
	ChartTooltipShell,
} from "@/components/shared/chart-tooltip";
import { ChartContainer, ChartTooltip } from "@/lib/components/chart";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { cn } from "@/lib/utils";

import {
	formatBucketLabel,
	formatBucketLabelWithZone,
	useDisplayTimeZone,
} from "@llmgateway/shared";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import {
	buildDimensionTimeseries,
	currencyFormatter,
	sanitizeKey,
	seriesColors,
	type ChartMetric,
	type DimensionRow,
} from "./chart-helpers";

import type { ChartConfig } from "@/lib/components/chart";
import type { TooltipProps } from "recharts";

const metricTabs: { key: ChartMetric; label: string }[] = [
	{ key: "cost", label: "Cost" },
	{ key: "requestCount", label: "Requests" },
	{ key: "totalTokens", label: "Tokens" },
];

interface DimensionUsageOverTimeCardProps {
	rows: DimensionRow[];
	loading?: boolean;
	title: string;
	description: string;
}

export function DimensionUsageOverTimeCard({
	rows,
	loading = false,
	title,
	description,
}: DimensionUsageOverTimeCardProps) {
	const { style } = useChartStyle();
	const [activeMetric, setActiveMetric] = useState<ChartMetric>("cost");
	const { timeZone: displayTimeZone } = useDisplayTimeZone();

	const series = useMemo(
		() => buildDimensionTimeseries(rows, activeMetric),
		[rows, activeMetric],
	);

	const { chartData, config, keyToLabel } = useMemo(() => {
		const labelMap = new Map<string, string>();
		const cfg: ChartConfig = {};
		series.series.forEach((s, index) => {
			const key = sanitizeKey(s.key);
			labelMap.set(key, s.label);
			cfg[key] = {
				label: s.label,
				color: seriesColors[index % seriesColors.length],
			};
		});
		const data = series.data.map((point) => {
			const row: Record<string, number | string> = {
				timestamp: point.timestamp,
			};
			for (const s of series.series) {
				row[sanitizeKey(s.key)] = 0;
			}
			for (const [key, value] of Object.entries(point.entries)) {
				row[sanitizeKey(key)] = Number(value[activeMetric] ?? 0);
			}
			return row;
		});
		return { chartData: data, config: cfg, keyToLabel: labelMap };
	}, [series, activeMetric]);

	const hasData = series.series.length > 0;

	const formatTimestamp = useCallback(
		(ts: string) => formatBucketLabel(ts, "monthDay"),
		[],
	);

	const formatValue = (value: number) =>
		activeMetric === "cost"
			? currencyFormatter.format(value)
			: formatNumber(value);

	return (
		<SquircleSurface className="border border-border p-1 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3 pb-2 pl-3.5 pr-2 pt-1.5">
				<div className="ml-1 min-w-0">
					<h2 className="text-sm font-medium text-foreground/80">{title}</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
				</div>
				<div className="flex flex-wrap items-center justify-end gap-2">
					<div className="inline-flex items-center rounded-lg border border-border bg-panel p-0.5">
						{metricTabs.map((tab) => (
							<button
								key={tab.key}
								type="button"
								className={cn(
									"rounded-md px-3 py-1 text-xs font-medium transition-colors",
									activeMetric === tab.key
										? "bg-card text-foreground shadow-xs"
										: "text-muted-foreground hover:text-foreground",
								)}
								onClick={() => setActiveMetric(tab.key)}
							>
								{tab.label}
							</button>
						))}
					</div>
					<ChartStyleSelector />
				</div>
			</div>
			<SquirclePanel className="p-3 sm:p-4">
				{loading ? (
					<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
						Loading…
					</div>
				) : !hasData ? (
					<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
						No data for this time period
					</div>
				) : (
					<>
						<ChartContainer
							config={config}
							className="aspect-auto h-[300px] w-full"
						>
							<ComposedChart
								data={chartData}
								margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
							>
								<CartesianGrid
									vertical={false}
									strokeDasharray="3 3"
									stroke="#8d94a6"
									opacity={0.3}
								/>
								<XAxis
									dataKey="timestamp"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
									minTickGap={40}
									tickFormatter={(value: string) => formatTimestamp(value)}
								/>
								<YAxis
									tickLine={false}
									axisLine={false}
									tickMargin={4}
									width={60}
									tickFormatter={(value: number) => {
										if (activeMetric === "cost") {
											return `$${value >= 1 ? value.toFixed(2) : value.toFixed(4)}`;
										}
										return formatCompactNumber(value);
									}}
								/>
								<ChartTooltip
									content={(props: TooltipProps<number, string>) => {
										const sortedPayload = [...(props.payload ?? [])]
											.filter((item) => Number(item.value ?? 0) > 0)
											.sort(
												(a, b) => Number(b.value ?? 0) - Number(a.value ?? 0),
											);
										if (!props.active || sortedPayload.length === 0) {
											return null;
										}
										return (
											<ChartTooltipShell>
												<ChartTooltipHeading>
													{formatBucketLabelWithZone(
														String(props.label ?? ""),
														"monthDayYear",
														displayTimeZone,
													)}
												</ChartTooltipHeading>
												<div className="mt-1 space-y-1">
													{sortedPayload.map((item) => (
														<ChartTooltipRow
															key={String(item.dataKey)}
															color={item.color}
															label={
																keyToLabel.get(String(item.name)) ??
																String(item.name)
															}
															value={formatValue(Number(item.value ?? 0))}
														/>
													))}
												</div>
											</ChartTooltipShell>
										);
									}}
								/>
								{series.series.map((s, index) => {
									const key = sanitizeKey(s.key);
									return style === "bar" ? (
										<Bar
											key={key}
											dataKey={key}
											stackId="1"
											fill={`var(--color-${key})`}
											radius={
												index === series.series.length - 1
													? [5, 5, 0, 0]
													: [0, 0, 0, 0]
											}
											isAnimationActive={false}
										/>
									) : (
										<Line
											key={key}
											dataKey={key}
											type="linear"
											stroke={`var(--color-${key})`}
											strokeWidth={2}
											dot={false}
											isAnimationActive={false}
										/>
									);
								})}
							</ComposedChart>
						</ChartContainer>
						<div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
							{series.series.map((s, i) => (
								<span
									key={s.key}
									className="inline-flex items-center gap-1.5 text-muted-foreground"
								>
									<span
										className="inline-block h-2.5 w-2.5 rounded-[2px]"
										style={{
											backgroundColor: seriesColors[i % seriesColors.length],
										}}
									/>
									<span className="truncate">{s.label}</span>
								</span>
							))}
						</div>
					</>
				)}
			</SquirclePanel>
		</SquircleSurface>
	);
}
