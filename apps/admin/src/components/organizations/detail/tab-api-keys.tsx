"use client";

import { KeyRound, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect, StatusBadge, Toolbar } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDate, formatUsd } from "@/lib/utils";

import { Button } from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";

type ApiKey =
	ApiData<"/admin/organizations/{orgId}/api-keys">["apiKeys"][number];
type ProviderKey =
	ApiData<"/admin/organizations/{orgId}/provider-keys">["providerKeys"][number];
type Status = "all" | "active" | "inactive" | "deleted";

const providerKeyColumns: ColumnDef<ProviderKey>[] = [
	{ accessorKey: "provider", header: "Provider" },
	{
		accessorKey: "name",
		header: "Name",
		cell: ({ row }) => row.original.name ?? row.original.description ?? "—",
	},
	{
		accessorKey: "token",
		header: "Token",
		cell: ({ row }) => <code className="text-xs">{row.original.token}</code>,
	},
	{
		accessorKey: "baseUrl",
		header: "Base URL",
		cell: ({ row }) => row.original.baseUrl ?? "—",
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge status={row.original.status} />,
	},
	{
		accessorKey: "usage",
		header: "Usage",
		cell: ({ row }) =>
			`${formatUsd(row.original.usage)}${row.original.usageLimit ? ` / ${formatUsd(row.original.usageLimit)}` : ""}`,
	},
	{
		accessorKey: "createdAt",
		header: "Created",
		cell: ({ row }) => formatDate(row.original.createdAt),
	},
];

export function OrgApiKeysTab({ orgId }: { orgId: string }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [status, setStatus] = useState<Status>("all");
	const keys = api.useQuery("get", "/admin/organizations/{orgId}/api-keys", {
		params: { path: { orgId }, query: { status, limit: 100 } },
	});
	const providerKeys = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/provider-keys",
		{ params: { path: { orgId }, query: { status: "all" } } },
	);
	const setKeyStatus = api.useMutation(
		"patch",
		"/admin/organizations/{orgId}/api-keys/{keyId}",
		{
			onSuccess: (res) => {
				toast.success(`Key is now ${res.apiKey.status}`);
				void invalidate(`/admin/organizations/{orgId}/api-keys`);
			},
		},
	);

	const columns: ColumnDef<ApiKey>[] = [
		{
			accessorKey: "description",
			header: "Key",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="font-medium">{row.original.description || "—"}</div>
					<code className="text-xs text-muted-foreground">
						{row.original.token}
					</code>
				</div>
			),
		},
		{ accessorKey: "projectName", header: "Project" },
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			accessorKey: "usage",
			header: "Usage",
			cell: ({ row }) =>
				`${formatUsd(row.original.usage)}${row.original.usageLimit ? ` / ${formatUsd(row.original.usageLimit)}` : ""}`,
		},
		{
			id: "rules",
			header: "IAM",
			cell: ({ row }) =>
				row.original.iamRules
					.filter((r) => r.status === "active")
					.map((r) => r.ruleType)
					.join(", ") || "—",
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
									? "The key stops working at the gateway immediately. The customer can see it as inactive."
									: "The key starts working again."
							}
							confirmLabel={active ? "Revoke" : "Reactivate"}
							destructive={active}
							onConfirm={() =>
								setKeyStatus.mutateAsync({
									params: { path: { orgId, keyId: key.id } },
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
										`/admin/organizations/${orgId}/api-keys/${key.id}`,
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
		<div className="space-y-4">
			<Section
				title="API keys"
				actions={
					<Toolbar>
						<SimpleSelect
							value={status}
							onChange={setStatus}
							options={[
								{
									value: "all",
									label: `All (${keys.data?.counts.all ?? "…"})`,
								},
								{
									value: "active",
									label: `Active (${keys.data?.counts.active ?? "…"})`,
								},
								{
									value: "inactive",
									label: `Inactive (${keys.data?.counts.inactive ?? "…"})`,
								},
								{
									value: "deleted",
									label: `Deleted (${keys.data?.counts.deleted ?? "…"})`,
								},
							]}
						/>
					</Toolbar>
				}
			>
				<QueryState query={keys}>
					{(data) => (
						<DataTable
							columns={columns}
							data={data.apiKeys}
							getRowId={(k) => k.id}
							empty="No API keys."
						/>
					)}
				</QueryState>
			</Section>
			<Section
				title="Provider keys (BYOK)"
				description="Customer-supplied upstream credentials. Read-only here."
			>
				<QueryState query={providerKeys}>
					{(data) => (
						<DataTable
							columns={providerKeyColumns}
							data={data.providerKeys}
							getRowId={(k) => k.id}
							empty="No provider keys."
						/>
					)}
				</QueryState>
			</Section>
		</div>
	);
}
