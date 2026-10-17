"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { SimpleSelect, Toolbar, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { ErrorState, JsonBlock, KeyValue } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime, formatMs, formatUsd } from "@/lib/utils";

import {
	Button,
	Input,
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";

type Log = ApiData<"/admin/organizations/{orgId}/logs">["logs"][number];
type ErrorType =
	"all" | "any" | "client_error" | "gateway_error" | "upstream_error";

const columns: ColumnDef<Log>[] = [
	{
		accessorKey: "createdAt",
		header: "Time",
		cell: ({ row }) => formatDateTime(row.original.createdAt),
	},
	{
		id: "model",
		header: "Model",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<div className="font-mono text-xs">{row.original.usedModel}</div>
				{row.original.requestedModel &&
				row.original.requestedModel !== row.original.usedModel ? (
					<div className="text-xs text-muted-foreground">
						asked {row.original.requestedModel}
					</div>
				) : null}
			</div>
		),
	},
	{
		id: "status",
		header: "Result",
		cell: ({ row }) => {
			const l = row.original;
			return (
				<div className="flex gap-1">
					{l.hasError ? (
						<Tone tone="bad">{l.unifiedFinishReason ?? "error"}</Tone>
					) : (
						<Tone tone="good">{l.unifiedFinishReason ?? "ok"}</Tone>
					)}
					{l.cached ? <Tone tone="info">cached</Tone> : null}
					{l.retried ? <Tone tone="warn">retried</Tone> : null}
				</div>
			);
		},
	},
	{
		id: "tokens",
		header: "Tokens",
		cell: ({ row }) =>
			`${formatNumber(Number(row.original.promptTokens ?? 0))} → ${formatNumber(Number(row.original.completionTokens ?? 0))}`,
	},
	{
		id: "latency",
		header: "Latency",
		cell: ({ row }) => (
			<span className="tabular-nums">
				{formatMs(row.original.duration)}
				{row.original.timeToFirstToken ? (
					<span className="ml-1 text-xs text-muted-foreground">
						ttft {formatMs(row.original.timeToFirstToken)}
					</span>
				) : null}
			</span>
		),
	},
	{
		id: "cost",
		header: "Cost",
		cell: ({ row }) => formatUsd(row.original.cost, true),
	},
	{
		id: "who",
		header: "Key / source",
		cell: ({ row }) => (
			<div className="max-w-56 truncate text-xs text-muted-foreground">
				{row.original.apiKeyName ?? row.original.apiKeyId}
				{row.original.source ? ` · ${row.original.source}` : ""}
				{row.original.apiKeyUserEmail
					? ` · ${row.original.apiKeyUserEmail}`
					: ""}
			</div>
		),
	},
];

export function LogsExplorer({
	orgId,
	projectId,
}: {
	orgId: string;
	projectId?: string;
}) {
	const api = useApi();
	const [filters, setFilters] = useState({
		provider: "",
		model: "",
		source: "",
		finish: "",
		userEmail: "",
	});
	const [errorType, setErrorType] = useState<ErrorType>("all");
	const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
	const [open, setOpen] = useState<Log | null>(null);
	const debounced = useDebouncedValue(filters, 400);

	const cursor = cursors[cursors.length - 1];
	const query = {
		limit: 50,
		cursor,
		provider: debounced.provider || undefined,
		model: debounced.model || undefined,
		source: debounced.source || undefined,
		unifiedFinishReason: debounced.finish || undefined,
		userEmail: debounced.userEmail || undefined,
		errorType: errorType === "all" ? undefined : errorType,
	};
	const orgLogs = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/logs",
		{ params: { path: { orgId }, query } },
		{ enabled: !projectId },
	);
	const projectLogs = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/projects/{projectId}/logs",
		{ params: { path: { orgId, projectId: projectId ?? "" }, query } },
		{ enabled: Boolean(projectId) },
	);
	const logs = projectId ? projectLogs : orgLogs;
	const logsError: unknown = logs.error;

	function update(key: keyof typeof filters, value: string) {
		setFilters((f) => ({ ...f, [key]: value }));
		setCursors([undefined]);
	}

	return (
		<div>
			<Toolbar>
				<Input
					className="h-9 w-36"
					placeholder="Provider"
					value={filters.provider}
					onChange={(e) => update("provider", e.target.value)}
				/>
				<Input
					className="h-9 w-48"
					placeholder="Model (provider/model)"
					value={filters.model}
					onChange={(e) => update("model", e.target.value)}
				/>
				<Input
					className="h-9 w-32"
					placeholder="Source"
					value={filters.source}
					onChange={(e) => update("source", e.target.value)}
				/>
				<Input
					className="h-9 w-36"
					placeholder="Finish reason"
					value={filters.finish}
					onChange={(e) => update("finish", e.target.value)}
				/>
				<Input
					className="h-9 w-48"
					placeholder="Key user email"
					value={filters.userEmail}
					onChange={(e) => update("userEmail", e.target.value)}
				/>
				<SimpleSelect
					value={errorType}
					onChange={(v) => {
						setErrorType(v);
						setCursors([undefined]);
					}}
					options={[
						{ value: "all", label: "All results" },
						{ value: "any", label: "Any error" },
						{ value: "upstream_error", label: "Upstream errors" },
						{ value: "gateway_error", label: "Gateway errors" },
						{ value: "client_error", label: "Client errors" },
					]}
				/>
			</Toolbar>
			{logsError ? (
				<ErrorState error={logsError} />
			) : (
				<DataTable
					columns={columns}
					data={logs.data?.logs}
					isLoading={logs.isLoading}
					getRowId={(l) => l.id}
					onRowClick={setOpen}
					empty="No logs match. Logs may be pruned by the org's retention setting."
				/>
			)}
			<div className="mt-3 flex justify-end gap-1">
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Newer"
					disabled={cursors.length <= 1}
					onClick={() => setCursors((c) => c.slice(0, -1))}
				>
					<ChevronLeft />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Older"
					disabled={!logs.data?.pagination.hasMore}
					onClick={() => {
						const next = logs.data?.pagination.nextCursor;
						if (next) {
							setCursors((c) => [...c, next]);
						}
					}}
				>
					<ChevronRight />
				</Button>
			</div>
			<Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
				<SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
					<SheetHeader>
						<SheetTitle>Request {open?.requestId ?? open?.id}</SheetTitle>
					</SheetHeader>
					{open ? <LogDetail log={open} /> : null}
				</SheetContent>
			</Sheet>
		</div>
	);
}

function LogDetail({ log }: { log: Log }) {
	return (
		<div className="space-y-4 p-4">
			<KeyValue
				items={[
					{ label: "Time", value: formatDateTime(log.createdAt) },
					{ label: "Project", value: log.projectName ?? log.projectId },
					{ label: "Provider", value: log.usedProvider },
					{ label: "Model", value: log.usedModel },
					{ label: "Mapping", value: log.usedModelMapping ?? "—" },
					{ label: "Mode", value: `${log.mode} → ${log.usedMode}` },
					{ label: "Finish", value: log.finishReason ?? "—" },
					{ label: "Streamed", value: log.streamed ? "yes" : "no" },
					{ label: "Duration", value: formatMs(log.duration) },
					{ label: "Cost", value: formatUsd(log.cost, true) },
					{ label: "Trace", value: log.traceId ?? "—" },
					{ label: "Session", value: log.sessionId ?? "—" },
				]}
			/>
			{log.errorDetails ? (
				<div className="space-y-1">
					<h3 className="text-sm font-medium">Error</h3>
					<JsonBlock value={log.errorDetails} />
				</div>
			) : null}
			{log.messages ? (
				<div className="space-y-1">
					<h3 className="text-sm font-medium">Messages</h3>
					<JsonBlock value={log.messages} />
				</div>
			) : null}
			{log.content ? (
				<div className="space-y-1">
					<h3 className="text-sm font-medium">Response</h3>
					<JsonBlock value={log.content} />
				</div>
			) : null}
			{log.routingMetadata ? (
				<div className="space-y-1">
					<h3 className="text-sm font-medium">Routing</h3>
					<JsonBlock value={log.routingMetadata} />
				</div>
			) : null}
		</div>
	);
}
