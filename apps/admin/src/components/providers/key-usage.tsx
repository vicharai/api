"use client";

import Link from "next/link";
import { useState } from "react";

import { BarList, TimeSeriesChart } from "@/components/ui/charts";
import { SimpleSelect } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, StatCard } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatUsd } from "@/lib/utils";

import { formatNumber } from "@llmgateway/shared/number-format";

import { ErrorCell } from "./stats-shared";

import type { OrgWindow } from "@/components/organizations/detail/shared";
import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type ModelError =
	ApiData<"/admin/provider-keys/{providerKeyId}/model-errors">["models"][number];

const errorColumns: ColumnDef<ModelError>[] = [
	{
		accessorKey: "usedModel",
		header: "Model",
		cell: ({ row }) => (
			<span className="font-mono text-xs">{row.original.usedModel}</span>
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
		cell: ({ row }) => (
			<ErrorCell
				errors={row.original.errorCount}
				total={row.original.requestCount}
				upstream={row.original.upstreamErrorCount}
				gateway={row.original.gatewayErrorCount}
				client={row.original.clientErrorCount}
			/>
		),
	},
];

/** Spend and per-model errors for one provider key (platform or BYOK). */
export function KeyUsage({ providerKeyId }: { providerKeyId: string }) {
	const api = useApi();
	const [range, setRange] = useState<OrgWindow>("7d");
	const path = { providerKeyId };
	const spend = api.useQuery(
		"get",
		"/admin/provider-keys/{providerKeyId}/spend",
		{
			params: { path, query: { window: range } },
		},
	);
	const errors = api.useQuery(
		"get",
		"/admin/provider-keys/{providerKeyId}/model-errors",
		{ params: { path } },
	);

	return (
		<div className="space-y-4 p-4">
			<SimpleSelect
				value={range}
				onChange={setRange}
				options={[
					{ value: "1d", label: "24 hours" },
					{ value: "7d", label: "7 days" },
					{ value: "30d", label: "30 days" },
					{ value: "90d", label: "90 days" },
				]}
			/>
			<QueryState query={spend}>
				{(s) => (
					<>
						<div className="grid grid-cols-3 gap-3">
							<StatCard label="Cost" value={formatUsd(s.totalCost)} />
							<StatCard
								label="Requests"
								value={formatNumber(s.totalRequests)}
							/>
							<StatCard
								label="Errors"
								value={formatNumber(s.totalErrors)}
								tone={s.totalErrors ? "warn" : undefined}
							/>
						</div>
						<TimeSeriesChart
							data={s.data}
							xKey="timestamp"
							kind="bar"
							hourly={s.bucket === "hour"}
							series={[{ key: "cost", label: "Cost" }]}
							valueFormatter={(v) => formatUsd(v)}
							className="h-48"
						/>
						{s.organizations.length > 0 ? (
							<div className="space-y-2">
								<h3 className="text-sm font-medium">Top organizations</h3>
								<BarList
									items={s.organizations.slice(0, 10).map((o) => ({
										label: o.organizationName ?? o.organizationId,
										value: o.cost,
										href: `/organizations/${o.organizationId}` as Route,
										hint: `${formatNumber(o.requestCount)} req`,
									}))}
									formatter={(v) => formatUsd(v)}
								/>
							</div>
						) : null}
						{s.key.organizationId ? (
							<p className="text-xs text-muted-foreground">
								BYOK key of{" "}
								<Link
									href={`/organizations/${s.key.organizationId}` as Route}
									className="hover:underline"
								>
									{s.key.organizationId}
								</Link>
							</p>
						) : null}
					</>
				)}
			</QueryState>
			<QueryState query={errors}>
				{(e) => (
					<div className="space-y-2">
						<h3 className="text-sm font-medium">
							Errors by model since {new Date(e.since).toLocaleString()}
						</h3>
						<DataTable
							columns={errorColumns}
							data={e.models}
							getRowId={(m) => `${m.usedProvider}/${m.usedModel}`}
							empty="No traffic."
						/>
					</div>
				)}
			</QueryState>
		</div>
	);
}
