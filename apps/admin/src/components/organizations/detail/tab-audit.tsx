"use client";

import Link from "next/link";
import { useState } from "react";

import { Pager, SimpleSelect, Toolbar } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { JsonBlock, QueryState, Section } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Entry =
	ApiData<"/admin/organizations/{orgId}/audit-logs">["auditLogs"][number];

const PAGE = 50;
const ALL = "__all__";

const columns: ColumnDef<Entry>[] = [
	{
		accessorKey: "createdAt",
		header: "When",
		cell: ({ row }) => formatDateTime(row.original.createdAt),
	},
	{
		id: "user",
		header: "By",
		cell: ({ row }) =>
			row.original.user ? (
				<Link
					href={`/users/${row.original.userId}` as Route}
					className="hover:underline"
				>
					{row.original.user.email}
				</Link>
			) : (
				row.original.userId
			),
	},
	{
		accessorKey: "action",
		header: "Action",
		cell: ({ row }) => <code className="text-xs">{row.original.action}</code>,
	},
	{
		id: "resource",
		header: "Resource",
		cell: ({ row }) => (
			<span className="text-xs">
				{row.original.resourceType}
				{row.original.resourceId ? ` · ${row.original.resourceId}` : ""}
			</span>
		),
	},
	{
		id: "metadata",
		header: "Details",
		cell: ({ row }) =>
			row.original.metadata ? (
				<details className="max-w-md">
					<summary className="cursor-pointer text-xs text-muted-foreground">
						metadata
					</summary>
					<JsonBlock value={row.original.metadata} />
				</details>
			) : null,
	},
];

export function OrgAuditTab({ orgId }: { orgId: string }) {
	const api = useApi();
	const [offset, setOffset] = useState(0);
	const [action, setAction] = useState(ALL);
	const [resourceType, setResourceType] = useState(ALL);
	const logs = api.useQuery("get", "/admin/organizations/{orgId}/audit-logs", {
		params: {
			path: { orgId },
			query: {
				limit: PAGE,
				offset,
				action: action === ALL ? undefined : action,
				resourceType: resourceType === ALL ? undefined : resourceType,
			},
		},
	});

	return (
		<Section
			title="Organization audit log"
			description="Customer-side and admin actions recorded against this organization."
		>
			<Toolbar>
				<SimpleSelect
					value={action}
					onChange={(v) => {
						setAction(v);
						setOffset(0);
					}}
					options={[
						{ value: ALL, label: "All actions" },
						...(logs.data?.filters.actions ?? []).map((a) => ({
							value: a,
							label: a,
						})),
					]}
				/>
				<SimpleSelect
					value={resourceType}
					onChange={(v) => {
						setResourceType(v);
						setOffset(0);
					}}
					options={[
						{ value: ALL, label: "All resources" },
						...(logs.data?.filters.resourceTypes ?? []).map((a) => ({
							value: a,
							label: a,
						})),
					]}
				/>
			</Toolbar>
			<QueryState query={logs}>
				{(data) => (
					<>
						<DataTable
							columns={columns}
							data={data.auditLogs}
							getRowId={(e) => e.id}
							empty="No audit entries."
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
		</Section>
	);
}
