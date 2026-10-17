"use client";

import Link from "next/link";
import { useState } from "react";

import {
	Pager,
	SearchInput,
	SimpleSelect,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, Section, StatCard } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime, formatUsd } from "@/lib/utils";

import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Failure = ApiData<"/admin/payment-failures">["failures"][number];

const PAGE = 50;
const ALL = "__all__";

const columns: ColumnDef<Failure>[] = [
	{
		accessorKey: "createdAt",
		header: "When",
		cell: ({ row }) => formatDateTime(row.original.createdAt),
	},
	{
		id: "org",
		header: "Organization",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<Link
					href={`/organizations/${row.original.organizationId}` as Route}
					className="font-medium hover:underline"
				>
					{row.original.organizationName}
				</Link>
				<div className="text-xs text-muted-foreground">
					{row.original.userEmail ?? row.original.billingEmail}
				</div>
			</div>
		),
	},
	{
		accessorKey: "amount",
		header: "Amount",
		cell: ({ row }) => formatUsd(row.original.amount),
	},
	{
		accessorKey: "declineCode",
		header: "Decline",
		cell: ({ row }) => (
			<Tone tone="bad">
				{row.original.declineCode ?? row.original.errorCode ?? "unknown"}
			</Tone>
		),
	},
	{
		accessorKey: "failureMessage",
		header: "Message",
		cell: ({ row }) => (
			<span className="block max-w-sm truncate text-xs text-muted-foreground">
				{row.original.failureMessage ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "source",
		header: "Source",
		cell: ({ row }) => row.original.source ?? "—",
	},
];

export function PaymentFailures() {
	const api = useApi();
	const [days, setDays] = useState<"7" | "30" | "90">("30");
	const [declineCode, setDeclineCode] = useState(ALL);
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim());
	const [offset, setOffset] = useState(0);
	const failures = api.useQuery("get", "/admin/payment-failures", {
		params: {
			query: {
				days: Number(days),
				declineCode: declineCode === ALL ? undefined : declineCode,
				search: search || undefined,
				limit: PAGE,
				offset,
			},
		},
	});

	return (
		<Section
			title="Payment failures"
			description="Declined top-ups and subscription charges."
		>
			{failures.data ? (
				<div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
					<StatCard
						label="Last 7 days"
						value={formatNumber(failures.data.summary.total7d)}
					/>
					<StatCard
						label="Last 30 days"
						value={formatNumber(failures.data.summary.total30d)}
					/>
					{failures.data.summary.byDeclineCode.slice(0, 2).map((d) => (
						<StatCard
							key={d.declineCode ?? "none"}
							label={d.declineCode ?? "no decline code"}
							value={formatNumber(d.count)}
						/>
					))}
				</div>
			) : null}
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(v) => {
						setQuery(v);
						setOffset(0);
					}}
					placeholder="Org or email"
				/>
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
					value={declineCode}
					onChange={(v) => {
						setDeclineCode(v);
						setOffset(0);
					}}
					options={[
						{ value: ALL, label: "All decline codes" },
						...(failures.data?.summary.byDeclineCode ?? [])
							.filter((d) => d.declineCode)
							.map((d) => ({
								value: d.declineCode ?? "",
								label: `${d.declineCode} (${d.count})`,
							})),
					]}
				/>
			</Toolbar>
			<QueryState query={failures}>
				{(data) => (
					<>
						<DataTable
							columns={columns}
							data={data.failures}
							getRowId={(f) => f.id}
							empty="No payment failures."
						/>
						<Pager
							offset={offset}
							limit={PAGE}
							total={data.totalCount}
							onChange={setOffset}
						/>
					</>
				)}
			</QueryState>
		</Section>
	);
}
