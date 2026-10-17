"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { useCan } from "@/components/shell/admin-session";
import {
	Pager,
	SearchInput,
	SimpleSelect,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { JsonBlock, PageHeader, QueryState } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import { Input, Label } from "@llmgateway/shared/components";

import type { AdminAuditEntry } from "@/lib/api/pending-paths";
import type { Route } from "next";

const PAGE = 50;
const ALL = "__all__";

const METHOD_TONE: Record<string, "info" | "warn" | "bad" | "muted"> = {
	POST: "info",
	PUT: "warn",
	PATCH: "warn",
	DELETE: "bad",
};

const columns: ColumnDef<AdminAuditEntry>[] = [
	{
		accessorKey: "createdAt",
		header: "When",
		cell: ({ row }) => formatDateTime(row.original.createdAt),
	},
	{
		accessorKey: "adminEmail",
		header: "Admin",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<div>{row.original.adminEmail}</div>
				<div className="text-xs text-muted-foreground">
					{row.original.adminRole}
				</div>
			</div>
		),
	},
	{
		id: "action",
		header: "Action",
		cell: ({ row }) => (
			<div className="flex items-center gap-2">
				<Tone tone={METHOD_TONE[row.original.method] ?? "muted"}>
					{row.original.method}
				</Tone>
				<code className="max-w-md truncate text-xs">{row.original.path}</code>
			</div>
		),
	},
	{
		accessorKey: "statusCode",
		header: "Result",
		cell: ({ row }) => (
			<Tone tone={row.original.statusCode < 400 ? "good" : "bad"}>
				{row.original.statusCode}
			</Tone>
		),
	},
	{
		id: "target",
		header: "Target",
		cell: ({ row }) => (
			<div className="flex flex-col text-xs">
				{row.original.targetOrganizationId ? (
					<Link
						href={
							`/organizations/${row.original.targetOrganizationId}` as Route
						}
						className="hover:underline"
					>
						org {row.original.targetOrganizationId}
					</Link>
				) : null}
				{row.original.targetUserId ? (
					<Link
						href={`/users/${row.original.targetUserId}` as Route}
						className="hover:underline"
					>
						user {row.original.targetUserId}
					</Link>
				) : null}
			</div>
		),
	},
	{
		id: "summary",
		header: "Request",
		cell: ({ row }) =>
			row.original.requestSummary ? (
				<details className="max-w-md">
					<summary className="cursor-pointer text-xs text-muted-foreground">
						body
					</summary>
					<JsonBlock value={row.original.requestSummary} />
				</details>
			) : null,
	},
];

export function AuditPage() {
	const api = useApi();
	const can = useCan();
	const params = useSearchParams();
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim());
	const [method, setMethod] = useState(ALL);
	const [adminUserId, setAdminUserId] = useState(ALL);
	const [target, setTarget] = useState(
		params.get("org") ?? params.get("user") ?? "",
	);
	const targetDebounced = useDebouncedValue(target.trim());
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [offset, setOffset] = useState(0);
	const team = api.useQuery("get", "/admin/team", undefined, {
		enabled: can("GET", "/admin/team"),
	});
	const logs = api.useQuery("get", "/admin/audit-logs", {
		params: {
			query: {
				limit: PAGE,
				offset,
				search: search || undefined,
				method: method === ALL ? undefined : method,
				adminUserId: adminUserId === ALL ? undefined : adminUserId,
				targetOrganizationId:
					targetDebounced && !params.get("user") ? targetDebounced : undefined,
				targetUserId: params.get("user") ? targetDebounced : undefined,
				from: from ? new Date(from).toISOString() : undefined,
				to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
			},
		},
	});

	const reset = () => setOffset(0);

	return (
		<>
			<PageHeader
				title="Audit log"
				description="Every create, update and delete made through the admin API, including rejected attempts."
			/>
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(v) => {
						setQuery(v);
						reset();
					}}
					placeholder="Path contains…"
				/>
				<SimpleSelect
					value={method}
					onChange={(v) => {
						setMethod(v);
						reset();
					}}
					options={[
						{ value: ALL, label: "All methods" },
						{ value: "POST", label: "POST" },
						{ value: "PUT", label: "PUT" },
						{ value: "PATCH", label: "PATCH" },
						{ value: "DELETE", label: "DELETE" },
					]}
				/>
				{team.data ? (
					<SimpleSelect
						value={adminUserId}
						onChange={(v) => {
							setAdminUserId(v);
							reset();
						}}
						options={[
							{ value: ALL, label: "All admins" },
							...team.data.members.map((m) => ({
								value: m.userId,
								label: m.email,
							})),
						]}
					/>
				) : null}
				<Input
					className="h-9 w-56"
					placeholder={params.get("user") ? "Target user ID" : "Target org ID"}
					value={target}
					onChange={(e) => {
						setTarget(e.target.value);
						reset();
					}}
				/>
				<Label className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
					From
					<Input
						type="date"
						className="h-9 w-36"
						value={from}
						onChange={(e) => {
							setFrom(e.target.value);
							reset();
						}}
					/>
				</Label>
				<Label className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
					To
					<Input
						type="date"
						className="h-9 w-36"
						value={to}
						onChange={(e) => {
							setTo(e.target.value);
							reset();
						}}
					/>
				</Label>
			</Toolbar>
			<QueryState query={logs}>
				{(data) => (
					<>
						<DataTable
							columns={columns}
							data={data.entries}
							getRowId={(e) => e.id}
							empty="No admin actions match."
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
		</>
	);
}
