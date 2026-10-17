"use client";

import { Ban, Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { TagChips, TagFilter } from "@/components/annotations/tags-editor";
import { CreateOrganizationDialog } from "@/components/manage/create-organization-dialog";
import { OrgBulkToolbar } from "@/components/productivity/bulk-actions";
import {
	selectionColumn,
	useRowSelection,
} from "@/components/productivity/bulk-selection";
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
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useApi } from "@/lib/fetch-client";
import { downloadCsv, formatDate, formatUsd } from "@/lib/utils";

import { buildCsv } from "@llmgateway/shared";
import { Button, Input, Label } from "@llmgateway/shared/components";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import type { OrgRef } from "@/components/productivity/quick-action-dialogs";
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
	const windowMs = Number(value.replace("d", "")) * 86_400_000;
	return new Date(Date.now() - windowMs).toISOString();
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
				<TagChips tags={row.original.tags} />
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
	const [filters, setFilters] = useUrlFilters({
		q: "",
		sort: "createdAt",
		dir: "desc",
		offset: "0",
		window: "all",
		kind: "all",
		plan: "all",
		minSpend: "",
		tag: "",
	});
	const [query, setQuery] = useState(filters.q);
	const search = useDebouncedValue(query.trim());
	const sort = { id: filters.sort, desc: filters.dir === "desc" };
	const offset = Number(filters.offset) || 0;
	const setOffset = (next: number) => setFilters({ offset: String(next) });
	const usageWindow = filters.window as UsageWindow;
	const kind = filters.kind as "all" | "default" | "devpass" | "chat";
	const plan = filters.plan as "all" | "free" | "pro" | "enterprise";
	const minSpend = filters.minSpend;
	const selection = useRowSelection<OrgRef>();

	const orgs = api.useQuery("get", "/admin/organizations", {
		params: {
			query: {
				search: search || undefined,
				limit: PAGE_SIZE,
				offset,
				sortBy: sort.id as SortBy,
				sortOrder: sort.desc ? "desc" : "asc",
				from: windowFrom(usageWindow),
				tag: filters.tag || undefined,
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
						<CreateOrganizationDialog />
					</>
				}
			/>
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(v) => {
						setQuery(v);
						setFilters({ q: v.trim(), offset: "0" });
					}}
					placeholder="Name, email or ID"
				/>
				<SimpleSelect
					value={usageWindow}
					onChange={(v) => {
						setFilters({ window: v, offset: "0" });
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
					onChange={(v) => setFilters({ kind: v })}
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
					onChange={(v) => setFilters({ plan: v })}
					ariaLabel="Plan"
					options={[
						{ value: "all", label: "All plans" },
						{ value: "free", label: "Free" },
						{ value: "pro", label: "Pro" },
						{ value: "enterprise", label: "Enterprise" },
					]}
				/>
				<TagFilter
					targetType="organization"
					value={filters.tag}
					onChange={(tag) => setFilters({ tag, offset: "0" })}
				/>
				<Input
					className="h-9 w-36"
					type="number"
					min={0}
					placeholder="Min spend $"
					value={minSpend}
					onChange={(e) => setFilters({ minSpend: e.target.value })}
				/>
			</Toolbar>
			{filteredLocally ? (
				<p className="mb-2 text-xs text-muted-foreground">
					Kind, plan and minimum-spend filters apply to the current page. Sort
					by spend to see the biggest accounts first.
				</p>
			) : null}
			<OrgBulkToolbar selection={selection} />
			{orgsError ? (
				<ErrorState error={orgsError} />
			) : (
				<DataTable
					columns={[
						selectionColumn(selection, (o: Org) => ({
							id: o.id,
							name: o.name,
							status: o.status,
							credits: o.credits,
						})),
						...columns.map((c) => ({
							...c,
							enableSorting: SORTABLE.has(String(c.id)),
						})),
					]}
					data={rows}
					isLoading={orgs.isLoading}
					getRowId={(row) => row.id}
					sort={sort}
					onSortChange={(next) => {
						setFilters({
							sort: next.id,
							dir: next.desc ? "desc" : "asc",
							offset: "0",
						});
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
