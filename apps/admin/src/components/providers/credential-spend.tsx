"use client";

import { useState } from "react";

import {
	ORG_WINDOWS,
	type OrgWindow,
} from "@/components/organizations/detail/shared";
import { TimeSeriesChart } from "@/components/ui/charts";
import { SimpleSelect, StatusBadge, Toolbar } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, Section } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatUsd } from "@/lib/utils";

import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";

type Spend = ApiData<"/admin/provider-credentials/spend">;
type Key = Spend["keys"][number];

const columns: ColumnDef<Key>[] = [
	{
		accessorKey: "provider",
		header: "Provider",
		cell: ({ row }) => (
			<div>
				<div className="font-medium">{row.original.provider}</div>
				<code className="text-xs text-muted-foreground">
					{row.original.maskedToken}
				</code>
			</div>
		),
	},
	{
		accessorKey: "comment",
		header: "Note",
		cell: ({ row }) => row.original.comment ?? "—",
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge status={row.original.status} />,
	},
	{
		accessorKey: "totalRequests",
		header: "Requests",
		cell: ({ row }) => formatNumber(row.original.totalRequests),
	},
	{
		accessorKey: "totalTokens",
		header: "Tokens",
		cell: ({ row }) => formatCompactNumber(Number(row.original.totalTokens)),
	},
	{
		accessorKey: "totalCost",
		header: "Cost",
		cell: ({ row }) => formatUsd(row.original.totalCost),
	},
	{
		id: "usage",
		header: "Lifetime usage",
		cell: ({ row }) =>
			`${formatUsd(row.original.usage)}${row.original.usageLimit ? ` / ${formatUsd(row.original.usageLimit)}` : ""}`,
	},
];

/** Pivots per-key spend into one row per bucket with a series per key (top 5). */
function pivot(s: Spend) {
	const top = [...s.keys].sort((a, b) => b.totalCost - a.totalCost).slice(0, 5);
	const index = new Map(top.map((k, i) => [k.id, `k${i}`]));
	const rows = s.buckets.map((timestamp) => {
		const row: Record<string, number | string> = { timestamp };
		for (const key of index.values()) {
			row[key] = 0;
		}
		row.other = 0;
		return row;
	});
	const byTs = new Map(rows.map((r) => [r.timestamp as string, r]));
	for (const point of s.data) {
		const row = byTs.get(point.timestamp);
		if (row) {
			const key = index.get(point.providerKeyId) ?? "other";
			row[key] = Number(row[key]) + point.cost;
		}
	}
	const series = top.map((k, i) => ({
		key: `k${i}`,
		label: `${k.provider} ${k.comment ?? k.maskedToken}`,
	}));
	if (s.keys.length > top.length) {
		series.push({ key: "other", label: "Other" });
	}
	return { rows, series };
}

export function CredentialSpend() {
	const api = useApi();
	const [range, setRange] = useState<OrgWindow>("7d");
	const spend = api.useQuery("get", "/admin/provider-credentials/spend", {
		params: { query: { window: range } },
	});

	return (
		<Section title="Spend by platform credential">
			<Toolbar>
				<SimpleSelect value={range} onChange={setRange} options={ORG_WINDOWS} />
			</Toolbar>
			<QueryState query={spend}>
				{(s) => {
					const { rows, series } = pivot(s);
					return (
						<div className="space-y-4">
							<TimeSeriesChart
								data={rows}
								xKey="timestamp"
								kind="bar"
								stacked
								hourly={s.bucket === "hour"}
								series={series}
								valueFormatter={(v) => formatUsd(v)}
							/>
							<DataTable
								columns={columns}
								data={s.keys}
								getRowId={(k) => k.id}
							/>
						</div>
					);
				}}
			</QueryState>
		</Section>
	);
}
