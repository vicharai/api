"use client";

import { Pencil, Plus, Power, Radar } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { DiscoverModelsDialog } from "@/components/catalog/discover-dialog";
import { ProviderDialog } from "@/components/catalog/provider-dialog";
import { useProviderTemplates } from "@/components/catalog/use-provider-templates";
import {
	selectionColumn,
	useRowSelection,
} from "@/components/productivity/bulk-selection";
import { useCan } from "@/components/shell/admin-session";
import { StatusBadge, Toolbar, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useApi } from "@/lib/fetch-client";

import { Button } from "@llmgateway/shared/components";

import {
	CatalogDeletionDialog,
	DELETED_VIEW_QUERY,
	DeletedBadge,
	DeletedViewSelect,
	DeletionRowMenu,
	DeletionSelectionBar,
	toDeletedView,
	type DeletionDialogState,
	type DeletionTarget,
} from "./catalog-deletion";

import type { CatalogProvider } from "@/lib/api/admin-types";
import type { Route } from "next";

function toTarget(provider: CatalogProvider): DeletionTarget {
	return { id: provider.id, name: provider.name, deleted: provider.deleted };
}

export function CatalogProviders() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [filters, setFilters] = useUrlFilters({ deleted: "active" });
	const view = toDeletedView(filters.deleted);
	const list = api.useQuery("get", "/admin/catalog/providers", {
		params: { query: { deleted: DELETED_VIEW_QUERY[view] } },
	});
	const templates = useProviderTemplates().byId;
	const [adding, setAdding] = useState(false);
	const [editing, setEditing] = useState<CatalogProvider | null>(null);
	const [discovering, setDiscovering] = useState<CatalogProvider | null>(null);
	const [dialog, setDialog] = useState<DeletionDialogState | null>(null);
	const selection = useRowSelection<DeletionTarget>();
	const canDelete = can("POST", "/admin/catalog/providers/bulk-delete");
	const canDiscover = (p: CatalogProvider) =>
		p.kind === "custom" &&
		p.status === "active" &&
		!p.deleted &&
		Boolean(p.template && templates.get(p.template)?.modelListing) &&
		can("POST", `/admin/catalog/providers/${p.id}/import`);
	const reactivate = api.useMutation("patch", "/admin/catalog/providers/{id}", {
		onSuccess: () => {
			toast.success("Provider reactivated");
			void invalidate("/admin/catalog");
		},
	});

	const columns: ColumnDef<CatalogProvider>[] = [
		...(canDelete ? [selectionColumn(selection, toTarget)] : []),
		{
			id: "name",
			accessorKey: "name",
			header: "Provider",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="flex items-center gap-2 font-medium">
						{row.original.kind === "builtin" ? (
							<Link
								href={`/providers/${row.original.id}` as Route}
								className="hover:underline"
							>
								{row.original.name}
							</Link>
						) : (
							row.original.name
						)}
						{row.original.kind === "custom" ? (
							<>
								<Tone tone="info">custom</Tone>
								{row.original.template ? (
									<Tone tone="muted">
										{templates.get(row.original.template)?.label ??
											row.original.template}
									</Tone>
								) : null}
							</>
						) : (
							<Tone tone="muted">built-in</Tone>
						)}
						<DeletedBadge info={row.original} />
					</div>
					<div className="font-mono text-xs text-muted-foreground">
						{row.original.id}
					</div>
				</div>
			),
		},
		{
			id: "baseUrl",
			header: "Base URL",
			enableSorting: false,
			cell: ({ row }) => (
				<span className="font-mono text-xs">{row.original.baseUrl ?? "—"}</span>
			),
		},
		{
			id: "credentialCount",
			accessorKey: "credentialCount",
			header: "Keys",
			cell: ({ row }) =>
				row.original.credentialCount > 0 ? (
					row.original.credentialCount
				) : (
					<Tone tone="warn">none</Tone>
				),
		},
		{ id: "modelCount", accessorKey: "modelCount", header: "Models" },
		{
			id: "status",
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			id: "actions",
			header: "",
			enableSorting: false,
			cell: ({ row }) => {
				const p = row.original;
				const path = `/admin/catalog/providers/${p.id}`;
				const editable = p.kind === "custom" && !p.deleted;
				return (
					<div className="flex items-center justify-end gap-1">
						{canDiscover(p) ? (
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setDiscovering(p)}
							>
								<Radar /> Discover models
							</Button>
						) : null}
						{editable ? (
							<Button
								size="sm"
								variant="ghost"
								disabled={!can("PATCH", path)}
								onClick={() => setEditing(p)}
							>
								<Pencil /> Edit
							</Button>
						) : null}
						{editable && p.status !== "active" ? (
							<Button
								size="sm"
								variant="ghost"
								disabled={!can("PATCH", path) || reactivate.isPending}
								onClick={() =>
									reactivate.mutate({
										params: { path: { id: p.id } },
										body: { status: "active" },
									})
								}
							>
								<Power /> Reactivate
							</Button>
						) : null}
						{canDelete ? (
							<DeletionRowMenu
								target={toTarget(p)}
								onSelect={(action) =>
									setDialog({ action, targets: [toTarget(p)], bulk: false })
								}
							/>
						) : null}
					</div>
				);
			},
		},
	];

	return (
		<>
			<Toolbar>
				<p className="text-sm text-muted-foreground">
					Built-in providers ship with the gateway. Custom providers point at
					any endpoint speaking a supported API style.
				</p>
				<div className="ml-auto flex items-center gap-2">
					<DeletedViewSelect
						value={view}
						onChange={(deleted) => {
							setFilters({ deleted });
							selection.clear();
						}}
					/>
					<Button
						size="sm"
						disabled={!can("POST", "/admin/catalog/providers")}
						onClick={() => setAdding(true)}
					>
						<Plus /> Add provider
					</Button>
				</div>
			</Toolbar>
			<DeletionSelectionBar
				selected={selection.selected}
				noun="provider(s)"
				onClear={selection.clear}
				onAction={setDialog}
			/>
			<QueryState query={list}>
				{(data) => (
					<DataTable
						columns={columns}
						data={[...data.providers].sort(
							(a, b) =>
								Number(b.kind === "custom") - Number(a.kind === "custom") ||
								a.name.localeCompare(b.name),
						)}
						getRowId={(p) => p.id}
						empty="No providers."
					/>
				)}
			</QueryState>
			{adding ? (
				<ProviderDialog
					existing={list.data?.providers.map((p) => p.id) ?? []}
					onClose={() => setAdding(false)}
					onDiscover={(p) => {
						setAdding(false);
						setDiscovering(p);
					}}
				/>
			) : null}
			{editing ? (
				<ProviderDialog
					provider={editing}
					existing={[]}
					onClose={() => setEditing(null)}
					onDiscover={
						canDiscover(editing)
							? (p) => {
									setEditing(null);
									setDiscovering(p);
								}
							: undefined
					}
					onDelete={
						canDelete
							? () => {
									setDialog({
										action: "delete",
										targets: [toTarget(editing)],
										bulk: false,
									});
									setEditing(null);
								}
							: undefined
					}
				/>
			) : null}
			{discovering ? (
				<DiscoverModelsDialog
					provider={discovering}
					onClose={() => setDiscovering(null)}
				/>
			) : null}
			{dialog ? (
				<CatalogDeletionDialog
					scope="provider"
					{...dialog}
					open
					onOpenChange={(open) => {
						if (!open) {
							setDialog(null);
						}
					}}
					onDone={selection.clear}
				/>
			) : null}
		</>
	);
}
