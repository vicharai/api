"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
	ChartTooltipHeading,
	ChartTooltipShell,
} from "@/components/shared/chart-tooltip";
import { ChartContainer, ChartTooltip } from "@/lib/components/chart";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { cn } from "@/lib/utils";

import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import {
	aggregateCostByModel,
	currencyFormatter,
	type ActivityRow,
	type ChartMetric,
} from "./chart-helpers";

import type { ChartConfig } from "@/lib/components/chart";
import type { TooltipProps } from "recharts";

const metricConfigs: Record<ChartMetric, ChartConfig> = {
	cost: { cost: { label: "Cost ($)", color: "#7c3aed" } },
	requestCount: {
		requestCount: { label: "Requests", color: "#7c3aed" },
	},
	totalTokens: { totalTokens: { label: "Tokens", color: "#7c3aed" } },
};

const metricTabs: { key: ChartMetric; label: string }[] = [
	{ key: "cost", label: "Cost" },
	{ key: "requestCount", label: "Requests" },
	{ key: "totalTokens", label: "Tokens" },
];

interface CostByModelCardProps {
	activity: ActivityRow[];
	loading?: boolean;
	title?: string;
	description?: string;
}

export function CostByModelCard({
	activity,
	loading = false,
	title = "Cost by Model",
	description = "Top 20 models by cost for the selected period",
}: CostByModelCardProps) {
	const [activeMetric, setActiveMetric] = useState<ChartMetric>("cost");

	const data = useMemo(
		() => aggregateCostByModel(activity, "mapping"),
		[activity],
	);

	const config = metricConfigs[activeMetric];
	const dataKey = Object.keys(config)[0];

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
			</div>
			<SquirclePanel className="p-3 sm:p-4">
				{!loading && data.models.length > 0 && (
					<div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
						<span>
							Total Cost:{" "}
							<strong className="font-medium text-foreground">
								{currencyFormatter.format(data.totalCost)}
							</strong>
						</span>
						<span>
							Total Requests:{" "}
							<strong className="font-medium text-foreground">
								{formatNumber(data.totalRequests)}
							</strong>
						</span>
					</div>
				)}
				{loading ? (
					<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
						Loading…
					</div>
				) : data.models.length === 0 ? (
					<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
						No data for this time period
					</div>
				) : (
					<ChartContainer
						config={config}
						className="aspect-auto w-full"
						style={{ height: `${Math.max(300, data.models.length * 28)}px` }}
					>
						<BarChart
							data={data.models}
							layout="vertical"
							margin={{ left: 8, right: 8, top: 20, bottom: 4 }}
						>
							<CartesianGrid
								horizontal={false}
								strokeDasharray="3 3"
								stroke="#8d94a6"
								opacity={0.3}
							/>
							<YAxis
								dataKey="model"
								type="category"
								tickLine={false}
								axisLine={false}
								width={160}
								tickFormatter={(value: string) =>
									value.length > 24 ? `${value.slice(0, 22)}…` : value
								}
								className="text-xs"
							/>
							<XAxis
								type="number"
								tickLine={false}
								axisLine={false}
								tickFormatter={(value: number) => {
									if (activeMetric === "cost") {
										return `$${value >= 1 ? value.toFixed(2) : value.toFixed(4)}`;
									}
									return formatCompactNumber(value);
								}}
							/>
							<ChartTooltip
								cursor={{
									fill: "color-mix(in srgb, currentColor 15%, transparent)",
								}}
								content={(props: TooltipProps<number, string>) => {
									const item = props.payload?.[0]?.payload as
										{ model?: string } | undefined;
									const value = props.payload?.[0]?.value;
									if (!props.active || !item || value === undefined) {
										return null;
									}
									return (
										<ChartTooltipShell className="min-w-0">
											<ChartTooltipHeading>
												{item.model ?? String(props.label ?? "")}
											</ChartTooltipHeading>
											<p className="mt-1 text-sm font-medium tabular-nums">
												{formatValue(Number(value))}
											</p>
										</ChartTooltipShell>
									);
								}}
							/>
							<Bar
								dataKey={dataKey}
								fill={`var(--color-${dataKey})`}
								radius={[0, 5, 5, 0]}
								isAnimationActive={false}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</SquirclePanel>
		</SquircleSurface>
	);
}
