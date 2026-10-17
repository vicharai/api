"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { TimeSeriesChart } from "@/components/ui/charts";
import { SimpleSelect, StatusBadge, Toolbar } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
	PageHeader,
	QueryState,
	Section,
	StatCard,
	StatGrid,
} from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { downloadCsv, formatUsd } from "@/lib/utils";

import { buildCsv } from "@llmgateway/shared";
import { Button } from "@llmgateway/shared/components";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Stats = ApiData<"/admin/global-stats">;
type Row = Stats["breakdown"][number];
type ProviderKey =
	ApiData<"/admin/global-stats/provider-keys">["providerKeys"][number];
type Range = "7d" | "30d" | "90d" | "365d" | "all";
type GroupBy = "model" | "source" | "mode" | "kind";
type ModelView = "mapping" | "canonical" | "provider";
type Mode = "total" | "credits" | "api-keys" | "unknown";
type Kind = "all" | "default" | "devpass" | "chat" | "unknown";

const columns: ColumnDef<Row>[] = [
	{
		accessorKey: "label",
		header: "Key",
		cell: ({ row }) => (
			<span className="font-mono text-xs">{row.original.label}</span>
		),
	},
	{
		accessorKey: "requestCount",
		header: "Requests",
		cell: ({ row }) => formatNumber(row.original.requestCount),
	},
	{
		accessorKey: "errorCount",
		header: "Errors",
		cell: ({ row }) => formatNumber(row.original.errorCount),
	},
	{
		accessorKey: "cacheCount",
		header: "Cached",
		cell: ({ row }) => formatNumber(row.original.cacheCount),
	},
	{
		accessorKey: "inputTokens",
		header: "Input",
		cell: ({ row }) => formatCompactNumber(row.original.inputTokens),
	},
	{
		accessorKey: "outputTokens",
		header: "Output",
		cell: ({ row }) => formatCompactNumber(row.original.outputTokens),
	},
	{
		accessorKey: "cost",
		header: "Cost",
		cell: ({ row }) => formatUsd(row.original.cost),
	},
];

const keyColumns: ColumnDef<ProviderKey>[] = [
	{
		accessorKey: "provider",
		header: "Key",
		cell: ({ row }) => (
			<div>
				<div className="font-medium">
					{row.original.provider}{" "}
					<span className="text-xs text-muted-foreground">
						{row.original.managed ? "platform" : "BYOK"}
					</span>
				</div>
				<code className="text-xs text-muted-foreground">
					{row.original.tokenMasked ?? row.original.id}
				</code>
			</div>
		),
	},
	{
		id: "org",
		header: "Owner",
		cell: ({ row }) =>
			row.original.organizationId ? (
				<Link
					href={`/organizations/${row.original.organizationId}` as Route}
					className="hover:underline"
				>
					{row.original.organizationName ?? row.original.organizationId}
				</Link>
			) : (
				(row.original.comment ?? "—")
			),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge status={row.original.status} />,
	},
	{
		accessorKey: "requestCount",
		header: "Requests",
		cell: ({ row }) => formatNumber(row.original.requestCount),
	},
	{
		accessorKey: "cost",
		header: "Cost",
		cell: ({ row }) => formatUsd(row.original.cost),
	},
];

function pivotBreakdown(stats: Stats) {
	const totals = new Map<string, number>();
	for (const p of stats.timeseriesBreakdown) {
		totals.set(p.key, (totals.get(p.key) ?? 0) + p.requestCount);
	}
	const top = [...totals.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([k]) => k);
	const labels = new Map(
		stats.timeseriesBreakdown.map((p) => [p.key, p.label] as const),
	);
	const rows = new Map<string, Record<string, number | string>>();
	for (const p of stats.timeseriesBreakdown) {
		const row = rows.get(p.date) ?? { date: p.date };
		const idx = top.indexOf(p.key);
		const key = idx === -1 ? "other" : `g${idx}`;
		row[key] = Number(row[key] ?? 0) + p.requestCount;
		rows.set(p.date, row);
	}
	const series = top.map((k, i) => ({
		key: `g${i}`,
		label: labels.get(k) ?? k,
	}));
	if (totals.size > top.length) {
		series.push({ key: "other", label: "Other" });
	}
	return {
		rows: [...rows.values()].sort((a, b) =>
			String(a.date).localeCompare(String(b.date)),
		),
		series,
	};
}

export function UsagePage() {
	const api = useApi();
	const [range, setRange] = useState<Range>("30d");
	const [groupBy, setGroupBy] = useState<GroupBy>("model");
	const [modelView, setModelView] = useState<ModelView>("canonical");
	const [mode, setMode] = useState<Mode>("total");
	const [kind, setKind] = useState<Kind>("all");
	const stats = api.useQuery("get", "/admin/global-stats", {
		params: { query: { range, groupBy, modelView, mode, kind } },
	});
	const keys = api.useQuery("get", "/admin/global-stats/provider-keys", {
		params: { query: { range, mode, kind } },
	});

	function exportCsv() {
		if (!stats.data) {
			return;
		}
		downloadCsv(
			`usage-${groupBy}-${range}.csv`,
			buildCsv(
				[
					"key",
					"label",
					"requests",
					"errors",
					"cached",
					"inputTokens",
					"outputTokens",
					"totalTokens",
					"cost",
				],
				stats.data.breakdown.map((r) => [
					r.key,
					r.label,
					r.requestCount,
					r.errorCount,
					r.cacheCount,
					r.inputTokens,
					r.outputTokens,
					r.totalTokens,
					r.cost,
				]),
			),
		);
	}

	return (
		<>
			<PageHeader
				title="Usage"
				description="Platform-wide traffic and inference cost from the hourly aggregates."
				actions={
					<Button size="sm" variant="outline" onClick={exportCsv}>
						<Download /> Export CSV
					</Button>
				}
			/>
			<Toolbar>
				<SimpleSelect
					value={range}
					onChange={setRange}
					options={[
						{ value: "7d", label: "7 days" },
						{ value: "30d", label: "30 days" },
						{ value: "90d", label: "90 days" },
						{ value: "365d", label: "365 days" },
						{ value: "all", label: "All time" },
					]}
				/>
				<SimpleSelect
					value={groupBy}
					onChange={setGroupBy}
					options={[
						{ value: "model", label: "By model" },
						{ value: "source", label: "By source" },
						{ value: "mode", label: "By billing mode" },
						{ value: "kind", label: "By org kind" },
					]}
				/>
				{groupBy === "model" ? (
					<SimpleSelect
						value={modelView}
						onChange={setModelView}
						options={[
							{ value: "canonical", label: "Canonical model" },
							{ value: "mapping", label: "Provider mapping" },
							{ value: "provider", label: "Provider" },
						]}
					/>
				) : null}
				<SimpleSelect
					value={mode}
					onChange={setMode}
					options={[
						{ value: "total", label: "All billing modes" },
						{ value: "credits", label: "Credits" },
						{ value: "api-keys", label: "BYOK" },
						{ value: "unknown", label: "Unknown" },
					]}
				/>
				<SimpleSelect
					value={kind}
					onChange={setKind}
					options={[
						{ value: "all", label: "All org kinds" },
						{ value: "default", label: "Default" },
						{ value: "devpass", label: "DevPass" },
						{ value: "chat", label: "Chat" },
						{ value: "unknown", label: "Unknown" },
					]}
				/>
			</Toolbar>
			<QueryState query={stats} rows={8}>
				{(s) => {
					const breakdown = pivotBreakdown(s);
					return (
						<div className="space-y-4">
							<StatGrid>
								<StatCard
									label="Requests"
									value={formatCompactNumber(s.totals.requestCount)}
									hint={`${formatCompactNumber(s.totals.errorCount)} errors · ${formatCompactNumber(s.totals.cacheCount)} cached`}
								/>
								<StatCard
									label="Tokens"
									value={formatCompactNumber(s.totals.totalTokens)}
									hint={`${formatCompactNumber(s.totals.inputTokens)} in · ${formatCompactNumber(s.totals.outputTokens)} out`}
								/>
								<StatCard label="Cost" value={formatUsd(s.totals.cost)} />
								<StatCard
									label="Cost split"
									value={
										<span className="text-sm">
											{formatUsd(s.totals.inputCost)} in ·{" "}
											{formatUsd(s.totals.outputCost)} out
										</span>
									}
									hint={`${formatUsd(s.totals.cachedInputCost)} cached input`}
								/>
							</StatGrid>
							<div className="grid gap-4 lg:grid-cols-2">
								<Section title="Cost per day">
									<TimeSeriesChart
										data={s.timeseries}
										xKey="date"
										kind="bar"
										series={[{ key: "cost", label: "Cost" }]}
										valueFormatter={(v) => formatUsd(v)}
									/>
								</Section>
								<Section title="Requests by group">
									<TimeSeriesChart
										data={breakdown.rows}
										xKey="date"
										kind="area"
										stacked
										series={breakdown.series}
									/>
								</Section>
							</div>
							<Section title="Breakdown">
								<DataTable
									columns={columns}
									data={s.breakdown}
									getRowId={(r) => r.key}
								/>
							</Section>
						</div>
					);
				}}
			</QueryState>
			<Section title="Provider keys" className="mt-4">
				<QueryState query={keys}>
					{(data) => (
						<DataTable
							columns={keyColumns}
							data={data.providerKeys}
							getRowId={(k) => k.id}
							empty="No key usage."
						/>
					)}
				</QueryState>
			</Section>
		</>
	);
}
