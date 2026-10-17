"use client";

import { Ban } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { StatusBadge, Toolbar, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import {
	Button,
	Input,
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";

type Entry = ApiData<"/admin/model-verifications">["entries"][number];

export function Verifications() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [provider, setProvider] = useState("");
	const [open, setOpen] = useState<string | null>(null);
	const list = api.useQuery(
		"get",
		"/admin/model-verifications",
		{ params: { query: { providerId: provider.trim() || undefined } } },
		{ refetchInterval: 15_000 },
	);
	const cancel = api.useMutation(
		"post",
		"/admin/model-verifications/{id}/cancel",
		{
			onSuccess: () => {
				toast.success("Verification cancelled");
				void invalidate("/admin/model-verifications");
			},
		},
	);

	const columns: ColumnDef<Entry>[] = [
		{
			id: "mapping",
			header: "Mapping",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="font-medium">
						{row.original.providerId}/{row.original.modelName}
					</div>
					<div className="text-xs text-muted-foreground">
						{row.original.region ?? ""} {row.original.initiatedBy} ·{" "}
						{row.original.credentialSource}
					</div>
				</div>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => (
				<StatusBadge status={row.original.verification.status} />
			),
		},
		{
			id: "checks",
			header: "Checks",
			cell: ({ row }) => {
				const checks = row.original.verification.checks;
				const failed = checks.filter((c) => c.status === "failed").length;
				const passed = checks.filter((c) => c.status === "passed").length;
				return (
					<span className="text-xs">
						{passed}/{checks.length} passed
						{failed ? (
							<span className="text-destructive"> · {failed} failed</span>
						) : null}
					</span>
				);
			},
		},
		{
			id: "demoted",
			header: "Demoted",
			cell: ({ row }) =>
				row.original.verification.demotedCapabilities?.length ? (
					<div className="flex flex-wrap gap-1">
						{row.original.verification.demotedCapabilities.map((c) => (
							<Tone key={c} tone="warn">
								{c}
							</Tone>
						))}
					</div>
				) : (
					"—"
				),
		},
		{
			id: "created",
			header: "Created",
			cell: ({ row }) => formatDateTime(row.original.verification.createdAt),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const v = row.original.verification;
				if (v.status !== "queued" && v.status !== "running") {
					return null;
				}
				return (
					<div
						className="flex justify-end"
						onClick={(e) => e.stopPropagation()}
					>
						<ConfirmAction
							title="Cancel verification"
							confirmLabel="Cancel run"
							destructive
							requireReason={false}
							onConfirm={() =>
								cancel.mutateAsync({ params: { path: { id: v.id } } })
							}
						>
							<Button
								size="sm"
								variant="ghost"
								disabled={
									!can("POST", `/admin/model-verifications/${v.id}/cancel`)
								}
							>
								<Ban /> Cancel
							</Button>
						</ConfirmAction>
					</div>
				);
			},
		},
	];

	return (
		<>
			<Toolbar>
				<Input
					className="h-9 w-56"
					placeholder="Filter by provider ID"
					value={provider}
					onChange={(e) => setProvider(e.target.value)}
				/>
				<span className="text-xs text-muted-foreground">
					Queue new runs from the Mappings tab. Refreshes every 15s.
				</span>
			</Toolbar>
			<QueryState query={list}>
				{(data) => (
					<DataTable
						columns={columns}
						data={data.entries}
						getRowId={(e) => e.verification.id}
						onRowClick={(e) => setOpen(e.verification.id)}
						empty="No verifications."
					/>
				)}
			</QueryState>
			<Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
				<SheetContent className="w-full overflow-y-auto sm:max-w-xl">
					<SheetHeader>
						<SheetTitle>Verification</SheetTitle>
					</SheetHeader>
					{open ? <VerificationDetail id={open} /> : null}
				</SheetContent>
			</Sheet>
		</>
	);
}

function VerificationDetail({ id }: { id: string }) {
	const api = useApi();
	const detail = api.useQuery(
		"get",
		"/admin/model-verifications/{id}",
		{ params: { path: { id } } },
		{ refetchInterval: 5_000 },
	);
	return (
		<div className="space-y-3 p-4">
			<QueryState query={detail}>
				{({ entry }) => (
					<>
						<div className="flex items-center gap-2">
							<span className="font-medium">
								{entry.providerId}/{entry.modelName}
							</span>
							<StatusBadge status={entry.verification.status} />
						</div>
						{entry.verification.summary ? (
							<p className="text-sm text-muted-foreground">
								{entry.verification.summary}
							</p>
						) : null}
						<ul className="space-y-2">
							{entry.verification.checks.map((c) => (
								<li key={c.id} className="rounded-md border p-2 text-sm">
									<div className="flex items-center gap-2">
										<StatusBadge status={c.status} />
										<span>{c.label}</span>
									</div>
									{c.feedback ? (
										<p className="mt-1 text-xs text-muted-foreground">
											{c.feedback}
										</p>
									) : null}
									{c.probes?.length ? (
										<ul className="mt-1 space-y-0.5 text-xs">
											{c.probes.map((p, i) => (
												<li key={i}>
													{p.status === "passed" ? "✓" : "✗"} {p.label}
													{p.feedback ? ` — ${p.feedback}` : ""}
												</li>
											))}
										</ul>
									) : null}
								</li>
							))}
						</ul>
					</>
				)}
			</QueryState>
		</div>
	);
}
