"use client";

import { Download, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { TagChips, TagFilter } from "@/components/annotations/tags-editor";
import { UserBulkToolbar } from "@/components/productivity/bulk-actions";
import {
	selectionColumn,
	useRowSelection,
} from "@/components/productivity/bulk-selection";
import {
	Pager,
	SearchInput,
	SimpleSelect,
	StatusBadge,
	Toolbar,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { ErrorState, PageHeader } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { exportRowsToCsv, type CsvColumn } from "@/lib/csv";
import { useApi, useFetchClient } from "@/lib/fetch-client";
import {
	errorMessage,
	formatDate,
	formatDateTime,
	formatUsd,
} from "@/lib/utils";

import { Button, Input, Label } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { UserRef } from "@/components/productivity/quick-action-dialogs";
import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type UserRow = ApiData<"/admin/users">["users"][number];
type SortBy = "createdAt" | "email" | "lastActiveAt" | "credits";

const PAGE = 50;
const SORTABLE = new Set<string>([
	"createdAt",
	"email",
	"lastActiveAt",
	"credits",
]);

const DEFAULTS = {
	q: "",
	tag: "",
	status: "all",
	risk: "all",
	verified: "all",
	balance: "all",
	from: "",
	to: "",
	sort: "createdAt",
	order: "desc",
	offset: "0",
};

const columns: ColumnDef<UserRow>[] = [
	{
		id: "email",
		accessorKey: "email",
		header: "Email",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<Link
					href={`/users/${row.original.id}` as Route}
					className="font-medium hover:underline"
					onClick={(e) => e.stopPropagation()}
				>
					{row.original.email}
				</Link>
				<div className="text-xs text-muted-foreground">
					{row.original.name ?? ""}
				</div>
				<TagChips tags={row.original.tags} />
			</div>
		),
	},
	{
		id: "status",
		header: "Status",
		enableSorting: false,
		cell: ({ row }) => (
			<div className="flex flex-wrap gap-1">
				<StatusBadge status={row.original.status} />
				<StatusBadge
					status={row.original.emailVerified ? "verified" : "unverified"}
				/>
				{row.original.riskStatus !== "none" ? (
					<StatusBadge status={row.original.riskStatus} />
				) : null}
			</div>
		),
	},
	{
		id: "orgs",
		header: "Organizations",
		enableSorting: false,
		cell: ({ row }) => (
			<div className="flex max-w-sm flex-wrap gap-x-3 gap-y-1">
				{row.original.organizations.map((org) => (
					<Link
						key={org.id}
						href={`/organizations/${org.id}` as Route}
						className="text-sm hover:underline"
						onClick={(e) => e.stopPropagation()}
					>
						{org.name}
						<span className="ml-1 text-xs text-muted-foreground">
							{org.role ?? ""}
							{org.status && org.status !== "active" ? ` · ${org.status}` : ""}
						</span>
					</Link>
				))}
			</div>
		),
	},
	{
		id: "credits",
		header: "Balance",
		cell: ({ row }) => (
			<span className="tabular-nums">
				{formatUsd(row.original.totalCredits)}
			</span>
		),
	},
	{
		id: "lastActiveAt",
		header: "Last active",
		cell: ({ row }) => formatDateTime(row.original.lastActiveAt),
	},
	{
		id: "createdAt",
		header: "Joined",
		cell: ({ row }) => formatDate(row.original.createdAt),
	},
];

const CSV_COLUMNS: CsvColumn<UserRow>[] = [
	{ header: "id", value: (u) => u.id },
	{ header: "email", value: (u) => u.email },
	{ header: "name", value: (u) => u.name },
	{ header: "status", value: (u) => u.status },
	{ header: "riskStatus", value: (u) => u.riskStatus },
	{ header: "emailVerified", value: (u) => u.emailVerified },
	{ header: "totalCredits", value: (u) => u.totalCredits },
	{ header: "lastActiveAt", value: (u) => u.lastActiveAt },
	{ header: "createdAt", value: (u) => u.createdAt },
	{ header: "tags", value: (u) => u.tags.join("; ") },
	{
		header: "organizations",
		value: (u) => u.organizations.map((o) => o.name).join("; "),
	},
];

function oneOf<T extends string>(value: string, options: readonly T[]) {
	return options.find((o) => o === value);
}

function toIsoDay(day: string, endOfDay: boolean) {
	if (!day) {
		return undefined;
	}
	return endOfDay ? `${day}T23:59:59.999Z` : `${day}T00:00:00.000Z`;
}

export function UsersSearch() {
	const api = useApi();
	const fetchClient = useFetchClient();
	const router = useRouter();
	const [filters, setFilters] = useUrlFilters(DEFAULTS);
	const [query, setQuery] = useState(filters.q);
	const [exporting, setExporting] = useState(false);
	const search = useDebouncedValue(query.trim(), 300);
	const offset = Math.max(0, Number(filters.offset) || 0);
	const sortBy: SortBy =
		oneOf(filters.sort, ["createdAt", "email", "lastActiveAt", "credits"]) ??
		"createdAt";
	const sortOrder = filters.order === "asc" ? "asc" : "desc";

	const baseQuery = {
		search: search || undefined,
		tag: filters.tag || undefined,
		sortBy,
		sortOrder,
		status: oneOf(filters.status, ["active", "deactivated"] as const),
		riskStatus: oneOf(filters.risk, ["none", "flagged", "approved"] as const),
		emailVerified: oneOf(filters.verified, ["true", "false"] as const),
		hasBalance: oneOf(filters.balance, ["true", "false"] as const),
		createdFrom: toIsoDay(filters.from, false),
		createdTo: toIsoDay(filters.to, true),
	} as const;

	const users = api.useQuery("get", "/admin/users", {
		params: { query: { ...baseQuery, limit: PAGE, offset } },
	});
	const usersError: unknown = users.error;
	const selection = useRowSelection<UserRef>();

	const update = (patch: Partial<typeof DEFAULTS>) =>
		setFilters({ ...patch, offset: "0" });
	const filtered =
		filters.tag !== "" ||
		filters.status !== "all" ||
		filters.risk !== "all" ||
		filters.verified !== "all" ||
		filters.balance !== "all" ||
		filters.from !== "" ||
		filters.to !== "";

	async function exportAll() {
		setExporting(true);
		try {
			const rows: UserRow[] = [];
			for (let next = 0; ; next += 100) {
				const { data, error } = await fetchClient.GET("/admin/users", {
					params: { query: { ...baseQuery, limit: 100, offset: next } },
				});
				if (error || !data) {
					throw new Error(error ? errorMessage(error) : "Export failed");
				}
				rows.push(...data.users);
				if (rows.length >= data.total || data.users.length === 0) {
					break;
				}
			}
			exportRowsToCsv("users", CSV_COLUMNS, rows);
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setExporting(false);
		}
	}

	return (
		<>
			<PageHeader
				title="Users"
				description="Every account on the platform. Filter, sort and open a user to review sessions, organizations and balance."
				actions={
					<Button
						variant="outline"
						size="sm"
						disabled={exporting || !users.data || users.data.total === 0}
						onClick={() => void exportAll()}
					>
						{exporting ? <Loader2 className="animate-spin" /> : <Download />}
						Export CSV
						{users.data ? ` (${formatNumber(users.data.total)})` : ""}
					</Button>
				}
			/>
			<UserBulkToolbar selection={selection} />
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(value) => {
						setQuery(value);
						update({ q: value });
					}}
					placeholder="Email, name or user ID"
					className="max-w-sm"
				/>
				<SimpleSelect
					ariaLabel="Status"
					value={filters.status}
					onChange={(status) => update({ status })}
					options={[
						{ value: "all", label: "Any status" },
						{ value: "active", label: "Active" },
						{ value: "deactivated", label: "Blocked" },
					]}
				/>
				<SimpleSelect
					ariaLabel="Risk"
					value={filters.risk}
					onChange={(risk) => update({ risk })}
					options={[
						{ value: "all", label: "Any risk" },
						{ value: "none", label: "No risk flag" },
						{ value: "flagged", label: "Flagged" },
						{ value: "approved", label: "Approved" },
					]}
				/>
				<SimpleSelect
					ariaLabel="Email verified"
					value={filters.verified}
					onChange={(verified) => update({ verified })}
					options={[
						{ value: "all", label: "Verified or not" },
						{ value: "true", label: "Verified" },
						{ value: "false", label: "Unverified" },
					]}
				/>
				<SimpleSelect
					ariaLabel="Balance"
					value={filters.balance}
					onChange={(balance) => update({ balance })}
					options={[
						{ value: "all", label: "Any balance" },
						{ value: "true", label: "Has balance" },
						{ value: "false", label: "No balance" },
					]}
				/>
				<TagFilter
					targetType="user"
					value={filters.tag}
					onChange={(tag) => update({ tag })}
				/>
				<div className="flex items-center gap-1.5">
					<Label htmlFor="users-from" className="text-xs text-muted-foreground">
						Joined
					</Label>
					<Input
						id="users-from"
						type="date"
						className="h-9 w-36"
						value={filters.from}
						max={filters.to || undefined}
						onChange={(e) => update({ from: e.target.value })}
					/>
					<span className="text-muted-foreground">–</span>
					<Input
						aria-label="Joined before"
						type="date"
						className="h-9 w-36"
						value={filters.to}
						min={filters.from || undefined}
						onChange={(e) => update({ to: e.target.value })}
					/>
				</div>
				{filtered ? (
					<Button
						variant="ghost"
						size="sm"
						onClick={() =>
							update({
								tag: "",
								status: "all",
								risk: "all",
								verified: "all",
								balance: "all",
								from: "",
								to: "",
							})
						}
					>
						<X /> Clear filters
					</Button>
				) : null}
			</Toolbar>
			{usersError ? (
				<ErrorState error={usersError} />
			) : (
				<>
					<DataTable
						columns={[
							selectionColumn(selection, (u: UserRow) => ({
								id: u.id,
								email: u.email,
							})),
							...columns.map((c) => ({
								...c,
								enableSorting: SORTABLE.has(c.id ?? ""),
							})),
						]}
						data={users.data?.users}
						isLoading={users.isLoading}
						getRowId={(row) => row.id}
						sort={{ id: sortBy, desc: sortOrder === "desc" }}
						onSortChange={(s) =>
							update({ sort: s.id, order: s.desc ? "desc" : "asc" })
						}
						onRowClick={(row) => router.push(`/users/${row.id}` as Route)}
						empty="No users match."
					/>
					{users.data ? (
						<Pager
							offset={offset}
							limit={PAGE}
							total={users.data.total}
							onChange={(next) => setFilters({ offset: String(next) })}
						/>
					) : null}
				</>
			)}
		</>
	);
}
