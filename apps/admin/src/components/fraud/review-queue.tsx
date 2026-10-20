"use client";

import { Ban, CheckCircle2, Flag, RefreshCw, UserX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
	Pager,
	Segmented,
	SimpleSelect,
	StatusBadge,
	Toolbar,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi, useFetchClient } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import { Button } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import { ScoreChip } from "./score-chip";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Entry = ApiData<"/admin/fraud/review-queue">["entries"][number];
type Subject = "user" | "org";

const PAGE = 50;

export function ReviewQueue() {
	const api = useApi();
	const [subjectType, setSubjectType] = useState<Subject>("user");
	const [minScore, setMinScore] = useState("20");
	const [offset, setOffset] = useState(0);
	const [recomputing, setRecomputing] = useState(false);
	const client = useFetchClient();
	const invalidate = useInvalidate();

	const queue = api.useQuery("get", "/admin/fraud/review-queue", {
		params: {
			query: {
				subjectType,
				minScore: Number(minScore),
				limit: PAGE,
				offset,
			},
		},
	});

	const columns: ColumnDef<Entry>[] = [
		{
			accessorKey: "label",
			header: subjectType === "user" ? "User" : "Organization",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<Link
						href={
							(subjectType === "user"
								? `/users/${row.original.subjectId}`
								: `/organizations/${row.original.subjectId}`) as Route
						}
						className="font-medium hover:underline"
					>
						{row.original.label}
					</Link>
					<div className="text-xs text-muted-foreground">
						created {formatDateTime(row.original.createdAt)}
					</div>
				</div>
			),
		},
		{
			accessorKey: "score",
			header: "Score",
			cell: ({ row }) => (
				<ScoreChip score={row.original.score} signals={row.original.signals} />
			),
		},
		{
			id: "signals",
			header: "Signals",
			cell: ({ row }) => (
				<div className="flex max-w-md flex-wrap gap-1 text-xs text-muted-foreground">
					{row.original.signals.map((s, i) => (
						<span key={`${s.key}-${i}`} className="rounded bg-muted px-1.5">
							{s.label}
						</span>
					))}
				</div>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => (
				<div className="flex flex-wrap gap-1">
					{row.original.riskStatus && row.original.riskStatus !== "none" ? (
						<StatusBadge status={row.original.riskStatus} />
					) : null}
					{row.original.organizations.map((o) => (
						<Link
							key={o.id}
							href={`/organizations/${o.id}` as Route}
							className="text-xs hover:underline"
						>
							{subjectType === "user" ? o.name : null}
							{o.riskFlagged ? " (flagged)" : ""}
							{o.status === "deleted" ? " (blocked)" : ""}
						</Link>
					))}
				</div>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => <QuickActions entry={row.original} />,
		},
	];

	return (
		<>
			<Toolbar>
				<Segmented
					value={subjectType}
					onChange={(v) => {
						setSubjectType(v);
						setOffset(0);
					}}
					options={[
						{ value: "user", label: "Users" },
						{ value: "org", label: "Organizations" },
					]}
				/>
				<SimpleSelect
					value={minScore}
					onChange={(v) => {
						setMinScore(v);
						setOffset(0);
					}}
					ariaLabel="Minimum score"
					options={[
						{ value: "1", label: "Score ≥ 1" },
						{ value: "20", label: "Score ≥ 20" },
						{ value: "40", label: "Score ≥ 40" },
						{ value: "70", label: "Score ≥ 70" },
					]}
				/>
				<Button
					variant="outline"
					size="sm"
					disabled={recomputing}
					onClick={async () => {
						setRecomputing(true);
						try {
							await client.GET("/admin/fraud/review-queue", {
								params: { query: { refresh: "true", limit: 1 } },
							});
							await invalidate("/admin/fraud/review-queue");
						} finally {
							setRecomputing(false);
						}
					}}
				>
					<RefreshCw className={recomputing ? "animate-spin" : ""} />
					Recompute
				</Button>
				{queue.data ? (
					<span className="text-sm text-muted-foreground">
						{formatNumber(queue.data.total)} in queue · scored{" "}
						{formatDateTime(queue.data.computedAt)}
					</span>
				) : null}
			</Toolbar>
			<DataTable
				columns={columns}
				data={queue.data?.entries}
				isLoading={queue.isLoading}
				getRowId={(row) => `${row.subjectType}:${row.subjectId}`}
				empty="Nothing above this score."
			/>
			{queue.data ? (
				<Pager
					offset={offset}
					limit={PAGE}
					total={queue.data.total}
					onChange={setOffset}
				/>
			) : null}
		</>
	);
}

function QuickActions({ entry }: { entry: Entry }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const onSuccess = (message: string) => () => {
		toast.success(message);
		void invalidate("/admin/fraud", "/admin/users", "/admin/organizations");
	};
	const approve = api.useMutation(
		"post",
		"/admin/flagged-accounts/{userId}/approve",
		{ onSuccess: onSuccess("Account approved") },
	);
	const blockUser = api.useMutation("post", "/admin/users/{userId}/block", {
		onSuccess: onSuccess("User blocked"),
	});
	const flagOrg = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/risk-flag",
		{ onSuccess: onSuccess("Organization flagged") },
	);
	const blockOrg = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/block",
		{
			onSuccess: onSuccess("Organization blocked"),
		},
	);

	if (entry.subjectType === "user") {
		const userId = entry.subjectId;
		return (
			<div className="flex justify-end gap-1">
				{entry.riskStatus === "flagged" ? (
					<ConfirmAction
						title={`Approve ${entry.label}`}
						description="Clears the flag on the user and their organizations."
						confirmLabel="Approve"
						requireReason={false}
						onConfirm={() =>
							approve.mutateAsync({ params: { path: { userId } } })
						}
					>
						<Button
							size="sm"
							variant="outline"
							disabled={
								!can("POST", `/admin/flagged-accounts/${userId}/approve`)
							}
						>
							<CheckCircle2 /> Approve
						</Button>
					</ConfirmAction>
				) : null}
				<ConfirmAction
					title={`Block ${entry.label}`}
					description="Deactivates the user and signs them out everywhere."
					confirmLabel="Block"
					destructive
					onConfirm={(reason) =>
						blockUser.mutateAsync({
							params: { path: { userId } },
							body: { reason },
						})
					}
				>
					<Button
						size="sm"
						variant="ghost"
						disabled={!can("POST", `/admin/users/${userId}/block`)}
					>
						<UserX /> Block
					</Button>
				</ConfirmAction>
			</div>
		);
	}

	const orgId = entry.subjectId;
	const org = entry.organizations[0];
	return (
		<div className="flex justify-end gap-1">
			{org && !org.riskFlagged ? (
				<ConfirmAction
					title={`Flag ${entry.label}`}
					description="Stops inference and credit purchases until the flag is cleared."
					confirmLabel="Flag"
					destructive
					onConfirm={(reason) =>
						flagOrg.mutateAsync({
							params: { path: { orgId } },
							body: { flagged: true, reason },
						})
					}
				>
					<Button
						size="sm"
						variant="outline"
						disabled={!can("POST", `/admin/organizations/${orgId}/risk-flag`)}
					>
						<Flag /> Flag
					</Button>
				</ConfirmAction>
			) : null}
			<ConfirmAction
				title={`Block ${entry.label}`}
				description="Cancels subscriptions, disables the organization and deactivates its members."
				confirmLabel="Block"
				destructive
				onConfirm={(reason) =>
					blockOrg.mutateAsync({
						params: { path: { orgId } },
						body: { reason },
					})
				}
			>
				<Button
					size="sm"
					variant="ghost"
					disabled={!can("POST", `/admin/organizations/${orgId}/block`)}
				>
					<Ban /> Block
				</Button>
			</ConfirmAction>
		</div>
	);
}
