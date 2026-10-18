"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ScoreMultipliersPanel } from "@/components/policies/discounts-panel";
import { RateLimitsPanel } from "@/components/policies/rate-limits-panel";
import { TimeSeriesChart } from "@/components/ui/charts";
import { SimpleSelect, Toolbar, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
	EmptyState,
	KeyValue,
	PageHeader,
	QueryState,
	Section,
} from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatMs, formatPercent, formatUsd } from "@/lib/utils";

import { SearchableSelect } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Analytics = ApiData<"/admin/routing-analytics">;
type MappingRow = Analytics["mappings"][number];
type SummaryRow = Analytics["summary"][number];

const mappingColumns: ColumnDef<MappingRow>[] = [
	{
		accessorKey: "providerName",
		header: "Provider",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<div className="font-medium">{row.original.providerName}</div>
				<div className="flex gap-1">
					{row.original.routable ? (
						<Tone tone="good">routable</Tone>
					) : (
						<Tone tone="bad">excluded</Tone>
					)}
					{row.original.stability !== "stable" ? (
						<Tone tone="warn">{row.original.stability}</Tone>
					) : null}
					{row.original.deactivatedAt ? (
						<Tone tone="muted">
							deactivates {row.original.deactivatedAt.slice(0, 10)}
						</Tone>
					) : null}
				</div>
			</div>
		),
	},
	{
		accessorKey: "price",
		header: "Selection price",
		cell: ({ row }) => (
			<span className="tabular-nums">
				{formatUsd(row.original.price * 1e6, true)}/M
				{row.original.discount ? (
					<span className="ml-1 text-xs text-muted-foreground">
						list {formatUsd(row.original.listPrice * 1e6, true)} −
						{formatPercent(row.original.discount * 100, 0)}
					</span>
				) : null}
			</span>
		),
	},
	{
		accessorKey: "routingAdjustment",
		header: "Adjustment",
		cell: ({ row }) =>
			row.original.routingAdjustment
				? formatPercent(row.original.routingAdjustment * 100)
				: "—",
	},
	{ accessorKey: "priority", header: "Priority" },
	{
		accessorKey: "cacheSupported",
		header: "Cache",
		cell: ({ row }) => (row.original.cacheSupported ? "yes" : "no"),
	},
	{
		accessorKey: "excludedReasons",
		header: "Excluded because",
		cell: ({ row }) => (
			<span className="text-xs text-muted-foreground">
				{row.original.excludedReasons.join(", ") || "—"}
			</span>
		),
	},
];

const summaryColumns: ColumnDef<SummaryRow>[] = [
	{ accessorKey: "providerId", header: "Provider" },
	{
		accessorKey: "score",
		header: "Score",
		cell: ({ row }) =>
			row.original.score === null ? "—" : row.original.score.toFixed(3),
	},
	{
		accessorKey: "requestCount",
		header: "Requests",
		cell: ({ row }) => formatNumber(row.original.requestCount),
	},
	{
		accessorKey: "uptime",
		header: "Uptime",
		cell: ({ row }) =>
			row.original.uptime === null ? "—" : formatPercent(row.original.uptime),
	},
	{
		accessorKey: "latency",
		header: "Latency",
		cell: ({ row }) => formatMs(row.original.latency),
	},
	{
		accessorKey: "throughput",
		header: "Throughput",
		cell: ({ row }) =>
			row.original.throughput === null
				? "—"
				: `${row.original.throughput.toFixed(1)} tok/s`,
	},
	{
		id: "breakdown",
		header: "Price · uptime · speed · latency · cache",
		cell: ({ row }) => {
			const b = row.original.breakdown;
			if (!b) {
				return "—";
			}
			return (
				<span className="font-mono text-xs">
					{[
						b.priceContribution,
						b.uptimeContribution,
						b.throughputContribution,
						b.latencyContribution,
						b.cacheContribution,
					]
						.map((v) => v.toFixed(2))
						.join(" · ")}
				</span>
			);
		},
	},
];

export function RoutingPage() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const api = useApi();
	const modelId = params.get("model") ?? "";
	const [range, setRange] = useState<"24h" | "3d" | "7d">("24h");
	const scope = api.useQuery("get", "/admin/unstable-mappings/scope-options");
	const analytics = api.useQuery(
		"get",
		"/admin/routing-analytics",
		{ params: { query: { modelId, window: range } } },
		{ enabled: Boolean(modelId) },
	);

	return (
		<>
			<PageHeader
				title="Routing"
				description="How the router scores providers for a model, plus the levers that change it."
			/>
			<div className="space-y-4">
				<Section title="Routing analytics">
					<Toolbar>
						<div className="w-72">
							<SearchableSelect
								value={modelId}
								placeholder="Choose a model"
								onValueChange={(v) =>
									router.replace(
										`${pathname}?model=${encodeURIComponent(v)}` as Route,
										{ scroll: false },
									)
								}
								options={(scope.data?.modelIds ?? []).map((m) => ({
									value: m.id,
									label: m.id,
								}))}
							/>
						</div>
						<SimpleSelect
							value={range}
							onChange={setRange}
							options={[
								{ value: "24h", label: "24 hours" },
								{ value: "3d", label: "3 days" },
								{ value: "7d", label: "7 days" },
							]}
						/>
					</Toolbar>
					{!modelId ? (
						<EmptyState>Pick a model to see its routing.</EmptyState>
					) : (
						<QueryState query={analytics} rows={6}>
							{(a) => <AnalyticsView data={a} />}
						</QueryState>
					)}
				</Section>
				<ScoreMultipliersPanel />
				<RateLimitsPanel />
			</div>
		</>
	);
}

function AnalyticsView({ data: a }: { data: Analytics }) {
	const providers = a.summary.map((s) => s.providerId);
	const scoreRows = a.hourly.map((h) => {
		const row: Record<string, number | string> = { hour: h.hour };
		providers.forEach((p, i) => {
			const entry = h.providers.find((x) => x.providerId === p);
			row[`p${i}`] = entry?.score ?? 0;
		});
		return row;
	});

	return (
		<div className="space-y-4">
			<KeyValue
				items={[
					{
						label: "Model",
						value: `${a.model.name ?? a.model.id} (${a.model.family})`,
					},
					{
						label: "Weights",
						value: Object.entries(a.config.effectiveWeights)
							.filter(([k]) => k !== "total")
							.map(([k, v]) => `${k} ${v.toFixed(2)}`)
							.join(" · "),
					},
					{
						label: "Exploration",
						value: formatPercent(a.config.thresholds.explorationRate * 100),
					},
					{
						label: "Elections",
						value: `${formatNumber(a.elections.requestCount)} requests · ${formatNumber(a.elections.scoredCount)} scored · ${a.elections.averageCandidateCount?.toFixed(1) ?? "—"} candidates avg`,
					},
				]}
			/>
			<h3 className="text-sm font-medium">Candidates</h3>
			<DataTable
				columns={mappingColumns}
				data={a.mappings}
				getRowId={(m) => m.providerId}
			/>
			<h3 className="text-sm font-medium">Scores in window</h3>
			<DataTable
				columns={summaryColumns}
				data={a.summary}
				getRowId={(s) => s.providerId}
				empty="No traffic in this window."
			/>
			{scoreRows.length > 0 ? (
				<>
					<h3 className="text-sm font-medium">Hourly score</h3>
					<TimeSeriesChart
						data={scoreRows}
						xKey="hour"
						kind="line"
						hourly
						series={providers.slice(0, 5).map((p, i) => ({
							key: `p${i}`,
							label: p,
						}))}
						valueFormatter={(v) => v.toFixed(2)}
					/>
				</>
			) : null}
			{a.exclusions.length > 0 ? (
				<>
					<h3 className="text-sm font-medium">Why candidates were excluded</h3>
					<ul className="space-y-1 text-sm">
						{a.exclusions.map((e) => (
							<li key={e.reason}>
								<span className="font-mono text-xs">{e.reason}</span> ·{" "}
								{formatNumber(e.excludedCount)}
							</li>
						))}
					</ul>
				</>
			) : null}
			{a.elections.byReason.length > 0 ? (
				<>
					<h3 className="text-sm font-medium">Selection reasons</h3>
					<ul className="space-y-1 text-sm">
						{a.elections.byReason.map((r) => (
							<li key={`${r.kind}-${r.selectionReason}`}>
								{r.selectionReason}{" "}
								<span className="text-xs text-muted-foreground">
									({r.kind})
								</span>{" "}
								· {formatNumber(r.requestCount)}
							</li>
						))}
					</ul>
				</>
			) : null}
		</div>
	);
}
