"use client";

import Link from "next/link";
import { useState } from "react";

import { Pager, SimpleSelect, Toolbar, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, Section } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime, formatUsd } from "@/lib/utils";

import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Row = ApiData<"/admin/limit-hits">["organizations"][number];
type LimitType =
	| "all"
	| "rpm"
	| "spend_cap_daily"
	| "spend_cap_monthly"
	| "topup_velocity"
	| "concurrency";

const PAGE = 50;

const columns: ColumnDef<Row>[] = [
	{
		id: "org",
		header: "Organization",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<Link
					href={
						`/organizations/${row.original.organizationId}?tab=limits` as Route
					}
					className="font-medium hover:underline"
				>
					{row.original.organizationName}
				</Link>
				<div className="text-xs text-muted-foreground">
					{row.original.billingEmail ?? "—"} · {row.original.plan}
					{row.original.kind !== "default" ? ` · ${row.original.kind}` : ""}
				</div>
			</div>
		),
	},
	{
		accessorKey: "totalHits",
		header: "Hits",
		cell: ({ row }) => (
			<span className="font-medium tabular-nums">
				{formatNumber(row.original.totalHits)}
			</span>
		),
	},
	{
		id: "split",
		header: "Breakdown",
		cell: ({ row }) => {
			const r = row.original;
			return (
				<div className="flex flex-wrap gap-1">
					{r.rpmHits ? (
						<Tone tone="warn">rpm {formatNumber(r.rpmHits)}</Tone>
					) : null}
					{r.concurrencyHits ? (
						<Tone tone="warn">
							concurrency {formatNumber(r.concurrencyHits)}
						</Tone>
					) : null}
					{r.spendCapHits ? (
						<Tone tone="bad">spend cap {formatNumber(r.spendCapHits)}</Tone>
					) : null}
					{r.topUpHits ? (
						<Tone tone="bad">
							top-up {formatNumber(r.topUpHits)} ({formatUsd(r.topUpBlockedUsd)}
							)
						</Tone>
					) : null}
				</div>
			);
		},
	},
	{
		accessorKey: "daysActive",
		header: "Days",
		cell: ({ row }) => formatNumber(row.original.daysActive),
	},
	{
		accessorKey: "lastHitAt",
		header: "Last hit",
		cell: ({ row }) => formatDateTime(row.original.lastHitAt),
	},
];

export function LimitHits() {
	const api = useApi();
	const [days, setDays] = useState<"7" | "30" | "90">("7");
	const [limitType, setLimitType] = useState<LimitType>("all");
	const [offset, setOffset] = useState(0);
	const hits = api.useQuery("get", "/admin/limit-hits", {
		params: {
			query: {
				days: Number(days),
				limitType: limitType === "all" ? undefined : limitType,
				limit: PAGE,
				offset,
			},
		},
	});

	return (
		<Section
			title="Limit hits"
			description="Organizations whose requests or top-ups were rejected by rate limits, spend caps or velocity checks. Often a sign a trust tier needs raising."
		>
			<Toolbar>
				<SimpleSelect
					value={days}
					onChange={(v) => {
						setDays(v);
						setOffset(0);
					}}
					options={[
						{ value: "7", label: "7 days" },
						{ value: "30", label: "30 days" },
						{ value: "90", label: "90 days" },
					]}
				/>
				<SimpleSelect
					value={limitType}
					onChange={(v) => {
						setLimitType(v);
						setOffset(0);
					}}
					options={[
						{ value: "all", label: "All limits" },
						{ value: "rpm", label: "Requests per minute" },
						{ value: "concurrency", label: "Concurrency" },
						{ value: "spend_cap_daily", label: "Daily spend cap" },
						{ value: "spend_cap_monthly", label: "Monthly spend cap" },
						{ value: "topup_velocity", label: "Top-up velocity" },
					]}
				/>
			</Toolbar>
			<QueryState query={hits}>
				{(data) => (
					<>
						<DataTable
							columns={columns}
							data={data.organizations}
							getRowId={(r) => r.organizationId}
							empty="No limit hits."
						/>
						<Pager
							offset={offset}
							limit={PAGE}
							total={data.total}
							onChange={setOffset}
						/>
					</>
				)}
			</QueryState>
		</Section>
	);
}
