"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BarList, fillTimeGaps, TimeSeriesChart } from "@/components/ui/charts";
import { SimpleSelect, Toolbar, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
	PageHeader,
	QueryState,
	Section,
	StatCard,
	StatGrid,
} from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { downloadCsv, formatMs, formatPercent, formatUsd } from "@/lib/utils";

import { buildCsv } from "@llmgateway/shared";
import { Button, Label, Switch } from "@llmgateway/shared/components";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import type {
	LoadGroupBy,
	LoadOverview,
	LoadWindow,
} from "@/lib/api/admin-types";
import type { Route } from "next";

type Row = LoadOverview["breakdown"][number];
type Metric = "requests" | "tokens";

const WINDOWS: { value: LoadWindow; label: string }[] = [
	{ value: "1h", label: "1 hour" },
	{ value: "6h", label: "6 hours" },
	{ value: "24h", label: "24 hours" },
	{ value: "7d", label: "7 days" },
	{ value: "30d", label: "30 days" },
	{ value: "90d", label: "90 days" },
	{ value: "365d", label: "365 days" },
];

function rowHref(groupBy: LoadGroupBy, key: string): string | undefined {
	switch (groupBy) {
		case "model":
			return `/models/${encodeURIComponent(key)}`;
		case "provider":
			return `/providers/${key}`;
		case "organization":
			return `/organizations/${key}`;
		default:
			return undefined;
	}
}

export function LoadPage() {
	const api = useApi();
	const [range, setRange] = useState<LoadWindow>("24h");
	const [groupBy, setGroupBy] = useState<LoadGroupBy>("model");
	const [metric, setMetric] = useState<Metric>("requests");
	const [live, setLive] = useState(false);
	const load = api.useQuery(
		"get",
		"/admin/load/overview",
		{ params: { query: { window: range, groupBy, metric } } },
		{ refetchInterval: live ? 30_000 : false },
	);
	const hourly = ["1h", "6h", "24h"].includes(range);
	const latencyAvailable = groupBy === "model" || groupBy === "provider";

	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: "label",
			header: "Name",
			cell: ({ row }) => {
				const href = rowHref(groupBy, row.original.key);
				return href ? (
					<Link href={href as Route} className="font-medium hover:underline">
						{row.original.label}
					</Link>
				) : (
					<span className="font-medium">{row.original.label}</span>
				);
			},
		},
		{
			accessorKey: "requests",
			header: "Requests",
			cell: ({ row }) => formatNumber(row.original.requests),
		},
		{
			accessorKey: "errorRate",
			header: "Error rate",
			cell: ({ row }) => (
				<Tone
					tone={
						row.original.errorRate >= 0.1
							? "bad"
							: row.original.errorRate >= 0.02
								? "warn"
								: "muted"
					}
				>
					{formatPercent(row.original.errorRate * 100)}
				</Tone>
			),
		},
		{
			accessorKey: "totalTokens",
			header: "Tokens",
			cell: ({ row }) => formatCompactNumber(row.original.totalTokens),
		},
		{
			accessorKey: "avgDurationMs",
			header: "Duration",
			cell: ({ row }) => formatMs(row.original.avgDurationMs),
		},
		{
			accessorKey: "avgTtftMs",
			header: "TTFT",
			cell: ({ row }) => formatMs(row.original.avgTtftMs),
		},
		{
			accessorKey: "cost",
			header: "Cost",
			cell: ({ row }) => formatUsd(row.original.cost),
		},
	];

	function exportCsv(data: LoadOverview) {
		downloadCsv(
			`load-${groupBy}-${range}.csv`,
			buildCsv(
				[
					"key",
					"label",
					"requests",
					"errors",
					"errorRate",
					"totalTokens",
					"cost",
					"avgDurationMs",
					"avgTtftMs",
				],
				data.breakdown.map((r) => [
					r.key,
					r.label,
					r.requests,
					r.errors,
					r.errorRate,
					r.totalTokens,
					r.cost,
					r.avgDurationMs,
					r.avgTtftMs,
				]),
			),
		);
	}

	return (
		<>
			<PageHeader
				title="Gateway load"
				description="Throughput, latency and errors across the gateway from the aggregation tables."
				actions={
					load.data ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() => load.data && exportCsv(load.data)}
						>
							<Download /> Export CSV
						</Button>
					) : null
				}
			/>
			<Toolbar>
				<SimpleSelect value={range} onChange={setRange} options={WINDOWS} />
				<SimpleSelect
					value={groupBy}
					onChange={setGroupBy}
					options={[
						{ value: "model", label: "By model" },
						{ value: "provider", label: "By provider" },
						{ value: "organization", label: "By organization" },
						{ value: "project", label: "By project" },
						{ value: "apiKey", label: "By API key" },
					]}
				/>
				<SimpleSelect
					value={metric}
					onChange={setMetric}
					options={[
						{ value: "requests", label: "Requests" },
						{ value: "tokens", label: "Tokens" },
					]}
				/>
				<Label className="flex items-center gap-2 text-sm font-normal">
					<Switch checked={live} onCheckedChange={setLive} />
					Auto-refresh (30s)
				</Label>
			</Toolbar>
			<QueryState query={load} rows={8}>
				{(d) => {
					const series = fillTimeGaps(d.timeseries, (timestamp) => ({
						timestamp,
						requests: 0,
						errors: 0,
						totalTokens: 0,
						avgDurationMs: null,
						avgTtftMs: null,
					}));
					return (
						<div className="space-y-4">
							<StatGrid>
								<StatCard
									label="Requests / s"
									value={d.summary.requestsPerSecond.toFixed(2)}
									hint={`${formatNumber(d.summary.requests)} requests`}
								/>
								<StatCard
									label="Error rate"
									value={formatPercent(d.summary.errorRate * 100)}
									tone={
										d.summary.errorRate >= 0.1
											? "bad"
											: d.summary.errorRate >= 0.02
												? "warn"
												: "good"
									}
									hint={`${formatNumber(d.summary.errors)} errors · ${formatNumber(d.summary.clientErrors)} client`}
								/>
								<StatCard
									label="Avg duration"
									value={
										latencyAvailable ? formatMs(d.summary.avgDurationMs) : "—"
									}
									hint={
										latencyAvailable
											? `TTFT ${formatMs(d.summary.avgTtftMs)}`
											: "Latency is only tracked per model/provider"
									}
								/>
								<StatCard
									label="Tokens"
									value={formatCompactNumber(d.summary.totalTokens)}
									hint={`${formatUsd(d.summary.cost)} cost`}
								/>
							</StatGrid>
							<div className="grid gap-4 lg:grid-cols-2">
								<Section
									title={metric === "tokens" ? "Tokens" : "Requests and errors"}
								>
									<TimeSeriesChart
										data={series}
										xKey="timestamp"
										kind="area"
										hourly={hourly}
										series={
											metric === "tokens"
												? [{ key: "totalTokens", label: "Tokens" }]
												: [
														{ key: "requests", label: "Requests" },
														{
															key: "errors",
															label: "Errors",
															color: "var(--chart-error)",
														},
													]
										}
									/>
								</Section>
								<Section title="Latency">
									{latencyAvailable ? (
										<TimeSeriesChart
											data={series}
											xKey="timestamp"
											kind="line"
											hourly={hourly}
											series={[
												{ key: "avgDurationMs", label: "Duration" },
												{ key: "avgTtftMs", label: "TTFT" },
											]}
											valueFormatter={(v) => formatMs(v)}
										/>
									) : (
										<p className="text-sm text-muted-foreground">
											Latency is only aggregated per model and provider.
										</p>
									)}
								</Section>
							</div>
							<Section title={`Top ${groupBy}s`}>
								<BarList
									items={[...d.breakdown]
										.sort((a, b) =>
											metric === "tokens"
												? b.totalTokens - a.totalTokens
												: b.requests - a.requests,
										)
										.slice(0, 10)
										.map((r) => ({
											label: r.label,
											value: metric === "tokens" ? r.totalTokens : r.requests,
											href: rowHref(groupBy, r.key),
											hint: formatPercent(r.errorRate * 100),
										}))}
								/>
							</Section>
							<Section title="Breakdown">
								<DataTable
									columns={columns}
									data={d.breakdown}
									getRowId={(r) => r.key}
									empty="No traffic in this window."
								/>
							</Section>
						</div>
					);
				}}
			</QueryState>
		</>
	);
}
