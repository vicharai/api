"use client";

import { Activity } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { TimeSeriesChart } from "@/components/ui/charts";
import {
	SimpleSelect,
	StatusBadge,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
	KeyValue,
	PageHeader,
	QueryState,
	Section,
	StatCard,
	StatGrid,
} from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatMs, formatUsd } from "@/lib/utils";

import {
	Button,
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@llmgateway/shared/components";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import {
	ErrorCell,
	HISTORY_WINDOWS,
	isHourly,
	MODE_OPTIONS,
	type HistoryWindow,
	type StatsMode,
} from "./stats-shared";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type ProviderModel = ApiData<"/admin/providers/{providerId}">["models"][number];

export function ProviderDetail({ providerId }: { providerId: string }) {
	const api = useApi();
	const [range, setRange] = useState<HistoryWindow>("24h");
	const [mode, setMode] = useState<StatsMode>("total");
	const [mapping, setMapping] = useState<ProviderModel | null>(null);
	const detail = api.useQuery("get", "/admin/providers/{providerId}", {
		params: { path: { providerId }, query: { window: range } },
	});
	const history = api.useQuery("get", "/admin/providers/{providerId}/history", {
		params: { path: { providerId }, query: { window: range, mode } },
	});

	const columns: ColumnDef<ProviderModel>[] = [
		{
			accessorKey: "modelId",
			header: "Model",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="font-medium">{row.original.modelId}</div>
					<div className="font-mono text-xs text-muted-foreground">
						{row.original.externalId}
						{row.original.region ? ` · ${row.original.region}` : ""}
					</div>
				</div>
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			accessorKey: "logsCount",
			header: "Requests",
			cell: ({ row }) => formatNumber(row.original.logsCount),
		},
		{
			accessorKey: "errorsCount",
			header: "Errors",
			cell: ({ row }) => (
				<ErrorCell
					errors={row.original.errorsCount}
					total={row.original.logsCount}
					upstream={row.original.upstreamErrorsCount}
					gateway={row.original.gatewayErrorsCount}
					client={row.original.clientErrorsCount}
				/>
			),
		},
		{
			accessorKey: "avgTimeToFirstToken",
			header: "TTFT",
			cell: ({ row }) => formatMs(row.original.avgTimeToFirstToken),
		},
		{
			accessorKey: "totalCost",
			header: "Cost",
			cell: ({ row }) => formatUsd(row.original.totalCost),
		},
	];

	return (
		<QueryState query={detail} rows={6}>
			{(d) => (
				<>
					<PageHeader
						title={d.provider.name}
						description={d.provider.description}
						actions={
							<Button asChild size="sm" variant="outline">
								<Link href={`/providers/${providerId}/incidents` as Route}>
									<Activity /> Incidents
								</Link>
							</Button>
						}
					>
						<div className="flex flex-wrap gap-2">
							<StatusBadge status={d.provider.status} />
							{d.provider.website ? (
								<a
									href={d.provider.website}
									target="_blank"
									rel="noreferrer"
									className="text-sm text-muted-foreground hover:underline"
								>
									{d.provider.website}
								</a>
							) : null}
						</div>
					</PageHeader>
					<div className="space-y-4">
						<Toolbar>
							<SimpleSelect
								value={range}
								onChange={setRange}
								options={HISTORY_WINDOWS}
							/>
							<SimpleSelect
								value={mode}
								onChange={setMode}
								options={MODE_OPTIONS}
							/>
						</Toolbar>
						<StatGrid>
							<StatCard
								label="Requests"
								value={formatNumber(d.provider.logsCount)}
							/>
							<StatCard
								label="Errors"
								value={
									<ErrorCell
										errors={d.provider.errorsCount}
										total={d.provider.logsCount}
									/>
								}
								hint={`${d.provider.upstreamErrorsCount} upstream · ${d.provider.gatewayErrorsCount} gateway · ${d.provider.clientErrorsCount} client`}
							/>
							<StatCard
								label="Avg TTFT"
								value={formatMs(d.provider.avgTimeToFirstToken)}
							/>
							<StatCard
								label="Cost"
								value={formatUsd(
									d.provider.inputCost +
										d.provider.outputCost +
										d.provider.cachedInputCost,
								)}
								hint={`${formatCompactNumber(d.provider.inputTokens + d.provider.outputTokens)} tokens`}
							/>
						</StatGrid>
						{d.airside ? (
							<Section title="Carrier settings">
								<KeyValue
									items={[
										{ label: "Company", value: d.airside.company.name },
										{ label: "Claim", value: d.airside.claimKind },
										{
											label: "Discount",
											value: `${d.airside.discountPercent}%`,
										},
										{ label: "Margin", value: `${d.airside.marginPercent}%` },
										{
											label: "Routing adjustment",
											value: String(d.airside.routingAdjustment),
										},
									]}
								/>
							</Section>
						) : null}
						<div className="grid gap-4 lg:grid-cols-2">
							<Section title="Requests and errors">
								<QueryState query={history} rows={4}>
									{(h) => (
										<TimeSeriesChart
											data={h.data}
											xKey="timestamp"
											kind="bar"
											stacked
											hourly={isHourly(range)}
											series={[
												{
													key: "upstreamErrorsCount",
													label: "Upstream",
													color: "var(--chart-error)",
												},
												{
													key: "gatewayErrorsCount",
													label: "Gateway",
													color: "var(--chart-4)",
												},
												{
													key: "clientErrorsCount",
													label: "Client",
													color: "var(--chart-5)",
												},
												{
													key: "logsCount",
													label: "Requests",
													color: "var(--chart-1)",
												},
											]}
										/>
									)}
								</QueryState>
							</Section>
							<Section title="Latency">
								<QueryState query={history} rows={4}>
									{(h) => (
										<TimeSeriesChart
											data={h.data}
											xKey="timestamp"
											kind="line"
											hourly={isHourly(range)}
											series={[
												{ key: "avgTtft", label: "TTFT" },
												{ key: "avgDuration", label: "Duration" },
											]}
											valueFormatter={(v) => formatMs(v)}
										/>
									)}
								</QueryState>
							</Section>
						</div>
						<Section
							title={`Models (${d.models.length})`}
							description="Click a mapping for its pricing and history."
						>
							<DataTable
								columns={columns}
								data={d.models}
								getRowId={(m) => m.mappingId}
								onRowClick={setMapping}
							/>
						</Section>
					</div>
					<Sheet
						open={mapping !== null}
						onOpenChange={(v) => !v && setMapping(null)}
					>
						<SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
							<SheetHeader>
								<SheetTitle>
									{providerId}/{mapping?.modelId}
									{mapping?.region ? (
										<Tone tone="muted" className="ml-2">
											{mapping.region}
										</Tone>
									) : null}
								</SheetTitle>
							</SheetHeader>
							{mapping ? (
								<MappingDetail
									providerId={providerId}
									modelId={mapping.modelId}
									region={mapping.region}
									range={range}
									mode={mode}
								/>
							) : null}
						</SheetContent>
					</Sheet>
				</>
			)}
		</QueryState>
	);
}

export function MappingDetail({
	providerId,
	modelId,
	region,
	range,
	mode,
}: {
	providerId: string;
	modelId: string;
	region: string | null;
	range: HistoryWindow;
	mode: StatsMode;
}) {
	const api = useApi();
	const path = { providerId, modelId };
	const detail = api.useQuery(
		"get",
		"/admin/providers/{providerId}/models/{modelId}",
		{ params: { path, query: { window: range, region: region ?? undefined } } },
	);
	const history = api.useQuery(
		"get",
		"/admin/providers/{providerId}/models/{modelId}/history",
		{
			params: {
				path,
				query: { window: range, region: region ?? undefined, mode },
			},
		},
	);

	return (
		<div className="space-y-4 p-4">
			<QueryState query={detail}>
				{({ mapping: m }) => (
					<>
						<KeyValue
							items={[
								{ label: "External ID", value: m.externalId },
								{ label: "Status", value: <StatusBadge status={m.status} /> },
								{ label: "Streaming", value: m.streaming ? "yes" : "no" },
								{
									label: "Input $/M",
									value: m.inputPrice
										? formatUsd(Number(m.inputPrice) * 1e6, true)
										: "—",
								},
								{
									label: "Output $/M",
									value: m.outputPrice
										? formatUsd(Number(m.outputPrice) * 1e6, true)
										: "—",
								},
								{
									label: "Cached $/M",
									value: m.cachedInputPrice
										? formatUsd(Number(m.cachedInputPrice) * 1e6, true)
										: "—",
								},
								{
									label: "Per request",
									value: m.requestPrice ? formatUsd(m.requestPrice, true) : "—",
								},
								{
									label: "Context",
									value: m.contextSize ? formatNumber(m.contextSize) : "—",
								},
								{
									label: "Max output",
									value: m.maxOutput ? formatNumber(m.maxOutput) : "—",
								},
							]}
						/>
						<div className="grid grid-cols-2 gap-3 md:grid-cols-3">
							<StatCard label="Requests" value={formatNumber(m.logsCount)} />
							<StatCard
								label="Errors"
								value={<ErrorCell errors={m.errorsCount} total={m.logsCount} />}
							/>
							<StatCard label="TTFT" value={formatMs(m.avgTimeToFirstToken)} />
							<StatCard
								label="Completed"
								value={formatNumber(m.completedCount)}
							/>
							<StatCard
								label="Length limit"
								value={formatNumber(m.lengthLimitCount)}
							/>
							<StatCard
								label="Content filter"
								value={formatNumber(m.contentFilterCount)}
							/>
						</div>
					</>
				)}
			</QueryState>
			<QueryState query={history} rows={4}>
				{(h) => (
					<TimeSeriesChart
						data={h.data}
						xKey="timestamp"
						kind="bar"
						stacked
						hourly={isHourly(range)}
						series={[
							{
								key: "errorsCount",
								label: "Errors",
								color: "var(--chart-error)",
							},
							{ key: "logsCount", label: "Requests" },
						]}
					/>
				)}
			</QueryState>
		</div>
	);
}
