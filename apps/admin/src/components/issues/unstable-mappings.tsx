"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect, Toolbar, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { JsonBlock, QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime, formatPercent } from "@/lib/utils";

import {
	Button,
	Input,
	Label,
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	Switch,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";

type Mapping = ApiData<"/admin/unstable-mappings">["mappings"][number];
type ErrorWindow =
	"1h" | "2h" | "4h" | "8h" | "12h" | "16h" | "24h" | "3d" | "7d";
type Matcher =
	ApiData<"/admin/unstable-mappings/ignored-errors">["matchers"][number];

const WINDOWS: { value: ErrorWindow; label: string }[] = [
	{ value: "1h", label: "1 hour" },
	{ value: "4h", label: "4 hours" },
	{ value: "12h", label: "12 hours" },
	{ value: "24h", label: "24 hours" },
	{ value: "3d", label: "3 days" },
	{ value: "7d", label: "7 days" },
];

const bool = (v: boolean) => (v ? "true" : "false");

export function UnstableMappings() {
	const api = useApi();
	const [range, setRange] = useState<ErrorWindow>("24h");
	const [opts, setOpts] = useState({
		includeRetried: false,
		ignoreExpected: true,
		splitByKey: false,
		includeByok: false,
	});
	const [selected, setSelected] = useState<Mapping | null>(null);
	const list = api.useQuery("get", "/admin/unstable-mappings", {
		params: {
			query: {
				window: range,
				limit: 100,
				includeRetried: bool(opts.includeRetried),
				ignoreExpected: bool(opts.ignoreExpected),
				splitByKey: bool(opts.splitByKey),
				includeByok: bool(opts.includeByok),
			},
		},
	});

	const columns: ColumnDef<Mapping>[] = [
		{
			accessorKey: "usedModel",
			header: "Mapping",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="font-mono text-xs">{row.original.usedModel}</div>
					<div className="text-xs text-muted-foreground">
						{row.original.providerName}
						{row.original.providerKeyLabel
							? ` · key ${row.original.providerKeyLabel}`
							: ""}
						{row.original.providerKeyManaged === false ? " · BYOK" : ""}
					</div>
				</div>
			),
		},
		{
			accessorKey: "errorRate",
			header: "Error rate",
			cell: ({ row }) => (
				<Tone
					tone={
						row.original.errorRate >= 0.25
							? "bad"
							: row.original.errorRate >= 0.05
								? "warn"
								: "muted"
					}
				>
					{formatPercent(row.original.errorRate * 100)}
				</Tone>
			),
		},
		{
			accessorKey: "errorsCount",
			header: "Errors",
			cell: ({ row }) => formatNumber(row.original.errorsCount),
		},
		{
			accessorKey: "logsCount",
			header: "Sampled",
			cell: ({ row }) => formatNumber(row.original.logsCount),
		},
	];

	return (
		<div className="space-y-4">
			<Section
				title="Unstable mappings"
				description={
					list.data
						? `Ranked by error rate over the last ${formatNumber(list.data.sampledLogs)} sampled requests in ${list.data.windowHours}h. ${list.data.ignoredMatcherCount} ignore rule(s) applied.`
						: "Provider/model mappings with errors, worst first."
				}
			>
				<Toolbar>
					<SimpleSelect value={range} onChange={setRange} options={WINDOWS} />
					{(
						[
							["includeRetried", "Include retried"],
							["ignoreExpected", "Hide expected errors"],
							["splitByKey", "Split by key"],
							["includeByok", "Include BYOK"],
						] as const
					).map(([key, label]) => (
						<label key={key} className="flex items-center gap-2 text-sm">
							<Switch
								checked={opts[key]}
								onCheckedChange={(v) => setOpts((o) => ({ ...o, [key]: v }))}
							/>
							{label}
						</label>
					))}
				</Toolbar>
				<QueryState query={list}>
					{(data) => (
						<DataTable
							columns={columns}
							data={data.mappings}
							getRowId={(m) =>
								`${m.providerId}/${m.usedModel}/${m.providerKeyId ?? ""}`
							}
							onRowClick={setSelected}
							empty="No failing mappings in this window."
						/>
					)}
				</QueryState>
			</Section>
			<IgnoredErrors />
			<Sheet
				open={selected !== null}
				onOpenChange={(v) => !v && setSelected(null)}
			>
				<SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
					<SheetHeader>
						<SheetTitle className="font-mono text-sm">
							{selected?.usedModel}
						</SheetTitle>
					</SheetHeader>
					{selected ? (
						<MappingErrors
							mapping={selected}
							range={range}
							includeRetried={opts.includeRetried}
							ignoreExpected={opts.ignoreExpected}
							includeByok={opts.includeByok}
						/>
					) : null}
				</SheetContent>
			</Sheet>
		</div>
	);
}

function MappingErrors({
	mapping,
	range,
	includeRetried,
	ignoreExpected,
	includeByok,
}: {
	mapping: Mapping;
	range: ErrorWindow;
	includeRetried: boolean;
	ignoreExpected: boolean;
	includeByok: boolean;
}) {
	const api = useApi();
	const errors = api.useQuery("get", "/admin/unstable-mappings/errors", {
		params: {
			query: {
				model: mapping.usedModel,
				provider: mapping.providerId,
				window: range,
				includeRetried: bool(includeRetried),
				ignoreExpected: bool(ignoreExpected),
				includeByok: bool(includeByok),
				providerKeyId: mapping.providerKeyId ?? undefined,
			},
		},
	});
	return (
		<div className="space-y-3 p-4">
			<QueryState query={errors}>
				{(data) =>
					data.errors.length === 0 ? (
						<p className="text-sm text-muted-foreground">No error samples.</p>
					) : (
						<>
							<p className="text-sm text-muted-foreground">
								{formatNumber(data.sampledErrors)} errors sampled, grouped by
								response.
							</p>
							{data.errors.map((e, i) => (
								<div key={i} className="space-y-1 rounded-md border p-3">
									<div className="flex flex-wrap items-center gap-2 text-sm">
										<Tone tone="bad">{e.statusCode ?? "no status"}</Tone>
										{e.classification ? (
											<Tone tone="muted">{e.classification}</Tone>
										) : null}
										{e.streamed ? <Tone tone="info">streamed</Tone> : null}
										<span className="ml-auto font-medium tabular-nums">
											×{formatNumber(e.count)}
										</span>
									</div>
									{e.cause ? (
										<p className="text-xs text-muted-foreground">{e.cause}</p>
									) : null}
									{e.responseText ? <JsonBlock value={e.responseText} /> : null}
								</div>
							))}
						</>
					)
				}
			</QueryState>
		</div>
	);
}

function IgnoredErrors() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [pattern, setPattern] = useState("");
	const [statusCode, setStatusCode] = useState("");
	const list = api.useQuery("get", "/admin/unstable-mappings/ignored-errors");
	const done = (message: string) => () => {
		toast.success(message);
		void invalidate("/admin/unstable-mappings");
	};
	const add = api.useMutation(
		"post",
		"/admin/unstable-mappings/ignored-errors",
		{
			onSuccess: done("Ignore rule added"),
		},
	);
	const remove = api.useMutation(
		"delete",
		"/admin/unstable-mappings/ignored-errors/{id}",
		{ onSuccess: done("Ignore rule removed") },
	);

	const columns: ColumnDef<Matcher>[] = [
		{
			accessorKey: "pattern",
			header: "Pattern",
			cell: ({ row }) =>
				row.original.pattern ? (
					<code className="text-xs">{row.original.pattern}</code>
				) : (
					"—"
				),
		},
		{
			accessorKey: "statusCode",
			header: "Status",
			cell: ({ row }) => row.original.statusCode ?? "any",
		},
		{
			accessorKey: "createdAt",
			header: "Added",
			cell: ({ row }) => formatDateTime(row.original.createdAt),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex justify-end">
					<ConfirmAction
						title="Remove ignore rule"
						confirmLabel="Remove"
						destructive
						requireReason={false}
						onConfirm={() =>
							remove.mutateAsync({ params: { path: { id: row.original.id } } })
						}
					>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Remove"
							disabled={
								!can(
									"DELETE",
									`/admin/unstable-mappings/ignored-errors/${row.original.id}`,
								)
							}
						>
							<Trash2 />
						</Button>
					</ConfirmAction>
				</div>
			),
		},
	];

	return (
		<Section
			title="Ignored errors"
			description="Errors matching these rules count as successes in the ranking (e.g. expected client mistakes)."
			actions={
				<ConfirmAction
					title="Add ignore rule"
					description="Match on response text (case-insensitive substring), status code, or both."
					confirmLabel="Add"
					requireReason={false}
					confirmDisabled={!pattern.trim() && !statusCode}
					extra={
						<div className="grid grid-cols-3 gap-3">
							<div className="col-span-2 space-y-1.5">
								<Label htmlFor="ig-pattern">Pattern</Label>
								<Input
									id="ig-pattern"
									value={pattern}
									onChange={(e) => setPattern(e.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="ig-status">Status</Label>
								<Input
									id="ig-status"
									type="number"
									value={statusCode}
									onChange={(e) => setStatusCode(e.target.value)}
								/>
							</div>
						</div>
					}
					onConfirm={async () => {
						await add.mutateAsync({
							body: {
								pattern: pattern.trim() || null,
								statusCode: statusCode ? Number(statusCode) : null,
							},
						});
						setPattern("");
						setStatusCode("");
					}}
				>
					<Button
						size="sm"
						variant="outline"
						disabled={!can("POST", "/admin/unstable-mappings/ignored-errors")}
					>
						<Plus /> Add rule
					</Button>
				</ConfirmAction>
			}
		>
			<QueryState query={list}>
				{(data) => (
					<DataTable
						columns={columns}
						data={data.matchers}
						getRowId={(m) => m.id}
						empty="No ignore rules."
					/>
				)}
			</QueryState>
		</Section>
	);
}
