"use client";

import { Archive, ArchiveRestore, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
	SearchInput,
	SimpleSelect,
	StatusBadge,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime, formatUsd } from "@/lib/utils";

import { Button } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Account = ApiData<"/admin/flagged-accounts">["accounts"][number];
type Status = "flagged" | "approved" | "all";

export function FlaggedAccounts() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [status, setStatus] = useState<Status>("flagged");
	const [archived, setArchived] = useState<"false" | "true">("false");
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim());

	const list = api.useQuery("get", "/admin/flagged-accounts", {
		params: {
			query: { status, archived, search: search || undefined, limit: 200 },
		},
	});
	const approve = api.useMutation(
		"post",
		"/admin/flagged-accounts/{userId}/approve",
		{
			onSuccess: () => {
				toast.success("Account approved");
				void invalidate("/admin/flagged-accounts", "/admin/users");
			},
		},
	);
	const archive = api.useMutation(
		"patch",
		"/admin/flagged-accounts/{userId}/archive",
		{
			onSuccess: () => {
				toast.success("Updated");
				void invalidate("/admin/flagged-accounts");
			},
		},
	);

	const columns: ColumnDef<Account>[] = [
		{
			accessorKey: "email",
			header: "Account",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<Link
						href={`/users/${row.original.userId}` as Route}
						className="font-medium hover:underline"
					>
						{row.original.email}
					</Link>
					<div className="text-xs text-muted-foreground">
						{row.original.name ?? "—"} · joined{" "}
						{formatDateTime(row.original.createdAt)}
					</div>
				</div>
			),
		},
		{
			accessorKey: "riskStatus",
			header: "Status",
			cell: ({ row }) => (
				<div className="flex gap-1">
					<StatusBadge status={row.original.riskStatus} />
					{row.original.archivedAt ? <Tone tone="muted">archived</Tone> : null}
				</div>
			),
		},
		{
			id: "signal",
			header: "Signal",
			cell: ({ row }) => {
				const a = row.original;
				return (
					<div className="space-y-0.5 text-xs">
						<div>
							{a.source ?? "—"} · {a.ipAddress ?? "no IP"}{" "}
							{a.countryCode ? `(${a.countryCode})` : ""}
						</div>
						<div className="text-muted-foreground">
							abuse {a.abuseConfidenceScore ?? "—"}% ·{" "}
							{formatNumber(a.totalReports ?? 0)} reports
							{a.isTor ? " · Tor" : ""}
							{a.usageType ? ` · ${a.usageType}` : ""}
							{a.isp ? ` · ${a.isp}` : ""}
						</div>
					</div>
				);
			},
		},
		{
			accessorKey: "flaggedAt",
			header: "Flagged",
			cell: ({ row }) => formatDateTime(row.original.flaggedAt),
		},
		{
			id: "orgs",
			header: "Organizations",
			cell: ({ row }) => (
				<div className="flex flex-col gap-0.5">
					{row.original.organizations.map((o) => (
						<Link
							key={o.id}
							href={`/organizations/${o.id}` as Route}
							className="text-sm hover:underline"
						>
							{o.name}{" "}
							<span className="text-xs text-muted-foreground">
								{o.plan} · {formatUsd(o.credits)}
							</span>
						</Link>
					))}
				</div>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const a = row.original;
				return (
					<div className="flex justify-end gap-1">
						{a.riskStatus === "flagged" ? (
							<ConfirmAction
								title={`Approve ${a.email}`}
								description="Clears the flag on the user and their organizations."
								confirmLabel="Approve"
								requireReason={false}
								onConfirm={() =>
									approve.mutateAsync({
										params: { path: { userId: a.userId } },
									})
								}
							>
								<Button
									size="sm"
									variant="outline"
									disabled={
										!can("POST", `/admin/flagged-accounts/${a.userId}/approve`)
									}
								>
									<CheckCircle2 /> Approve
								</Button>
							</ConfirmAction>
						) : null}
						<Button
							size="sm"
							variant="ghost"
							disabled={
								archive.isPending ||
								!can("PATCH", `/admin/flagged-accounts/${a.userId}/archive`)
							}
							onClick={() =>
								archive.mutate({
									params: { path: { userId: a.userId } },
									body: { archived: !a.archivedAt },
								})
							}
						>
							{a.archivedAt ? <ArchiveRestore /> : <Archive />}
							{a.archivedAt ? "Restore" : "Archive"}
						</Button>
					</div>
				);
			},
		},
	];

	return (
		<>
			<PageHeader
				title="Flagged accounts"
				description="Signups and verifications the risk checks flagged. Approve legitimate users, archive handled ones."
			>
				{list.data ? (
					<div className="flex gap-2 text-sm text-muted-foreground">
						<span>{formatNumber(list.data.flaggedCount)} flagged</span>·
						<span>{formatNumber(list.data.approvedCount)} approved</span>·
						<span>{formatNumber(list.data.archivedCount)} archived</span>
					</div>
				) : null}
			</PageHeader>
			<Toolbar>
				<SearchInput
					value={query}
					onChange={setQuery}
					placeholder="Email or name"
				/>
				<SimpleSelect
					value={status}
					onChange={setStatus}
					options={[
						{ value: "flagged", label: "Flagged" },
						{ value: "approved", label: "Approved" },
						{ value: "all", label: "All" },
					]}
				/>
				<SimpleSelect
					value={archived}
					onChange={setArchived}
					options={[
						{ value: "false", label: "Inbox" },
						{ value: "true", label: "Archived" },
					]}
				/>
			</Toolbar>
			<DataTable
				columns={columns}
				data={list.data?.accounts}
				isLoading={list.isLoading}
				getRowId={(row) => row.userId}
				empty="No accounts in this view."
			/>
		</>
	);
}
