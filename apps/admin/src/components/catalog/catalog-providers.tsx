"use client";

import { Pencil, Plus, Power } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ProviderDialog } from "@/components/catalog/provider-dialog";
import { useProviderTemplates } from "@/components/catalog/use-provider-templates";
import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { StatusBadge, Toolbar, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import { Button } from "@llmgateway/shared/components";

import type { CatalogProvider } from "@/lib/api/admin-types";
import type { Route } from "next";

export function CatalogProviders() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const list = api.useQuery("get", "/admin/catalog/providers");
	const templates = useProviderTemplates().byId;
	const [adding, setAdding] = useState(false);
	const [editing, setEditing] = useState<CatalogProvider | null>(null);
	const deactivate = api.useMutation(
		"delete",
		"/admin/catalog/providers/{id}",
		{
			onSuccess: () => {
				toast.success("Provider deactivated");
				void invalidate("/admin/catalog");
			},
		},
	);
	const reactivate = api.useMutation("patch", "/admin/catalog/providers/{id}", {
		onSuccess: () => {
			toast.success("Provider reactivated");
			void invalidate("/admin/catalog");
		},
	});

	const columns: ColumnDef<CatalogProvider>[] = [
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
				if (p.kind !== "custom") {
					return null;
				}
				const path = `/admin/catalog/providers/${p.id}`;
				return (
					<div className="flex justify-end gap-1">
						<Button
							size="sm"
							variant="ghost"
							disabled={!can("PATCH", path)}
							onClick={() => setEditing(p)}
						>
							<Pencil /> Edit
						</Button>
						{p.status === "active" ? (
							<ConfirmAction
								title={`Deactivate ${p.name}`}
								description="Stops routing to this provider. Models mapped only to it become unavailable."
								destructive
								requireReason={false}
								confirmLabel="Deactivate"
								onConfirm={() =>
									deactivate.mutateAsync({ params: { path: { id: p.id } } })
								}
							>
								<Button
									size="sm"
									variant="ghost"
									disabled={!can("DELETE", path)}
								>
									<Power /> Deactivate
								</Button>
							</ConfirmAction>
						) : (
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
						)}
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
				<div className="ml-auto">
					<Button
						size="sm"
						disabled={!can("POST", "/admin/catalog/providers")}
						onClick={() => setAdding(true)}
					>
						<Plus /> Add provider
					</Button>
				</div>
			</Toolbar>
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
				/>
			) : null}
			{editing ? (
				<ProviderDialog
					provider={editing}
					existing={[]}
					onClose={() => setEditing(null)}
				/>
			) : null}
		</>
	);
}
