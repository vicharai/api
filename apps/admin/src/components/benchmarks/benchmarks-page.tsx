"use client";

import { Ban, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ChipPicker } from "@/components/ui/chip-picker";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
	SimpleSelect,
	StatusBadge,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
	JsonBlock,
	KeyValue,
	PageHeader,
	QueryState,
	Section,
} from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import {
	Alert,
	AlertDescription,
	Button,
	Input,
	Label,
	SearchableSelect,
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";

type Run = ApiData<"/admin/benchmarks/runs">["runs"][number];
type Profile = "smoke" | "standard" | "coding" | "load";
type Status =
	"all" | "queued" | "running" | "completed" | "failed" | "canceled";

export function BenchmarksPage() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [status, setStatus] = useState<Status>("all");
	const [open, setOpen] = useState<string | null>(null);
	const runs = api.useQuery(
		"get",
		"/admin/benchmarks/runs",
		{
			params: {
				query: { status: status === "all" ? undefined : status, limit: 100 },
			},
		},
		{ refetchInterval: 15_000 },
	);
	const cancel = api.useMutation("post", "/admin/benchmarks/runs/{id}/cancel", {
		onSuccess: () => {
			toast.success("Run cancelled");
			void invalidate("/admin/benchmarks");
		},
	});

	const columns: ColumnDef<Run>[] = [
		{
			accessorKey: "createdAt",
			header: "Created",
			cell: ({ row }) => formatDateTime(row.original.createdAt),
		},
		{
			accessorKey: "modelId",
			header: "Model",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="font-medium">{row.original.modelId}</div>
					<div className="text-xs text-muted-foreground">
						{row.original.targetCount} target(s) ·{" "}
						{row.original.requestedByEmail ?? "—"}
					</div>
				</div>
			),
		},
		{
			accessorKey: "profile",
			header: "Profile",
			cell: ({ row }) => <Tone tone="info">{row.original.profile}</Tone>,
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<StatusBadge status={row.original.status} />
					{row.original.error ? (
						<div className="max-w-xs truncate text-xs text-destructive">
							{row.original.error}
						</div>
					) : null}
				</div>
			),
		},
		{
			accessorKey: "completedAt",
			header: "Finished",
			cell: ({ row }) => formatDateTime(row.original.completedAt),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) =>
				row.original.status === "queued" ||
				row.original.status === "running" ? (
					<div
						className="flex justify-end"
						onClick={(e) => e.stopPropagation()}
					>
						<ConfirmAction
							title="Cancel benchmark"
							confirmLabel="Cancel run"
							destructive
							requireReason={false}
							onConfirm={() =>
								cancel.mutateAsync({
									params: { path: { id: row.original.id } },
								})
							}
						>
							<Button
								size="sm"
								variant="ghost"
								disabled={
									!can(
										"POST",
										`/admin/benchmarks/runs/${row.original.id}/cancel`,
									)
								}
							>
								<Ban /> Cancel
							</Button>
						</ConfirmAction>
					</div>
				) : null,
		},
	];

	return (
		<>
			<PageHeader
				title="Benchmarks"
				description="Run latency, throughput and capability benchmarks against model mappings through the gateway."
			/>
			<div className="space-y-4">
				<StartRun />
				<Section
					title="Runs"
					actions={
						<SimpleSelect
							value={status}
							onChange={setStatus}
							options={[
								{ value: "all", label: "All" },
								{ value: "queued", label: "Queued" },
								{ value: "running", label: "Running" },
								{ value: "completed", label: "Completed" },
								{ value: "failed", label: "Failed" },
								{ value: "canceled", label: "Canceled" },
							]}
						/>
					}
				>
					<QueryState query={runs}>
						{(data) => (
							<DataTable
								columns={columns}
								data={data.runs}
								getRowId={(r) => r.id}
								onRowClick={(r) => setOpen(r.id)}
								empty="No benchmark runs."
							/>
						)}
					</QueryState>
				</Section>
			</div>
			<Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
				<SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
					<SheetHeader>
						<SheetTitle>Benchmark run</SheetTitle>
					</SheetHeader>
					{open ? <RunDetail id={open} /> : null}
				</SheetContent>
			</Sheet>
		</>
	);
}

function StartRun() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const options = api.useQuery("get", "/admin/benchmarks/options");
	const [modelId, setModelId] = useState("");
	const [mappings, setMappings] = useState<string[]>([]);
	const [profile, setProfile] = useState<Profile>("smoke");
	const [runs, setRuns] = useState("");
	const start = api.useMutation("post", "/admin/benchmarks/runs", {
		onSuccess: () => {
			toast.success("Benchmark queued");
			void invalidate("/admin/benchmarks");
		},
	});
	const model = options.data?.models.find((m) => m.modelId === modelId);

	return (
		<Section title="Start a run">
			{options.data && !options.data.gatewayKeyConfigured ? (
				<Alert variant="destructive" className="mb-3">
					<AlertDescription>
						No gateway key is configured for benchmarks, so runs will fail.
					</AlertDescription>
				</Alert>
			) : null}
			<div className="grid gap-3 md:grid-cols-[2fr_3fr_1fr_1fr_auto] md:items-end">
				<div className="space-y-1.5">
					<Label>Model</Label>
					<SearchableSelect
						value={modelId}
						placeholder="Choose a model"
						onValueChange={(v) => {
							setModelId(v);
							setMappings([]);
						}}
						options={(options.data?.models ?? []).map((m) => ({
							value: m.modelId,
							label: m.modelId,
							keywords: `${m.modelName} ${m.family}`,
						}))}
					/>
				</div>
				<div className="space-y-1.5">
					<Label>Mappings (empty = all active)</Label>
					<ChipPicker
						values={mappings}
						onChange={setMappings}
						options={(model?.mappings ?? [])
							.filter((m) => !m.deactivated)
							.map((m) => ({
								value: m.mapping,
								label: `${m.providerName}${m.region ? ` · ${m.region}` : ""}`,
								keywords: m.mapping,
							}))}
						placeholder="Add mapping…"
						disabled={!model}
					/>
				</div>
				<div className="space-y-1.5">
					<Label>Profile</Label>
					<SimpleSelect
						className="w-full"
						value={profile}
						onChange={setProfile}
						options={(options.data?.profiles ?? []).map((p) => ({
							value: p.name,
							label: p.name,
						}))}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="bm-runs">Runs</Label>
					<Input
						id="bm-runs"
						type="number"
						min={1}
						placeholder="default"
						value={runs}
						onChange={(e) => setRuns(e.target.value)}
					/>
				</div>
				<Button
					disabled={
						!modelId ||
						start.isPending ||
						!can("POST", "/admin/benchmarks/runs")
					}
					onClick={() =>
						start.mutate({
							body: {
								modelId,
								mappings: mappings.length ? mappings : undefined,
								profile,
								runs: runs ? Number(runs) : undefined,
							},
						})
					}
				>
					<Play /> Start
				</Button>
			</div>
			{options.data ? (
				<p className="mt-2 text-xs text-muted-foreground">
					{options.data.profiles.find((p) => p.name === profile)?.description}
				</p>
			) : null}
		</Section>
	);
}

function RunDetail({ id }: { id: string }) {
	const api = useApi();
	const detail = api.useQuery(
		"get",
		"/admin/benchmarks/runs/{id}",
		{ params: { path: { id } } },
		{ refetchInterval: 10_000 },
	);
	return (
		<div className="space-y-4 p-4">
			<QueryState query={detail}>
				{(d) => (
					<>
						<KeyValue
							items={[
								{ label: "Model", value: d.run.modelId },
								{ label: "Profile", value: d.run.profile },
								{
									label: "Status",
									value: <StatusBadge status={d.run.status} />,
								},
								{ label: "Started", value: formatDateTime(d.run.startedAt) },
								{
									label: "Completed",
									value: formatDateTime(d.run.completedAt),
								},
								{ label: "Attempts", value: String(d.run.attempts) },
								{ label: "Budget", value: `${d.run.budgetMs} ms` },
								{ label: "Timeout", value: `${d.run.timeoutMs} ms` },
								{ label: "Seed", value: String(d.run.seed) },
							]}
						/>
						{d.run.error ? (
							<Alert variant="destructive">
								<AlertDescription>{d.run.error}</AlertDescription>
							</Alert>
						) : null}
						<Toolbar>
							{d.targets.map((t) => (
								<Tone key={t.targetId} tone="muted">
									{t.displayName}
								</Tone>
							))}
						</Toolbar>
						{d.result ? (
							<JsonBlock value={d.result} />
						) : (
							<p className="text-sm text-muted-foreground">No results yet.</p>
						)}
					</>
				)}
			</QueryState>
		</div>
	);
}
