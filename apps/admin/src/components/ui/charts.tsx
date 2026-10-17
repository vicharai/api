"use client";

import Link from "next/link";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	XAxis,
	YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

import { formatCompactNumber } from "@llmgateway/shared/number-format";

import {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "./chart";

import type { Route } from "next";

export const SERIES_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
];

export interface Series {
	key: string;
	label: string;
	color?: string;
}

const shortDate = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
});
const shortTime = new Intl.DateTimeFormat("en-US", {
	hour: "numeric",
	minute: "2-digit",
});

export function formatTick(value: string, hourly = false): string {
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) {
		return value;
	}
	return hourly ? shortTime.format(d) : shortDate.format(d);
}

/**
 * Time series with one or more numeric series. `stacked` stacks areas/bars;
 * `valueFormatter` formats the Y axis and tooltip values.
 */
export function TimeSeriesChart<T extends object>({
	data,
	xKey,
	series,
	kind = "area",
	stacked = false,
	hourly = false,
	valueFormatter = formatCompactNumber,
	className,
}: {
	data: T[];
	xKey: keyof T & string;
	series: Series[];
	kind?: "area" | "bar" | "line";
	stacked?: boolean;
	hourly?: boolean;
	valueFormatter?: (value: number) => string;
	className?: string;
}) {
	const config: ChartConfig = Object.fromEntries(
		series.map((s, i) => [
			s.key,
			{
				label: s.label,
				color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length],
			},
		]),
	);

	const axes = (
		<>
			<CartesianGrid vertical={false} stroke="var(--chart-grid)" />
			<XAxis
				dataKey={xKey}
				tickLine={false}
				axisLine={false}
				minTickGap={24}
				tickFormatter={(v: string) => formatTick(v, hourly)}
			/>
			<YAxis
				tickLine={false}
				axisLine={false}
				width={56}
				tickFormatter={(v: number) => valueFormatter(v)}
			/>
			<ChartTooltip
				content={
					<ChartTooltipContent
						labelFormatter={(v) =>
							typeof v === "string"
								? new Date(v).toLocaleString("en-US", {
										dateStyle: "medium",
										timeStyle: hourly ? "short" : undefined,
									})
								: String(v)
						}
						formatter={(value, name) => (
							<div className="flex w-full items-center justify-between gap-3">
								<span className="text-muted-foreground">
									{config[String(name)]?.label ?? name}
								</span>
								<span className="font-mono tabular-nums">
									{valueFormatter(Number(value))}
								</span>
							</div>
						)}
					/>
				}
			/>
			{series.length > 1 ? (
				<ChartLegend content={<ChartLegendContent />} />
			) : null}
		</>
	);

	return (
		<ChartContainer
			config={config}
			className={cn("aspect-auto h-64 w-full", className)}
		>
			{kind === "bar" ? (
				<BarChart data={data}>
					{axes}
					{series.map((s) => (
						<Bar
							key={s.key}
							dataKey={s.key}
							fill={`var(--color-${s.key})`}
							stackId={stacked ? "a" : undefined}
							radius={stacked ? 0 : [3, 3, 0, 0]}
						/>
					))}
				</BarChart>
			) : kind === "line" ? (
				<LineChart data={data}>
					{axes}
					{series.map((s) => (
						<Line
							key={s.key}
							dataKey={s.key}
							stroke={`var(--color-${s.key})`}
							strokeWidth={2}
							dot={false}
							type="monotone"
						/>
					))}
				</LineChart>
			) : (
				<AreaChart data={data}>
					{axes}
					{series.map((s) => (
						<Area
							key={s.key}
							dataKey={s.key}
							stroke={`var(--color-${s.key})`}
							fill={`var(--color-${s.key})`}
							fillOpacity={0.15}
							strokeWidth={2}
							type="monotone"
							stackId={stacked ? "a" : undefined}
						/>
					))}
				</AreaChart>
			)}
		</ChartContainer>
	);
}

/** Horizontal top-N bars without a chart library; good for long labels. */
export function BarList({
	items,
	formatter = formatCompactNumber,
	max,
}: {
	items: { label: string; value: number; href?: string; hint?: string }[];
	formatter?: (value: number) => string;
	max?: number;
}) {
	const top = Math.max(max ?? 0, ...items.map((i) => i.value), 0) || 1;
	return (
		<ul className="space-y-1.5">
			{items.map((item) => {
				const label = (
					<span className="relative z-10 truncate">{item.label}</span>
				);
				return (
					<li key={item.label} className="flex items-center gap-3 text-sm">
						<div className="relative flex h-7 min-w-0 flex-1 items-center overflow-hidden rounded-md px-2">
							<div
								className="absolute inset-y-0 left-0 rounded-md bg-chart-1/15"
								style={{ width: `${Math.max(2, (item.value / top) * 100)}%` }}
							/>
							{item.href ? (
								<Link
									href={item.href as Route}
									className="relative z-10 truncate hover:underline"
								>
									{item.label}
								</Link>
							) : (
								label
							)}
							{item.hint ? (
								<span className="relative z-10 ml-2 truncate text-xs text-muted-foreground">
									{item.hint}
								</span>
							) : null}
						</div>
						<span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums">
							{formatter(item.value)}
						</span>
					</li>
				);
			})}
		</ul>
	);
}
