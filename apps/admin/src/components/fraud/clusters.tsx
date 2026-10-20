"use client";

import { ShieldOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
	SimpleSelect,
	StatusBadge,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import { Button } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Cluster = ApiData<"/admin/fraud/clusters">["clusters"][number];

const BLOCKED_IPS_KEY = "abuse.blockedIps";

export function IpClusters() {
	const api = useApi();
	const [minAccounts, setMinAccounts] = useState("3");
	const [days, setDays] = useState("30");
	const clusters = api.useQuery("get", "/admin/fraud/clusters", {
		params: {
			query: { minAccounts: Number(minAccounts), days: Number(days) },
		},
	});

	const columns: ColumnDef<Cluster>[] = [
		{
			accessorKey: "ipAddress",
			header: "IP",
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<code className="text-xs">{row.original.ipAddress}</code>
					{row.original.blocked ? <Tone tone="bad">blocked</Tone> : null}
				</div>
			),
		},
		{
			accessorKey: "accounts",
			header: "Accounts",
			cell: ({ row }) => (
				<span className="tabular-nums">
					{formatNumber(row.original.accounts)}
					{row.original.flaggedAccounts > 0 ? (
						<span className="text-destructive">
							{" "}
							· {formatNumber(row.original.flaggedAccounts)} flagged
						</span>
					) : null}
				</span>
			),
		},
		{
			id: "seen",
			header: "Seen",
			cell: ({ row }) => (
				<div className="text-xs text-muted-foreground">
					{formatDateTime(row.original.firstSeenAt)} –{" "}
					{formatDateTime(row.original.lastSeenAt)}
				</div>
			),
		},
		{
			id: "users",
			header: "Users",
			cell: ({ row }) => (
				<div className="flex max-w-xl flex-wrap gap-x-3 gap-y-1">
					{row.original.users.map((u) => (
						<span key={u.id} className="inline-flex items-center gap-1">
							<Link
								href={`/users/${u.id}` as Route}
								className="text-sm hover:underline"
							>
								{u.email}
							</Link>
							{u.riskStatus !== "none" ? (
								<StatusBadge status={u.riskStatus} />
							) : null}
							{u.status === "deactivated" ? (
								<StatusBadge status="deactivated" />
							) : null}
						</span>
					))}
				</div>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) =>
				row.original.blocked ? null : (
					<BlockIpButton ip={row.original.ipAddress} />
				),
		},
	];

	return (
		<>
			<Toolbar>
				<SimpleSelect
					value={minAccounts}
					onChange={setMinAccounts}
					ariaLabel="Minimum accounts"
					options={[
						{ value: "2", label: "≥ 2 accounts" },
						{ value: "3", label: "≥ 3 accounts" },
						{ value: "5", label: "≥ 5 accounts" },
						{ value: "10", label: "≥ 10 accounts" },
					]}
				/>
				<SimpleSelect
					value={days}
					onChange={setDays}
					ariaLabel="Window"
					options={[
						{ value: "7", label: "Last 7 days" },
						{ value: "30", label: "Last 30 days" },
						{ value: "90", label: "Last 90 days" },
					]}
				/>
			</Toolbar>
			<DataTable
				columns={columns}
				data={clusters.data?.clusters}
				isLoading={clusters.isLoading}
				getRowId={(row) => row.ipAddress}
				empty="No shared IPs at this threshold."
			/>
		</>
	);
}

function BlockIpButton({ ip }: { ip: string }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const config = api.useQuery("get", "/admin/settings/config");
	const save = api.useMutation("put", "/admin/settings/config", {
		onSuccess: () => {
			toast.success(`${ip} blocked`);
			void invalidate("/admin/fraud/clusters", "/admin/settings/config");
		},
	});
	const current = config.data?.entries.find(
		(e) => e.key === BLOCKED_IPS_KEY,
	)?.value;
	const list = Array.isArray(current)
		? current.filter((v): v is string => typeof v === "string")
		: [];

	return (
		<ConfirmAction
			title={`Block ${ip}`}
			description="Adds the IP to the blocklist: no sign-in, dashboard sessions or gateway requests from it. ADMIN_EMAILS owners stay exempt."
			confirmLabel="Block IP"
			destructive
			requireReason={false}
			confirmDisabled={!config.data}
			onConfirm={() =>
				save.mutateAsync({
					body: { values: { [BLOCKED_IPS_KEY]: [...list, ip] } },
				})
			}
		>
			<Button
				size="sm"
				variant="ghost"
				disabled={!can("PUT", "/admin/settings/config")}
			>
				<ShieldOff /> Block IP
			</Button>
		</ConfirmAction>
	);
}
