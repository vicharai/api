"use client";

import { Download, LayoutGrid, ListChecks, Plus, Table2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type DragEvent } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
	SearchInput,
	SimpleSelect,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
	PageHeader,
	QueryState,
	StatCard,
	StatGrid,
} from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { cn, downloadCsv, formatDate, formatUsd } from "@/lib/utils";

import { buildCsv } from "@llmgateway/shared";
import { Button, Card } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import {
	AccountFields,
	toAccountBody,
	toAccountForm,
	type AccountFormState,
} from "./account-form";
import { SEGMENTS, STAGES } from "./crm-shared";

import type { CrmAccount, CrmSegment, CrmStage } from "@/lib/api/admin-types";
import type { Route } from "next";

const ALL = "__all__";

const PRIORITY_TONE = { low: "muted", medium: "info", high: "warn" } as const;

const columns: ColumnDef<CrmAccount>[] = [
	{
		accessorKey: "name",
		header: "Account",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<Link
					href={`/crm/${row.original.id}` as Route}
					className="font-medium hover:underline"
				>
					{row.original.name}
				</Link>
				<div className="text-xs text-muted-foreground">
					{row.original.domain ?? "—"} · {row.original.ownerEmail ?? "unowned"}
				</div>
			</div>
		),
	},
	{
		accessorKey: "stage",
		header: "Stage",
		cell: ({ row }) => <Tone tone="info">{row.original.stage}</Tone>,
	},
	{
		accessorKey: "segment",
		header: "Segment",
		cell: ({ row }) =>
			SEGMENTS.find((s) => s.value === row.original.segment)?.label,
	},
	{
		accessorKey: "priority",
		header: "Priority",
		cell: ({ row }) => (
			<Tone tone={PRIORITY_TONE[row.original.priority]}>
				{row.original.priority}
			</Tone>
		),
	},
	{
		id: "acv",
		accessorFn: (a) => Number(a.annualContractValue ?? 0),
		header: "ACV",
		cell: ({ row }) => formatUsd(row.original.annualContractValue),
	},
	{
		id: "deal",
		accessorFn: (a) => Number(a.dealValue ?? 0),
		header: "Deal",
		cell: ({ row }) => formatUsd(row.original.dealValue),
	},
	{
		accessorKey: "last30dSpend",
		header: "30d spend",
		cell: ({ row }) => formatUsd(row.original.last30dSpend),
	},
	{
		id: "tasks",
		accessorFn: (a) => a.openTaskCount,
		header: "Tasks",
		cell: ({ row }) => (
			<span>
				{row.original.openTaskCount}
				{row.original.overdueTaskCount ? (
					<span className="ml-1 text-destructive">
						({row.original.overdueTaskCount} overdue)
					</span>
				) : null}
			</span>
		),
	},
	{
		accessorKey: "expectedCloseDate",
		header: "Close",
		cell: ({ row }) => formatDate(row.original.expectedCloseDate),
	},
	{
		accessorKey: "lastActivityAt",
		header: "Last touch",
		cell: ({ row }) => formatDate(row.original.lastActivityAt),
	},
];

export function CrmPage() {
	const api = useApi();
	const can = useCan();
	const router = useRouter();
	const invalidate = useInvalidate();
	const [view, setView] = useState<"board" | "table">("board");
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim());
	const [stage, setStage] = useState<string>(ALL);
	const [segment, setSegment] = useState<string>(ALL);
	const accounts = api.useQuery("get", "/admin/crm/accounts", {
		params: {
			query: {
				search: search || undefined,
				stage: stage === ALL ? undefined : (stage as CrmStage),
				segment: segment === ALL ? undefined : (segment as CrmSegment),
			},
		},
	});
	const patch = api.useMutation("patch", "/admin/crm/accounts/{id}", {
		onSuccess: (res) => {
			toast.success(`${res.account.name} moved to ${res.account.stage}`);
			void invalidate("/admin/crm");
		},
	});

	function exportCsv() {
		if (!accounts.data) {
			return;
		}
		downloadCsv(
			"crm-accounts.csv",
			buildCsv(
				[
					"id",
					"name",
					"domain",
					"segment",
					"stage",
					"priority",
					"dealValue",
					"annualContractValue",
					"expectedCloseDate",
					"ownerEmail",
					"openTasks",
					"overdueTasks",
					"last30dSpend",
					"lastActivityAt",
				],
				accounts.data.accounts.map((a) => [
					a.id,
					a.name,
					a.domain,
					a.segment,
					a.stage,
					a.priority,
					a.dealValue,
					a.annualContractValue,
					a.expectedCloseDate,
					a.ownerEmail,
					a.openTaskCount,
					a.overdueTaskCount,
					a.last30dSpend,
					a.lastActivityAt,
				]),
			),
		);
	}

	const canMove = can("PATCH", "/admin/crm/accounts/x");

	return (
		<>
			<PageHeader
				title="CRM"
				description="Enterprise pipeline: accounts, deals, contacts and follow-ups."
				actions={
					<>
						<Button asChild size="sm" variant="outline">
							<Link href="/crm/tasks">
								<ListChecks /> Tasks
							</Link>
						</Button>
						<Button size="sm" variant="outline" onClick={exportCsv}>
							<Download /> CSV
						</Button>
						<NewAccountDialog />
					</>
				}
			/>
			{accounts.data ? (
				<div className="mb-4">
					<StatGrid>
						<StatCard
							label="Contracted ACV"
							value={formatUsd(accounts.data.kpis.contractedAcv)}
						/>
						<StatCard
							label="Open pipeline"
							value={formatUsd(accounts.data.kpis.openPipeline)}
						/>
						<StatCard
							label="Trials / leads"
							value={`${formatNumber(accounts.data.kpis.trials)} / ${formatNumber(accounts.data.kpis.leads)}`}
						/>
						<StatCard
							label="Need attention"
							value={formatNumber(accounts.data.kpis.needsAttention)}
							tone={accounts.data.kpis.needsAttention ? "warn" : undefined}
							hint="Overdue tasks or no recent activity"
						/>
					</StatGrid>
				</div>
			) : null}
			<Toolbar>
				<SearchInput
					value={query}
					onChange={setQuery}
					placeholder="Name or domain"
				/>
				<SimpleSelect
					value={stage}
					onChange={setStage}
					options={[{ value: ALL, label: "All stages" }, ...STAGES]}
				/>
				<SimpleSelect
					value={segment}
					onChange={setSegment}
					options={[{ value: ALL, label: "All segments" }, ...SEGMENTS]}
				/>
				<div className="ml-auto flex gap-1">
					<Button
						size="icon-sm"
						variant={view === "board" ? "secondary" : "ghost"}
						aria-label="Board view"
						onClick={() => setView("board")}
					>
						<LayoutGrid />
					</Button>
					<Button
						size="icon-sm"
						variant={view === "table" ? "secondary" : "ghost"}
						aria-label="Table view"
						onClick={() => setView("table")}
					>
						<Table2 />
					</Button>
				</div>
			</Toolbar>
			<QueryState query={accounts} rows={6}>
				{(data) =>
					view === "table" ? (
						<DataTable
							columns={columns}
							data={data.accounts}
							getRowId={(a) => a.id}
							onRowClick={(a) => router.push(`/crm/${a.id}` as Route)}
							empty="No accounts yet."
						/>
					) : (
						<Board
							accounts={data.accounts}
							canMove={canMove}
							onMove={(account, next) =>
								patch.mutate({
									params: { path: { id: account.id } },
									body: { stage: next },
								})
							}
						/>
					)
				}
			</QueryState>
		</>
	);
}

function Board({
	accounts,
	canMove,
	onMove,
}: {
	accounts: CrmAccount[];
	canMove: boolean;
	onMove: (account: CrmAccount, stage: CrmStage) => void;
}) {
	const [over, setOver] = useState<CrmStage | null>(null);

	function onDrop(event: DragEvent<HTMLDivElement>, stage: CrmStage) {
		event.preventDefault();
		setOver(null);
		const id = event.dataTransfer.getData("text/plain");
		const account = accounts.find((a) => a.id === id);
		if (account && account.stage !== stage) {
			onMove(account, stage);
		}
	}

	return (
		<div className="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
			{STAGES.map((stage) => {
				const items = accounts.filter((a) => a.stage === stage.value);
				const total = items.reduce(
					(sum, a) => sum + Number(a.annualContractValue ?? a.dealValue ?? 0),
					0,
				);
				return (
					<div
						key={stage.value}
						onDragOver={(e) => {
							if (canMove) {
								e.preventDefault();
								setOver(stage.value);
							}
						}}
						onDragLeave={() => setOver(null)}
						onDrop={(e) => onDrop(e, stage.value)}
						className={cn(
							"flex min-h-64 flex-col gap-2 rounded-lg bg-muted/60 p-2",
							over === stage.value && "ring-2 ring-ring",
						)}
					>
						<div className="flex items-baseline justify-between px-1">
							<span className="text-sm font-medium">{stage.label}</span>
							<span className="text-xs text-muted-foreground">
								{items.length} · {formatUsd(total)}
							</span>
						</div>
						{items.map((a) => (
							<Card
								key={a.id}
								draggable={canMove}
								onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)}
								className={cn(
									"gap-1 p-3",
									canMove && "cursor-grab active:cursor-grabbing",
								)}
							>
								<Link
									href={`/crm/${a.id}` as Route}
									className="truncate text-sm font-medium hover:underline"
								>
									{a.name}
								</Link>
								<div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
									<Tone tone={PRIORITY_TONE[a.priority]}>{a.priority}</Tone>
									{formatUsd(a.annualContractValue ?? a.dealValue)}
									{a.overdueTaskCount ? (
										<Tone tone="bad">{a.overdueTaskCount} overdue</Tone>
									) : null}
								</div>
								{a.expectedCloseDate ? (
									<div className="text-xs text-muted-foreground">
										closes {formatDate(a.expectedCloseDate)}
									</div>
								) : null}
							</Card>
						))}
					</div>
				);
			})}
		</div>
	);
}

function NewAccountDialog() {
	const api = useApi();
	const can = useCan();
	const router = useRouter();
	const invalidate = useInvalidate();
	const [form, setForm] = useState<AccountFormState>(() => toAccountForm());
	const create = api.useMutation("post", "/admin/crm/accounts", {
		onSuccess: (res) => {
			toast.success("Account created");
			void invalidate("/admin/crm");
			router.push(`/crm/${res.account.id}` as Route);
		},
	});

	return (
		<ConfirmAction
			title="New account"
			wide
			confirmLabel="Create"
			requireReason={false}
			confirmDisabled={!form.name.trim()}
			extra={<AccountFields form={form} onChange={setForm} />}
			onConfirm={async () => {
				const body = toAccountBody(form);
				await create.mutateAsync({ body: { ...body, name: form.name.trim() } });
				setForm(toAccountForm());
			}}
		>
			<Button size="sm" disabled={!can("POST", "/admin/crm/accounts")}>
				<Plus /> New account
			</Button>
		</ConfirmAction>
	);
}
