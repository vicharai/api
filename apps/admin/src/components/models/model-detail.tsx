"use client";

import Link from "next/link";
import { useState } from "react";

import { MappingDetail } from "@/components/providers/provider-detail";
import {
	ErrorCell,
	HISTORY_WINDOWS,
	isHourly,
	MODE_OPTIONS,
	type HistoryWindow,
	type StatsMode,
} from "@/components/providers/stats-shared";
import { TimeSeriesChart } from "@/components/ui/charts";
import {
	SimpleSelect,
	StatusBadge,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
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
import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type ProviderRow = ApiData<"/admin/models/{modelId}">["providers"][number];

export function ModelDetail({ modelId }: { modelId: string }) {
	const api = useApi();
	const [range, setRange] = useState<HistoryWindow>("24h");
	const [mode, setMode] = useState<StatsMode>("total");
	const [provider, setProvider] = useState<string | null>(null);
	const path = { modelId };
	const detail = api.useQuery("get", "/admin/models/{modelId}", {
		params: { path, query: { window: range } },
	});
	const history = api.useQuery("get", "/admin/models/{modelId}/history", {
		params: { path, query: { window: range, mode } },
	});

	const columns: ColumnDef<ProviderRow>[] = [
		{
			accessorKey: "providerName",
			header: "Provider",
			cell: ({ row }) => (
				<Link
					href={`/providers/${row.original.providerId}` as Route}
					className="font-medium hover:underline"
					onClick={(e) => e.stopPropagation()}
				>
					{row.original.providerName}
				</Link>
			),
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
				/>
			),
		},
		{
			accessorKey: "avgTimeToFirstToken",
			header: "TTFT",
			cell: ({ row }) => formatMs(row.original.avgTimeToFirstToken),
		},
		{
			id: "cost",
			header: "Cost",
			cell: ({ row }) =>
				formatUsd(
					row.original.inputCost +
						row.original.outputCost +
						row.original.cachedInputCost,
				),
		},
		{
			id: "routing",
			header: "",
			cell: () => (
				<div className="flex justify-end">
					<Button asChild size="sm" variant="ghost">
						<Link
							href={`/routing?model=${encodeURIComponent(modelId)}` as Route}
							onClick={(e) => e.stopPropagation()}
						>
							Routing
						</Link>
					</Button>
				</div>
			),
		},
	];

	return (
		<QueryState query={detail} rows={6}>
			{(d) => (
				<>
					<PageHeader title={d.model.name} description={d.model.id}>
						<div className="flex flex-wrap gap-2">
							<StatusBadge status={d.model.status} />
							<Tone tone="muted">{d.model.family}</Tone>
							{d.model.free ? <Tone tone="info">free</Tone> : null}
							{d.model.stability !== "stable" ? (
								<Tone tone="warn">{d.model.stability}</Tone>
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
								value={formatNumber(d.model.logsCount)}
							/>
							<StatCard
								label="Errors"
								value={
									<ErrorCell
										errors={d.model.errorsCount}
										total={d.model.logsCount}
									/>
								}
								hint={`${d.model.upstreamErrorsCount} upstream · ${d.model.gatewayErrorsCount} gateway · ${d.model.clientErrorsCount} client`}
							/>
							<StatCard
								label="TTFT"
								value={formatMs(d.model.avgTimeToFirstToken)}
							/>
							<StatCard
								label="Finish reasons"
								value={
									<span className="text-sm">
										{formatNumber(d.model.completedCount)} ok ·{" "}
										{formatNumber(d.model.lengthLimitCount)} length ·{" "}
										{formatNumber(d.model.contentFilterCount)} filtered
									</span>
								}
								hint={`${formatNumber(d.model.toolCallsCount)} tool calls · ${formatNumber(d.model.canceledCount)} canceled`}
							/>
						</StatGrid>
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
												key: "errorsCount",
												label: "Errors",
												color: "var(--chart-error)",
											},
											{ key: "logsCount", label: "Requests" },
										]}
									/>
								)}
							</QueryState>
						</Section>
						<Section
							title="Providers"
							description="Click a provider for the mapping's pricing and history."
						>
							<DataTable
								columns={columns}
								data={d.providers}
								getRowId={(p) => p.providerId}
								onRowClick={(p) => setProvider(p.providerId)}
							/>
						</Section>
					</div>
					<Sheet
						open={provider !== null}
						onOpenChange={(v) => !v && setProvider(null)}
					>
						<SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
							<SheetHeader>
								<SheetTitle>
									{provider}/{modelId}
								</SheetTitle>
							</SheetHeader>
							{provider ? (
								<MappingDetail
									providerId={provider}
									modelId={modelId}
									region={null}
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
