"use client";

import { KeyRound, RotateCcw } from "lucide-react";
import Link from "next/link";
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
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { ErrorState, PageHeader } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useApi } from "@/lib/fetch-client";
import { formatDate, formatDateTime, formatUsd } from "@/lib/utils";

import { Button } from "@llmgateway/shared/components";

import type { GlobalApiKey } from "@/lib/api/admin-types";
import type { Route } from "next";

const PAGE = 50;
const STATUSES = ["active", "inactive", "deleted"] as const;

export function ApiKeysPage() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [filters, setFilters] = useUrlFilters({
		q: "",
		status: "all",
		offset: "0",
	});
	const [query, setQuery] = useState(filters.q);
	const search = useDebouncedValue(query.trim());
	const offset = Math.max(0, Number(filters.offset) || 0);
	const list = api.useQuery("get", "/admin/api-keys", {
		params: {
			query: {
				search: search || undefined,
				status: STATUSES.find((st) => st === filters.status),
				limit: PAGE,
				offset,
			},
		},
	});
	const listError: unknown = list.error;
	const setKeyStatus = api.useMutation(
		"patch",
		"/admin/organizations/{orgId}/api-keys/{keyId}",
		{
			onSuccess: (res) => {
				toast.success(`Key is now ${res.apiKey.status}`);
				void invalidate("/admin/api-keys", "/admin/organizations");
			},
		},
	);

	const columns: ColumnDef<GlobalApiKey>[] = [
		{
			id: "key",
			header: "Key",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="font-medium">{row.original.description ?? "—"}</div>
					<div className="font-mono text-xs text-muted-foreground">
						{row.original.tokenPrefix} · {row.original.id}
					</div>
				</div>
			),
		},
		{
			id: "org",
			header: "Organization / project",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<Link
						href={
							`/organizations/${row.original.organizationId}?tab=keys` as Route
						}
						className="font-medium hover:underline"
					>
						{row.original.organizationName}
					</Link>
					<div className="text-xs text-muted-foreground">
						{row.original.projectName}
					</div>
				</div>
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			id: "usage",
			header: "Usage",
			cell: ({ row }) =>
				`${formatUsd(row.original.usage)}${row.original.usageLimit !== null ? ` / ${formatUsd(row.original.usageLimit)}` : ""}`,
		},
		{
			accessorKey: "lastUsedAt",
			header: "Last used",
			cell: ({ row }) => formatDateTime(row.original.lastUsedAt),
		},
		{
			accessorKey: "createdAt",
			header: "Created",
			cell: ({ row }) => formatDate(row.original.createdAt),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const key = row.original;
				if (key.status === "deleted") {
					return null;
				}
				const active = key.status !== "inactive";
				return (
					<div className="flex justify-end">
						<ConfirmAction
							title={active ? "Revoke API key" : "Reactivate API key"}
							description={
								active
									? `${key.organizationName}: the key stops working at the gateway immediately.`
									: `${key.organizationName}: the key starts working again.`
							}
							confirmLabel={active ? "Revoke" : "Reactivate"}
							destructive={active}
							onConfirm={() =>
								setKeyStatus.mutateAsync({
									params: {
										path: { orgId: key.organizationId, keyId: key.id },
									},
									body: { status: active ? "inactive" : "active" },
								})
							}
						>
							<Button
								size="sm"
								variant={active ? "outline" : "secondary"}
								disabled={
									!can(
										"PATCH",
										`/admin/organizations/${key.organizationId}/api-keys/${key.id}`,
									)
								}
							>
								{active ? <KeyRound /> : <RotateCcw />}
								{active ? "Revoke" : "Reactivate"}
							</Button>
						</ConfirmAction>
					</div>
				);
			},
		},
	];

	return (
		<>
			<PageHeader
				title="API keys"
				description="Find any customer key by id, token prefix, name or organization."
			/>
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(v) => {
						setQuery(v);
						setFilters({ q: v, offset: "0" });
					}}
					placeholder="Key id, prefix, name or org"
					className="max-w-sm"
				/>
				<SimpleSelect
					ariaLabel="Status"
					value={filters.status}
					onChange={(status) => setFilters({ status, offset: "0" })}
					options={[
						{ value: "all", label: "Any status" },
						{ value: "active", label: "Active" },
						{ value: "inactive", label: "Revoked" },
						{ value: "deleted", label: "Deleted" },
					]}
				/>
			</Toolbar>
			{listError ? (
				<ErrorState error={listError} />
			) : (
				<>
					<DataTable
						columns={columns}
						data={list.data?.apiKeys}
						isLoading={list.isLoading}
						getRowId={(k) => k.id}
						empty="No keys match."
					/>
					{list.data ? (
						<Pager
							offset={offset}
							limit={PAGE}
							total={list.data.total}
							onChange={(next) => setFilters({ offset: String(next) })}
						/>
					) : null}
				</>
			)}
		</>
	);
}
