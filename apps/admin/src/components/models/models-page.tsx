"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
	ErrorCell,
	MODE_OPTIONS,
	type StatsMode,
} from "@/components/providers/stats-shared";
import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
	Pager,
	SearchInput,
	SimpleSelect,
	StatusBadge,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { PageHeader, QueryState } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatMs, formatUsd } from "@/lib/utils";

import {
	Button,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@llmgateway/shared/components";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import { Verifications } from "./verifications";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Model = ApiData<"/admin/models">["models"][number];
type Mapping = ApiData<"/admin/model-provider-mappings">["mappings"][number];
type ModelSort =
	| "name"
	| "family"
	| "status"
	| "logsCount"
	| "totalCost"
	| "errorsCount"
	| "avgTimeToFirstToken"
	| "providerCount"
	| "updatedAt";
type MappingSort =
	| "modelId"
	| "providerId"
	| "logsCount"
	| "errorsCount"
	| "cost"
	| "avgTimeToFirstToken"
	| "updatedAt";

const PAGE = 50;
const TABS = ["models", "mappings", "verifications"] as const;
type Tab = (typeof TABS)[number];

function perMillion(price: string | null) {
	return price ? formatUsd(Number(price) * 1e6, true) : "—";
}

export function ModelsPage() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const tab = (TABS.find((t) => t === params.get("tab")) ?? "models") as Tab;

	return (
		<>
			<PageHeader
				title="Models"
				description="Model traffic, provider mappings and capability verifications."
			/>
			<Tabs
				value={tab}
				onValueChange={(v) =>
					router.replace(`${pathname}?tab=${v}` as Route, { scroll: false })
				}
			>
				<TabsList>
					<TabsTrigger value="models">Models</TabsTrigger>
					<TabsTrigger value="mappings">Mappings</TabsTrigger>
					<TabsTrigger value="verifications">Verifications</TabsTrigger>
				</TabsList>
				<TabsContent value="models" className="mt-4">
					<ModelStats />
				</TabsContent>
				<TabsContent value="mappings" className="mt-4">
					<MappingStats />
				</TabsContent>
				<TabsContent value="verifications" className="mt-4">
					<Verifications />
				</TabsContent>
			</Tabs>
		</>
	);
}

const modelColumns: ColumnDef<Model>[] = [
	{
		id: "name",
		accessorKey: "name",
		header: "Model",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<Link
					href={`/models/${encodeURIComponent(row.original.id)}` as Route}
					className="font-medium hover:underline"
				>
					{row.original.name}
				</Link>
				<div className="font-mono text-xs text-muted-foreground">
					{row.original.id}
				</div>
			</div>
		),
	},
	{
		id: "family",
		accessorKey: "family",
		header: "Family",
	},
	{
		id: "status",
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<div className="flex gap-1">
				<StatusBadge status={row.original.status} />
				{row.original.free ? <Tone tone="info">free</Tone> : null}
				{row.original.stability !== "stable" ? (
					<Tone tone="warn">{row.original.stability}</Tone>
				) : null}
			</div>
		),
	},
	{ id: "providerCount", accessorKey: "providerCount", header: "Providers" },
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
			/>
		),
	},
	{
		id: "avgTimeToFirstToken",
		accessorKey: "avgTimeToFirstToken",
		header: "TTFT",
		cell: ({ row }) => formatMs(row.original.avgTimeToFirstToken),
	},
	{
		id: "price",
		header: "$/M in · out",
		enableSorting: false,
		cell: ({ row }) =>
			`${perMillion(row.original.inputPrice)} · ${perMillion(row.original.outputPrice)}`,
	},
	{
		id: "totalCost",
		accessorKey: "totalCost",
		header: "Cost",
		cell: ({ row }) => formatUsd(row.original.totalCost),
	},
];

function ModelStats() {
	const api = useApi();
	const router = useRouter();
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim());
	const [mode, setMode] = useState<StatsMode>("total");
	const [sort, setSort] = useState({ id: "logsCount", desc: true });
	const [offset, setOffset] = useState(0);
	const list = api.useQuery("get", "/admin/models", {
		params: {
			query: {
				search: search || undefined,
				mode,
				sortBy: sort.id as ModelSort,
				sortOrder: sort.desc ? "desc" : "asc",
				limit: PAGE,
				offset,
			},
		},
	});

	return (
		<>
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(v) => {
						setQuery(v);
						setOffset(0);
					}}
					placeholder="Model or family"
				/>
				<SimpleSelect value={mode} onChange={setMode} options={MODE_OPTIONS} />
				{list.data ? (
					<span className="text-sm text-muted-foreground">
						{formatCompactNumber(list.data.totalTokens)} tokens ·{" "}
						{formatUsd(list.data.totalCost)}
					</span>
				) : null}
			</Toolbar>
			<QueryState query={list}>
				{(data) => (
					<>
						<DataTable
							columns={modelColumns}
							data={data.models}
							getRowId={(m) => m.id}
							sort={sort}
							onSortChange={(s) => {
								setSort(s);
								setOffset(0);
							}}
							onRowClick={(m) =>
								router.push(`/models/${encodeURIComponent(m.id)}` as Route)
							}
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
		</>
	);
}

function MappingStats() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim());
	const [mode, setMode] = useState<StatsMode>("total");
	const [sort, setSort] = useState({ id: "logsCount", desc: true });
	const [offset, setOffset] = useState(0);
	const list = api.useQuery("get", "/admin/model-provider-mappings", {
		params: {
			query: {
				search: search || undefined,
				mode: mode,
				sortBy: sort.id as MappingSort,
				sortOrder: sort.desc ? "desc" : "asc",
				limit: PAGE,
				offset,
			},
		},
	});
	const verify = api.useMutation("post", "/admin/model-verifications", {
		onSuccess: () => {
			toast.success("Verification queued");
			void invalidate("/admin/model-verifications");
		},
	});

	const columns: ColumnDef<Mapping>[] = [
		{
			id: "modelId",
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
			id: "providerId",
			accessorKey: "providerId",
			header: "Provider",
			cell: ({ row }) => (
				<Link
					href={`/providers/${row.original.providerId}` as Route}
					className="hover:underline"
				>
					{row.original.providerName}
				</Link>
			),
		},
		{
			id: "status",
			header: "Status",
			enableSorting: false,
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
			header: "TTFT",
			cell: ({ row }) => formatMs(row.original.avgTimeToFirstToken),
		},
		{
			id: "price",
			header: "$/M in · out",
			enableSorting: false,
			cell: ({ row }) =>
				`${perMillion(row.original.inputPrice)} · ${perMillion(row.original.outputPrice)}`,
		},
		{
			id: "cost",
			accessorKey: "cost",
			header: "Cost",
			cell: ({ row }) => formatUsd(row.original.cost),
		},
		{
			id: "actions",
			header: "",
			enableSorting: false,
			cell: ({ row }) => (
				<div className="flex justify-end">
					<ConfirmAction
						title="Verify mapping"
						description={`Runs the capability checks against ${row.original.providerId}/${row.original.modelId} with platform credentials.`}
						confirmLabel="Queue"
						requireReason={false}
						onConfirm={() =>
							verify.mutateAsync({ body: { mappingId: row.original.id } })
						}
					>
						<Button
							size="sm"
							variant="ghost"
							disabled={!can("POST", "/admin/model-verifications")}
						>
							<FlaskConical /> Verify
						</Button>
					</ConfirmAction>
				</div>
			),
		},
	];

	return (
		<>
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(v) => {
						setQuery(v);
						setOffset(0);
					}}
					placeholder="Model or provider"
				/>
				<SimpleSelect value={mode} onChange={setMode} options={MODE_OPTIONS} />
			</Toolbar>
			<QueryState query={list}>
				{(data) => (
					<>
						<DataTable
							columns={columns}
							data={data.mappings}
							getRowId={(m) => m.id}
							sort={sort}
							onSortChange={(s) => {
								setSort(s);
								setOffset(0);
							}}
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
		</>
	);
}
