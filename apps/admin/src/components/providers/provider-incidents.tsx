"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { fillTimeGaps, TimeSeriesChart } from "@/components/ui/charts";
import { SimpleSelect, Toolbar, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
	JsonBlock,
	PageHeader,
	QueryState,
	Section,
	StatCard,
	StatGrid,
} from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatPercent } from "@/lib/utils";

import { Button, Label, Switch } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type {
	IncidentWindow,
	ProviderIncidents,
} from "@/lib/api/pending-paths";
import type { Route } from "next";

type ModelRow = ProviderIncidents["byModel"][number];

function rateTone(rate: number) {
	return rate >= 0.25 ? "bad" : rate >= 0.05 ? "warn" : "muted";
}

export function ProviderIncidentsView({ providerId }: { providerId: string }) {
	const api = useApi();
	const [range, setRange] = useState<IncidentWindow>("24h");
	const [live, setLive] = useState(true);
	const [model, setModel] = useState<string | null>(null);
	const incidents = api.useQuery(
		"get",
		"/admin/providers/{providerId}/incidents",
		{ params: { path: { providerId }, query: { window: range } } },
		{ refetchInterval: live ? 30_000 : false },
	);

	const columns: ColumnDef<ModelRow>[] = [
		{
			accessorKey: "modelId",
			header: "Model",
			cell: ({ row }) => (
				<span className="font-medium">{row.original.modelId}</span>
			),
		},
		{
			accessorKey: "errorRate",
			header: "Error rate",
			cell: ({ row }) => (
				<Tone tone={rateTone(row.original.errorRate)}>
					{formatPercent(row.original.errorRate * 100)}
				</Tone>
			),
		},
		{
			accessorKey: "requests",
			header: "Requests",
			cell: ({ row }) => formatNumber(row.original.requests),
		},
		{
			accessorKey: "upstreamErrors",
			header: "Upstream",
			cell: ({ row }) => formatNumber(row.original.upstreamErrors),
		},
		{
			accessorKey: "gatewayErrors",
			header: "Gateway",
			cell: ({ row }) => formatNumber(row.original.gatewayErrors),
		},
		{
			accessorKey: "clientErrors",
			header: "Client",
			cell: ({ row }) => formatNumber(row.original.clientErrors),
		},
	];

	return (
		<>
			<PageHeader
				title={`${providerId} incidents`}
				description="Error rate by model and class from the per-minute mapping history."
				actions={
					<Button asChild size="sm" variant="outline">
						<Link href={`/providers/${providerId}` as Route}>
							<ArrowLeft /> Provider
						</Link>
					</Button>
				}
			/>
			<Toolbar>
				<SimpleSelect
					value={range}
					onChange={setRange}
					options={[
						{ value: "1h", label: "1 hour" },
						{ value: "6h", label: "6 hours" },
						{ value: "24h", label: "24 hours" },
						{ value: "7d", label: "7 days" },
					]}
				/>
				<Label className="flex items-center gap-2 text-sm font-normal">
					<Switch checked={live} onCheckedChange={setLive} />
					Auto-refresh (30s)
				</Label>
			</Toolbar>
			<QueryState query={incidents} rows={6}>
				{(d) => (
					<div className="space-y-4">
						<StatGrid>
							<StatCard
								label="Error rate"
								value={formatPercent(d.summary.errorRate * 100)}
								tone={
									d.summary.errorRate >= 0.25
										? "bad"
										: d.summary.errorRate >= 0.05
											? "warn"
											: "good"
								}
								hint={`${formatNumber(d.summary.errors)} of ${formatNumber(d.summary.requests)}`}
							/>
							<StatCard
								label="Upstream errors"
								value={formatNumber(d.summary.upstreamErrors)}
							/>
							<StatCard
								label="Gateway errors"
								value={formatNumber(d.summary.gatewayErrors)}
							/>
							<StatCard
								label="Client errors"
								value={formatNumber(d.summary.clientErrors)}
							/>
						</StatGrid>
						<Section title="Errors over time">
							<TimeSeriesChart
								data={fillTimeGaps(d.timeseries, (timestamp) => ({
									timestamp,
									requests: 0,
									errors: 0,
									upstreamErrors: 0,
									gatewayErrors: 0,
									clientErrors: 0,
								}))}
								xKey="timestamp"
								kind="bar"
								stacked
								hourly={range !== "7d"}
								series={[
									{
										key: "upstreamErrors",
										label: "Upstream",
										color: "var(--chart-error)",
									},
									{
										key: "gatewayErrors",
										label: "Gateway",
										color: "var(--chart-4)",
									},
									{
										key: "clientErrors",
										label: "Client",
										color: "var(--chart-5)",
									},
								]}
							/>
						</Section>
						<Section
							title="By model"
							description="Click a model to see the error responses."
						>
							<DataTable
								columns={columns}
								data={d.byModel}
								getRowId={(m) => m.modelId}
								onRowClick={(m) => setModel(m.modelId)}
								empty="No traffic in this window."
							/>
						</Section>
						{model ? (
							<ErrorSamples providerId={providerId} modelId={model} />
						) : null}
					</div>
				)}
			</QueryState>
		</>
	);
}

function ErrorSamples({
	providerId,
	modelId,
}: {
	providerId: string;
	modelId: string;
}) {
	const api = useApi();
	const errors = api.useQuery("get", "/admin/unstable-mappings/errors", {
		params: {
			query: {
				model: `${providerId}/${modelId}`,
				provider: providerId,
				window: "24h",
				includeByok: "true",
			},
		},
	});
	return (
		<Section title={`Recent errors · ${modelId}`}>
			<QueryState query={errors}>
				{(data) =>
					data.errors.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No error samples in the last 24 hours.
						</p>
					) : (
						<div className="space-y-2">
							{data.errors.map((e, i) => (
								<div key={i} className="space-y-1 rounded-md border p-3">
									<div className="flex items-center gap-2 text-sm">
										<Tone tone="bad">{e.statusCode ?? "no status"}</Tone>
										{e.classification ? (
											<Tone tone="muted">{e.classification}</Tone>
										) : null}
										<span className="ml-auto tabular-nums">
											×{formatNumber(e.count)}
										</span>
									</div>
									{e.responseText ? <JsonBlock value={e.responseText} /> : null}
								</div>
							))}
						</div>
					)
				}
			</QueryState>
		</Section>
	);
}
