"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { UserBulkToolbar } from "@/components/productivity/bulk-actions";
import {
	selectionColumn,
	useRowSelection,
} from "@/components/productivity/bulk-selection";
import { SearchInput, StatusBadge, Toolbar } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useApi } from "@/lib/fetch-client";
import { formatDate, formatUsd } from "@/lib/utils";

import type { UserRef } from "@/components/productivity/quick-action-dialogs";
import type { ApiData } from "@/lib/api/types";
import type { CsvColumn } from "@/lib/csv";
import type { Route } from "next";

type UserRow = ApiData<"/admin/users">["users"][number];

const columns: ColumnDef<UserRow>[] = [
	{
		accessorKey: "email",
		header: "Email",
		cell: ({ row }) => (
			<Link
				href={`/users/${row.original.id}` as Route}
				className="font-medium hover:underline"
			>
				{row.original.email}
			</Link>
		),
	},
	{
		accessorKey: "name",
		header: "Name",
		cell: ({ row }) => row.original.name ?? "—",
	},
	{
		accessorKey: "emailVerified",
		header: "Email",
		cell: ({ row }) => (
			<StatusBadge
				status={row.original.emailVerified ? "verified" : "unverified"}
			/>
		),
	},
	{
		id: "orgs",
		header: "Organizations",
		cell: ({ row }) => (
			<div className="flex max-w-md flex-wrap gap-x-3 gap-y-1">
				{row.original.organizations.map((org) => (
					<Link
						key={org.id}
						href={`/organizations/${org.id}` as Route}
						className="text-sm hover:underline"
						onClick={(e) => e.stopPropagation()}
					>
						{org.name}
						<span className="ml-1 text-xs text-muted-foreground">
							{org.role ?? ""} · {formatUsd(org.credits)}
							{org.status && org.status !== "active" ? ` · ${org.status}` : ""}
						</span>
					</Link>
				))}
			</div>
		),
	},
	{
		accessorKey: "createdAt",
		header: "Joined",
		cell: ({ row }) => formatDate(row.original.createdAt),
	},
];

const CSV_COLUMNS: CsvColumn<UserRow>[] = [
	{ header: "id", value: (u) => u.id },
	{ header: "email", value: (u) => u.email },
	{ header: "name", value: (u) => u.name },
	{ header: "emailVerified", value: (u) => u.emailVerified },
	{ header: "createdAt", value: (u) => u.createdAt },
	{
		header: "organizations",
		value: (u) => u.organizations.map((o) => o.name).join("; "),
	},
];

export function UsersSearch() {
	const api = useApi();
	const router = useRouter();
	const params = useSearchParams();
	const [query, setQuery] = useState(params.get("q") ?? "");
	const search = useDebouncedValue(query.trim(), 300);

	const users = api.useQuery(
		"get",
		"/admin/users",
		{ params: { query: { search, limit: 50 } } },
		{ enabled: search.length >= 2 },
	);
	const usersError: unknown = users.error;
	const selection = useRowSelection<UserRef>();

	return (
		<>
			<PageHeader
				title="Users"
				description="Find a user by email, name or ID to review their account, sessions and organizations."
				actions={
					<ExportCsvButton
						filename="users"
						columns={CSV_COLUMNS}
						rows={users.data?.users}
					/>
				}
			/>
			<UserBulkToolbar selection={selection} />
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(value) => {
						setQuery(value);
						router.replace(
							(value
								? `/users?q=${encodeURIComponent(value)}`
								: "/users") as Route,
						);
					}}
					placeholder="Email, name or user ID"
					className="max-w-md"
				/>
			</Toolbar>
			{search.length < 2 ? (
				<EmptyState>Type at least two characters to search.</EmptyState>
			) : usersError ? (
				<ErrorState error={usersError} />
			) : (
				<DataTable
					columns={[
						selectionColumn(selection, (u: UserRow) => ({
							id: u.id,
							email: u.email,
						})),
						...columns,
					]}
					data={users.data?.users}
					isLoading={users.isLoading}
					getRowId={(row) => row.id}
					onRowClick={(row) => router.push(`/users/${row.id}` as Route)}
					empty="No users match."
				/>
			)}
		</>
	);
}
