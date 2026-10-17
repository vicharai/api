"use client";

import { Ban, Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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
import { ErrorState, PageHeader } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { downloadCsv, formatDate, formatUsd } from "@/lib/utils";

import { buildCsv } from "@llmgateway/shared";
import { Button, Input, Label } from "@llmgateway/shared/components";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Org = ApiData<"/admin/organizations">["organizations"][number];
type SortBy =
	| "name"
	| "billingEmail"
	| "plan"
	| "credits"
	| "createdAt"
	| "status"
	| "totalCreditsAllTime"
	| "totalSpent"
	| "totalRequests"
	| "totalTokens";
type UsageWindow = "all" | "7d" | "30d" | "90d";

const PAGE_SIZE = 50;
const SORTABLE = new Set<string>([
	"name",
	"billingEmail",
	"plan",
	"credits",
	"createdAt",
	"status",
	"totalCreditsAllTime",
	"totalSpent",
	"totalRequests",
	"totalTokens",
]);

function windowFrom(value: UsageWindow): string | undefined {
	if (value === "all") {
		return undefined;
	}
	const days = Number(value.replace("d", ""));
	return new Date(Date.now() - days * 86_400_000).toISOString();
}

const columns: ColumnDef<Org>[] = [
	{
		id: "name",
		accessorKey: "name",
		header: "Organization",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<Link
					href={`/organizations/${row.original.id}` as Route}
					className="font-medium hover:underline"
					onClick={(e) => e.stopPropagation()}
				>
					{row.original.name}
				</Link>
				<div className="text-xs text-muted-foreground">
					{row.original.ownerEmail ?? row.original.billingEmail}
				</div>
			</div>
		),
	},
	{
		id: "plan",
		accessorKey: "plan",
		header: "Plan",
		cell: ({ row }) => (
			<div className="flex gap-1">
				<Tone tone={row.original.plan === "free" ? "muted" : "info"}>
					{row.original.plan}
				</Tone>
				{row.original.kind !== "default" ? (
					<Tone tone="muted">{row.original.kind}</Tone>
				) : null}
			</div>
		),
	},
	{
		id: "status",
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<div className="flex gap-1">
				<StatusBadge status={row.original.status} />
				{row.original.riskFlagged ? <Tone tone="bad">risk</Tone> : null}
			</div>
		),
	},
	{
		id: "credits",
		accessorKey: "credits",
		header: "Credits",
		cell: ({ row }) => (
			<span className="tabular-nums">{formatUsd(row.original.credits)}</span>
		),
	},
	{
		id: "totalCreditsAllTime",
		accessorKey: "totalCreditsAllTime",
		header: "Topped up",
		cell: ({ row }) => (
			<span className="tabular-nums">
				{formatUsd(row.original.totalCreditsAllTime)}
			</span>
		),
	},
	{
		id: "totalSpent",
		accessorKey: "totalSpent",
		header: "Spent",
		cell: ({ row }) => (
			<span className="tabular-nums">{formatUsd(row.original.totalSpent)}</span>
		),
	},
	{
		id: "totalRequests",
		accessorKey: "totalRequests",
		header: "Requests",
		cell: ({ row }) => (
			<span className="tabular-nums">
				{formatCompactNumber(row.original.totalRequests ?? 0)}
			</span>
		),
	},
	{
		id: "createdAt",
		accessorKey: "createdAt",
		header: "Created",
		cell: ({ row }) => formatDate(row.original.createdAt),
	},
];

export function OrganizationsList() {
	const api = useApi();
	const router = useRouter();
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim());
	const [sort, setSort] = useState<{ id: string; desc: boolean }>({
		id: "createdAt",
		desc: true,
	});
	const [offset, setOffset] = useState(0);
	const [usageWindow, setUsageWindow] = useState<UsageWindow>("all");
	const [kind, setKind] = useState<"all" | "default" | "devpass" | "chat">(
		"all",
	);
	const [plan, setPlan] = useState<"all" | "free" | "pro" | "enterprise">(
		"all",
	);
	const [minSpend, setMinSpend] = useState("");

	const orgs = api.useQuery("get", "/admin/organizations", {
		params: {
			query: {
				search: search || undefined,
				limit: PAGE_SIZE,
				offset,
				sortBy: sort.id as SortBy,
				sortOrder: sort.desc ? "desc" : "asc",
				from: windowFrom(usageWindow),
			},
		},
	});
	const orgsError: unknown = orgs.error;

	const minSpendValue = Number(minSpend) || 0;
	const rows = orgs.data?.organizations.filter(
		(o) =>
			(kind === "all" || o.kind === kind) &&
			(plan === "all" || o.plan === plan) &&
			Number(o.totalSpent ?? 0) >= minSpendValue,
	);
	const filteredLocally = kind !== "all" || plan !== "all" || minSpendValue > 0;

	function exportCsv() {
		if (!rows) {
			return;
		}
		downloadCsv(
			"organizations.csv",
			buildCsv(
				[
					"id",
					"name",
					"billingEmail",
					"ownerEmail",
					"kind",
					"plan",
					"status",
					"credits",
					"totalCreditsAllTime",
					"totalSpent",
					"totalRequests",
					"createdAt",
				],
				rows.map((o) => [
					o.id,
					o.name,
					o.billingEmail,
					o.ownerEmail ?? "",
					o.kind,
					o.plan,
					o.status ?? "",
					o.credits,
					o.totalCreditsAllTime ?? "",
					o.totalSpent ?? "",
					o.totalRequests ?? 0,
					o.createdAt,
				]),
			),
		);
	}

	return (
		<>
			<PageHeader
				title="Organizations"
				description={
					orgs.data
						? `${formatNumber(orgs.data.total)} organizations holding ${formatUsd(orgs.data.totalCredits)} in credits`
						: "All customer organizations."
				}
				actions={
					<>
						<Button variant="outline" size="sm" onClick={exportCsv}>
							<Download /> Export page
						</Button>
						<BulkBlock />
					</>
				}
			/>
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(v) => {
						setQuery(v);
						setOffset(0);
					}}
					placeholder="Name, email or ID"
				/>
				<SimpleSelect
					value={usageWindow}
					onChange={(v) => {
						setUsageWindow(v);
						setOffset(0);
					}}
					ariaLabel="Usage window"
					options={[
						{ value: "all", label: "Usage: all time" },
						{ value: "7d", label: "Usage: 7 days" },
						{ value: "30d", label: "Usage: 30 days" },
						{ value: "90d", label: "Usage: 90 days" },
					]}
				/>
				<SimpleSelect
					value={kind}
					onChange={setKind}
					ariaLabel="Kind"
					options={[
						{ value: "all", label: "All kinds" },
						{ value: "default", label: "Default" },
						{ value: "devpass", label: "DevPass" },
						{ value: "chat", label: "Chat" },
					]}
				/>
				<SimpleSelect
					value={plan}
					onChange={setPlan}
					ariaLabel="Plan"
					options={[
						{ value: "all", label: "All plans" },
						{ value: "free", label: "Free" },
						{ value: "pro", label: "Pro" },
						{ value: "enterprise", label: "Enterprise" },
					]}
				/>
				<Input
					className="h-9 w-36"
					type="number"
					min={0}
					placeholder="Min spend $"
					value={minSpend}
					onChange={(e) => setMinSpend(e.target.value)}
				/>
			</Toolbar>
			{filteredLocally ? (
				<p className="mb-2 text-xs text-muted-foreground">
					Kind, plan and minimum-spend filters apply to the current page. Sort
					by spend to see the biggest accounts first.
				</p>
			) : null}
			{orgsError ? (
				<ErrorState error={orgsError} />
			) : (
				<DataTable
					columns={columns.map((c) => ({
						...c,
						enableSorting: SORTABLE.has(String(c.id)),
					}))}
					data={rows}
					isLoading={orgs.isLoading}
					getRowId={(row) => row.id}
					sort={sort}
					onSortChange={(next) => {
						setSort(next);
						setOffset(0);
					}}
					onRowClick={(row) => router.push(`/organizations/${row.id}` as Route)}
				/>
			)}
			{orgs.data ? (
				<Pager
					offset={offset}
					limit={PAGE_SIZE}
					total={orgs.data.total}
					onChange={setOffset}
				/>
			) : null}
		</>
	);
}

function BulkBlock() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [pattern, setPattern] = useState("");
	const search = useDebouncedValue(pattern.trim(), 400);
	const preview = api.useQuery(
		"get",
		"/admin/organizations/bulk-block/preview",
		{ params: { query: { search } } },
		{ enabled: search.length >= 3 },
	);
	const bulk = api.useMutation("post", "/admin/organizations/bulk-block", {
		onSuccess: (res) => {
			toast.success(res.message);
			setPattern("");
			void invalidate("/admin/organizations");
		},
	});

	return (
		<ConfirmAction
			title="Bulk block organizations"
			description="Blocks every organization matching the search (name or billing email), cancels their subscriptions and signs out their members."
			confirmLabel={
				preview.data ? `Block ${preview.data.blockable}` : "Block matches"
			}
			destructive
			confirmDisabled={!preview.data || preview.data.blockable === 0}
			extra={
				<div className="space-y-2">
					<Label htmlFor="bulk-search">Match</Label>
					<Input
						id="bulk-search"
						placeholder="e.g. @spam-domain.com"
						value={pattern}
						onChange={(e) => setPattern(e.target.value)}
					/>
					{preview.data ? (
						<div className="space-y-1 text-sm">
							<p>
								{formatNumber(preview.data.matched)} matched ·{" "}
								<strong>
									{formatNumber(preview.data.blockable)} will be blocked
								</strong>{" "}
								· {formatNumber(preview.data.skipped)} skipped (max{" "}
								{formatNumber(preview.data.maxBulkSize)})
							</p>
							<ul className="max-h-40 overflow-auto rounded-md border p-2 text-xs">
								{preview.data.organizations.map((o) => (
									<li key={o.id} className="truncate">
										{o.name} — {o.billingEmail} ({o.plan}
										{o.status && o.status !== "active" ? `, ${o.status}` : ""})
									</li>
								))}
							</ul>
						</div>
					) : search.length >= 3 && preview.isLoading ? (
						<p className="text-sm text-muted-foreground">Previewing…</p>
					) : null}
				</div>
			}
			onConfirm={async () => {
				if (!preview.data) {
					return;
				}
				await bulk.mutateAsync({
					body: { search, expectedCount: preview.data.blockable },
				});
			}}
		>
			<Button
				variant="destructive"
				size="sm"
				disabled={!can("POST", "/admin/organizations/bulk-block")}
			>
				<Ban /> Bulk block
			</Button>
		</ConfirmAction>
	);
}
