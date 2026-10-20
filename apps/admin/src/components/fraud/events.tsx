"use client";

import { Ban, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useAdminSession, useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Pager, Segmented, Toolbar, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import { Button, Label, Switch } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type FraudEvent = ApiData<"/admin/fraud/events">["events"][number];
type Status = "open" | "resolved" | "all";

const PAGE = 50;

function summarize(details: Record<string, unknown>): string {
	return Object.entries(details)
		.filter(([key, v]) => typeof v !== "object" && key !== "intendedAction")
		.map(([key, v]) => `${key}: ${String(v)}`)
		.join(" · ");
}

export function FraudEvents() {
	const api = useApi();
	const ruleId = useSearchParams().get("ruleId") ?? undefined;
	const [status, setStatus] = useState<Status>("open");
	const [offset, setOffset] = useState(0);
	const events = api.useQuery("get", "/admin/fraud/events", {
		params: { query: { status, ruleId, limit: PAGE, offset } },
	});

	const columns: ColumnDef<FraudEvent>[] = [
		{
			accessorKey: "createdAt",
			header: "Raised",
			cell: ({ row }) => formatDateTime(row.original.createdAt),
		},
		{
			id: "rule",
			header: "Rule",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="font-medium">
						{row.original.ruleName ?? "Deleted rule"}
					</div>
					<div className="text-xs text-muted-foreground">
						{row.original.ruleType.replace(/_/g, " ")}
					</div>
				</div>
			),
		},
		{
			id: "subject",
			header: "Subject",
			cell: ({ row }) => {
				const e = row.original;
				return (
					<div className="space-y-0.5">
						<Link
							href={
								(e.subjectType === "user"
									? `/users/${e.subjectId}`
									: `/organizations/${e.subjectId}`) as Route
							}
							className="font-medium hover:underline"
						>
							{e.subjectLabel ?? e.subjectId}
						</Link>
						<div className="max-w-sm truncate text-xs text-muted-foreground">
							{summarize(e.details)}
						</div>
					</div>
				);
			},
		},
		{
			accessorKey: "actionTaken",
			header: "Action",
			cell: ({ row }) => {
				const intended = row.original.details.intendedAction;
				return (
					<div className="flex flex-col items-start gap-1">
						<Tone
							tone={row.original.actionTaken === "notified" ? "info" : "warn"}
						>
							{row.original.actionTaken.replace(/_/g, " ")}
						</Tone>
						{typeof intended === "string" ? (
							<span className="text-xs text-muted-foreground">
								awaiting admin: {intended.replace(/_/g, " ")}
							</span>
						) : null}
					</div>
				);
			},
		},
		{
			id: "resolution",
			header: "Resolution",
			cell: ({ row }) =>
				row.original.resolvedAt ? (
					<div className="max-w-xs text-xs">
						<div>{row.original.resolutionNote}</div>
						<div className="text-muted-foreground">
							{row.original.resolvedByEmail ?? "—"} ·{" "}
							{formatDateTime(row.original.resolvedAt)}
						</div>
					</div>
				) : (
					<Tone tone="warn">open</Tone>
				),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) =>
				row.original.resolvedAt ? null : <EventActions event={row.original} />,
		},
	];

	return (
		<>
			<Toolbar>
				<Segmented
					value={status}
					onChange={(v) => {
						setStatus(v);
						setOffset(0);
					}}
					options={[
						{ value: "open", label: "Open" },
						{ value: "resolved", label: "Resolved" },
						{ value: "all", label: "All" },
					]}
				/>
				{ruleId ? (
					<Button asChild variant="ghost" size="sm">
						<Link href="/fraud/events">Clear rule filter</Link>
					</Button>
				) : null}
				{events.data ? (
					<span className="text-sm text-muted-foreground">
						{formatNumber(events.data.openCount)} open
					</span>
				) : null}
			</Toolbar>
			<DataTable
				columns={columns}
				data={events.data?.events}
				isLoading={events.isLoading}
				getRowId={(row) => row.id}
				empty="No events in this view."
			/>
			{events.data ? (
				<Pager
					offset={offset}
					limit={PAGE}
					total={events.data.total}
					onChange={setOffset}
				/>
			) : null}
		</>
	);
}

function EventActions({ event }: { event: FraudEvent }) {
	const api = useApi();
	const can = useCan();
	const { role } = useAdminSession();
	const invalidate = useInvalidate();
	const [clearFlag, setClearFlag] = useState(false);
	const resolve = api.useMutation("post", "/admin/fraud/events/{id}/resolve", {
		onSuccess: () => {
			toast.success("Event resolved");
			void invalidate("/admin/fraud", "/admin/users", "/admin/organizations");
		},
	});
	const blockOrg = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/block",
		{
			onSuccess: () => {
				toast.success("Organization blocked");
				void invalidate("/admin/fraud", "/admin/organizations");
			},
		},
	);
	const suspended = Array.isArray(event.details.suspendedOrganizationIds);
	const canClear =
		(event.subjectType === "user" && !suspended) || role === "admin";
	const intended = event.details.intendedAction;

	return (
		<div className="flex justify-end gap-1">
			{event.subjectType === "org" && intended === "block_org" ? (
				<ConfirmAction
					title={`Block ${event.subjectLabel ?? event.subjectId}`}
					description="Confirms the rule's intended action: cancels subscriptions, disables the organization and deactivates its members."
					confirmLabel="Block"
					destructive
					onConfirm={(reason) =>
						blockOrg.mutateAsync({
							params: { path: { orgId: event.subjectId } },
							body: { reason },
						})
					}
				>
					<Button
						size="sm"
						variant="ghost"
						disabled={
							!can("POST", `/admin/organizations/${event.subjectId}/block`)
						}
					>
						<Ban /> Block org
					</Button>
				</ConfirmAction>
			) : null}
			<ConfirmAction
				title="Resolve event"
				description="The note is recorded with the event."
				confirmLabel="Resolve"
				onOpenChange={(open) => !open && setClearFlag(false)}
				extra={
					<label className="flex items-center gap-2 text-sm">
						<Switch
							checked={clearFlag}
							disabled={!canClear}
							onCheckedChange={setClearFlag}
						/>
						<Label className="font-normal">
							{event.subjectType === "user"
								? "Also approve the user (clears their risk flag)"
								: "Also clear the organization's risk flag"}
							{suspended ? " and lift the suspension" : ""}
						</Label>
					</label>
				}
				onConfirm={(note) =>
					resolve.mutateAsync({
						params: { path: { id: event.id } },
						body: { note, clearFlag },
					})
				}
			>
				<Button
					size="sm"
					variant="outline"
					disabled={!can("POST", `/admin/fraud/events/${event.id}/resolve`)}
				>
					<CheckCircle2 /> Resolve
				</Button>
			</ConfirmAction>
		</div>
	);
}
