"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { SimpleSelect, StatusBadge, Toolbar } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { PageHeader, QueryState } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatMs, formatUsd } from "@/lib/utils";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@llmgateway/shared/components";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import { CredentialSpend } from "./credential-spend";
import { CredentialsManager } from "./credentials-manager";
import { ErrorCell, MODE_OPTIONS, type StatsMode } from "./stats-shared";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Provider = ApiData<"/admin/providers">["providers"][number];
type SortBy =
	| "name"
	| "status"
	| "logsCount"
	| "errorsCount"
	| "clientErrorsCount"
	| "cachedCount"
	| "totalCost"
	| "avgTimeToFirstToken"
	| "modelCount"
	| "updatedAt";

const TABS = ["stats", "credentials", "spend"] as const;
type Tab = (typeof TABS)[number];

const columns: ColumnDef<Provider>[] = [
	{
		id: "name",
		accessorKey: "name",
		header: "Provider",
		cell: ({ row }) => (
			<Link
				href={`/providers/${row.original.id}` as Route}
				className="flex items-center gap-2 font-medium hover:underline"
			>
				<span
					className="size-2.5 rounded-full"
					style={{ background: row.original.color ?? "var(--chart-5)" }}
				/>
				{row.original.name}
			</Link>
		),
	},
	{
		id: "status",
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge status={row.original.status} />,
	},
	{
		id: "modelCount",
		accessorKey: "modelCount",
		header: "Models",
	},
	{
		id: "logsCount",
		accessorKey: "logsCount",
		header: "Requests",
		cell: ({ row }) => formatNumber(row.original.logsCount),
	},
	{
		id: "errorsCount",
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
		id: "avgTimeToFirstToken",
		accessorKey: "avgTimeToFirstToken",
		header: "Avg TTFT",
		cell: ({ row }) => formatMs(row.original.avgTimeToFirstToken),
	},
	{
		id: "tokens",
		header: "Tokens",
		enableSorting: false,
		cell: ({ row }) => formatCompactNumber(row.original.totalTokens),
	},
	{
		id: "totalCost",
		accessorKey: "totalCost",
		header: "Cost",
		cell: ({ row }) => formatUsd(row.original.totalCost),
	},
];

export function ProvidersPage() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const tab = (TABS.find((t) => t === params.get("tab")) ?? "stats") as Tab;

	return (
		<>
			<PageHeader
				title="Providers"
				description="Upstream provider health and the platform credentials the gateway uses."
			/>
			<Tabs
				value={tab}
				onValueChange={(v) =>
					router.replace(`${pathname}?tab=${v}` as Route, { scroll: false })
				}
			>
				<TabsList>
					<TabsTrigger value="stats">Health</TabsTrigger>
					<TabsTrigger value="credentials">Credentials</TabsTrigger>
					<TabsTrigger value="spend">Credential spend</TabsTrigger>
				</TabsList>
				<TabsContent value="stats" className="mt-4">
					<ProviderStats />
				</TabsContent>
				<TabsContent value="credentials" className="mt-4">
					<CredentialsManager />
				</TabsContent>
				<TabsContent value="spend" className="mt-4">
					<CredentialSpend />
				</TabsContent>
			</Tabs>
		</>
	);
}

function ProviderStats() {
	const api = useApi();
	const router = useRouter();
	const [mode, setMode] = useState<StatsMode>("total");
	const [sort, setSort] = useState({ id: "logsCount", desc: true });
	const list = api.useQuery("get", "/admin/providers", {
		params: {
			query: {
				mode,
				sortBy: sort.id as SortBy,
				sortOrder: sort.desc ? "desc" : "asc",
			},
		},
	});

	return (
		<>
			<Toolbar>
				<SimpleSelect value={mode} onChange={setMode} options={MODE_OPTIONS} />
				{list.data ? (
					<span className="text-sm text-muted-foreground">
						{formatCompactNumber(list.data.totalTokens)} tokens ·{" "}
						{formatUsd(list.data.totalCost)} all time
					</span>
				) : null}
			</Toolbar>
			<QueryState query={list}>
				{(data) => (
					<DataTable
						columns={columns}
						data={data.providers}
						getRowId={(p) => p.id}
						sort={sort}
						onSortChange={setSort}
						onRowClick={(p) => router.push(`/providers/${p.id}` as Route)}
					/>
				)}
			</QueryState>
		</>
	);
}
