"use client";

import { Plus, Power } from "lucide-react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
	SearchInput,
	SimpleSelect,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { CopyIdButton } from "@/components/ui/copy-id-button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { ErrorState, PageHeader } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import { Button } from "@llmgateway/shared/components";

import { CreateKillSwitchDialog } from "./create-kill-switch-dialog";

import type { RoutingOverride } from "@/lib/api/pending-paths-p2";
import type { CsvColumn } from "@/lib/csv";

const CSV_COLUMNS: CsvColumn<RoutingOverride>[] = [
	{ header: "id", value: (o) => o.id },
	{ header: "scope", value: (o) => o.scope },
	{ header: "target", value: (o) => o.target },
	{ header: "reason", value: (o) => o.reason },
	{ header: "active", value: (o) => o.active },
	{ header: "expiresAt", value: (o) => o.expiresAt },
	{ header: "createdAt", value: (o) => o.createdAt },
	{ header: "createdBy", value: (o) => o.createdByEmail },
];

export function KillSwitchesPage() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [filters, setFilters] = useUrlFilters({
		status: "active",
		scope: "all",
		q: "",
	});
	const overrides = api.useQuery("get", "/admin/routing-overrides");
	const overridesError: unknown = overrides.error;
	const remove = api.useMutation("delete", "/admin/routing-overrides/{id}", {
		onSuccess: () => {
			toast.success("Kill switch removed; routing resumes");
			void invalidate("/admin/routing-overrides");
		},
	});
	const canCreate = can("POST", "/admin/routing-overrides");

	const needle = filters.q.trim().toLowerCase();
	const rows = overrides.data?.overrides.filter(
		(o) =>
			(filters.status === "all" ||
				(filters.status === "active") === o.active) &&
			(filters.scope === "all" || o.scope === filters.scope) &&
			(!needle ||
				o.target.toLowerCase().includes(needle) ||
				o.reason.toLowerCase().includes(needle)),
	);
	const activeCount = overrides.data?.overrides.filter((o) => o.active).length;

	const columns: ColumnDef<RoutingOverride>[] = [
		{
			accessorKey: "target",
			header: "Target",
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<Tone tone="muted">{row.original.scope}</Tone>
					<code className="text-xs">{row.original.target}</code>
					<CopyIdButton value={row.original.target} label="Target" />
				</div>
			),
		},
		{
			accessorKey: "active",
			header: "Status",
			cell: ({ row }) =>
				row.original.active ? (
					<Tone tone="bad">disabled</Tone>
				) : (
					<Tone tone="muted">expired</Tone>
				),
		},
		{
			accessorKey: "reason",
			header: "Reason",
			cell: ({ row }) => (
				<span className="block max-w-sm truncate" title={row.original.reason}>
					{row.original.reason}
				</span>
			),
		},
		{
			accessorKey: "expiresAt",
			header: "Expires",
			cell: ({ row }) =>
				row.original.expiresAt
					? formatDateTime(row.original.expiresAt)
					: "Never",
		},
		{
			accessorKey: "createdAt",
			header: "Created",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div>{formatDateTime(row.original.createdAt)}</div>
					<div className="text-xs text-muted-foreground">
						{row.original.createdByEmail ?? "—"}
					</div>
				</div>
			),
		},
		{
			id: "actions",
			header: "",
			enableSorting: false,
			cell: ({ row }) => (
				<div className="flex justify-end">
					<ConfirmAction
						title={row.original.active ? "Re-enable routing" : "Delete record"}
						description={
							row.original.active
								? `Removes the kill switch on ${row.original.scope} ${row.original.target}. The gateway picks it up within the settings cache interval.`
								: "Deletes this expired kill switch from the list."
						}
						confirmLabel={row.original.active ? "Re-enable" : "Delete"}
						requireReason={false}
						onConfirm={() =>
							remove.mutateAsync({
								params: { path: { id: row.original.id } },
							})
						}
					>
						<Button
							size="sm"
							variant="outline"
							disabled={
								!can("DELETE", `/admin/routing-overrides/${row.original.id}`)
							}
						>
							<Power /> {row.original.active ? "Re-enable" : "Delete"}
						</Button>
					</ConfirmAction>
				</div>
			),
		},
	];

	return (
		<>
			<PageHeader
				title="Kill switches"
				description={
					activeCount === undefined
						? "Take a provider, model or mapping out of routing without a deploy."
						: `${activeCount} active. Take a provider, model or mapping out of routing without a deploy.`
				}
				actions={
					<>
						<ExportCsvButton
							filename="kill-switches"
							columns={CSV_COLUMNS}
							rows={rows}
						/>
						<CreateKillSwitchDialog>
							<Button size="sm" variant="destructive" disabled={!canCreate}>
								<Plus /> New kill switch
							</Button>
						</CreateKillSwitchDialog>
					</>
				}
			/>
			<Toolbar>
				<SearchInput
					value={filters.q}
					onChange={(q) => setFilters({ q })}
					placeholder="Target or reason"
				/>
				<SimpleSelect
					value={filters.status}
					onChange={(status) => setFilters({ status })}
					ariaLabel="Status"
					options={[
						{ value: "active", label: "Active" },
						{ value: "expired", label: "Expired" },
						{ value: "all", label: "All" },
					]}
				/>
				<SimpleSelect
					value={filters.scope}
					onChange={(scope) => setFilters({ scope })}
					ariaLabel="Scope"
					options={[
						{ value: "all", label: "All scopes" },
						{ value: "provider", label: "Providers" },
						{ value: "model", label: "Models" },
						{ value: "mapping", label: "Mappings" },
					]}
				/>
			</Toolbar>
			{overridesError ? (
				<ErrorState error={overridesError} />
			) : (
				<DataTable
					columns={columns}
					data={rows}
					isLoading={overrides.isLoading}
					getRowId={(row) => row.id}
					empty="No kill switches. Routing uses every healthy mapping."
				/>
			)}
		</>
	);
}
