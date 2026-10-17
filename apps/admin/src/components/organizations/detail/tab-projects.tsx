"use client";

import { useState } from "react";

import { TimeSeriesChart } from "@/components/ui/charts";
import {
	SimpleSelect,
	StatusBadge,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, Section, StatCard, StatGrid } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatDate, formatUsd } from "@/lib/utils";

import { Button } from "@llmgateway/shared/components";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import { LogsExplorer } from "./logs-explorer";
import { ORG_WINDOWS, pivotTimeseries, type OrgWindow } from "./shared";

import type { ApiData } from "@/lib/api/types";

type Project =
	ApiData<"/admin/organizations/{orgId}/projects">["projects"][number];
type MappingStat =
	ApiData<"/admin/organizations/{orgId}/projects/{projectId}/model-provider-stats">["mappings"][number];

const statColumns: ColumnDef<MappingStat>[] = [
	{ accessorKey: "modelId", header: "Model" },
	{ accessorKey: "providerName", header: "Provider" },
	{
		accessorKey: "logsCount",
		header: "Requests",
		cell: ({ row }) => formatNumber(row.original.logsCount),
	},
	{
		accessorKey: "errorsCount",
		header: "Errors",
		cell: ({ row }) => (
			<span
				className={
					row.original.errorsCount > 0 ? "text-destructive" : undefined
				}
			>
				{formatNumber(row.original.errorsCount)}
				<span className="ml-1 text-xs text-muted-foreground">
					{row.original.upstreamErrorsCount}u/{row.original.gatewayErrorsCount}
					g/
					{row.original.clientErrorsCount}c
				</span>
			</span>
		),
	},
	{
		accessorKey: "totalTokens",
		header: "Tokens",
		cell: ({ row }) => formatCompactNumber(row.original.totalTokens),
	},
	{
		accessorKey: "cost",
		header: "Cost",
		cell: ({ row }) => formatUsd(row.original.cost, true),
	},
];

export function OrgProjectsTab({ orgId }: { orgId: string }) {
	const api = useApi();
	const [selected, setSelected] = useState<string | null>(null);
	const projects = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/projects",
		{ params: { path: { orgId } } },
	);

	const columns: ColumnDef<Project>[] = [
		{
			accessorKey: "name",
			header: "Project",
			cell: ({ row }) => (
				<span className="font-medium">{row.original.name}</span>
			),
		},
		{
			accessorKey: "mode",
			header: "Mode",
			cell: ({ row }) => <Tone tone="muted">{row.original.mode}</Tone>,
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			accessorKey: "cachingEnabled",
			header: "Caching",
			cell: ({ row }) => (row.original.cachingEnabled ? "on" : "off"),
		},
		{
			accessorKey: "createdAt",
			header: "Created",
			cell: ({ row }) => formatDate(row.original.createdAt),
		},
		{
			id: "open",
			header: "",
			cell: ({ row }) => (
				<div className="flex justify-end">
					<Button
						size="sm"
						variant={selected === row.original.id ? "default" : "outline"}
						onClick={() =>
							setSelected(selected === row.original.id ? null : row.original.id)
						}
					>
						{selected === row.original.id ? "Hide" : "Details"}
					</Button>
				</div>
			),
		},
	];

	return (
		<div className="space-y-4">
			<QueryState query={projects}>
				{(data) => (
					<DataTable
						columns={columns}
						data={data.projects}
						getRowId={(p) => p.id}
						empty="No projects."
					/>
				)}
			</QueryState>
			{selected ? <ProjectDetail orgId={orgId} projectId={selected} /> : null}
		</div>
	);
}

function ProjectDetail({
	orgId,
	projectId,
}: {
	orgId: string;
	projectId: string;
}) {
	const api = useApi();
	const [range, setRange] = useState<OrgWindow>("7d");
	const path = { orgId, projectId };
	const metrics = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/projects/{projectId}/metrics",
		{ params: { path, query: { window: range } } },
	);
	const stats = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/projects/{projectId}/model-provider-stats",
		{
			params: { path, query: { sortBy: "cost", sortOrder: "desc", limit: 50 } },
		},
	);
	const ts = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/projects/{projectId}/cost-by-model-timeseries",
		{
			params: {
				path,
				query: {
					window: range,
					bucket: ["1h", "4h", "12h", "1d"].includes(range) ? "hour" : "day",
				},
			},
		},
	);

	return (
		<div className="space-y-4 rounded-lg border p-4">
			<Toolbar>
				<SimpleSelect value={range} onChange={setRange} options={ORG_WINDOWS} />
			</Toolbar>
			<QueryState query={metrics} rows={2}>
				{(m) => (
					<StatGrid>
						<StatCard
							label="Project"
							value={<span className="text-lg">{m.project.name}</span>}
							hint={m.project.id}
						/>
						<StatCard label="Requests" value={formatNumber(m.totalRequests)} />
						<StatCard
							label="Tokens"
							value={formatCompactNumber(m.totalTokens)}
						/>
						<StatCard
							label="Cost"
							value={formatUsd(m.totalCost)}
							hint={`top: ${m.mostUsedModel ?? "—"}`}
						/>
					</StatGrid>
				)}
			</QueryState>
			<Section title="Cost over time">
				<QueryState query={ts} rows={4}>
					{(data) => {
						const { rows, keys } = pivotTimeseries(data.data, "cost");
						return (
							<TimeSeriesChart
								data={rows}
								xKey="timestamp"
								kind="bar"
								stacked
								hourly={data.bucket === "hour"}
								series={keys.map((name, i) => ({
									key: name === "other" ? "other" : `s${i}`,
									label: name === "other" ? "Other" : name,
								}))}
								valueFormatter={(v) => formatUsd(v)}
							/>
						);
					}}
				</QueryState>
			</Section>
			<Section title="Models and providers (all time)">
				<QueryState query={stats}>
					{(data) => (
						<DataTable
							columns={statColumns}
							data={data.mappings}
							getRowId={(r) => `${r.providerId}/${r.modelId}`}
							empty="No traffic."
						/>
					)}
				</QueryState>
			</Section>
			<Section title="Project logs">
				<LogsExplorer orgId={orgId} projectId={projectId} />
			</Section>
		</div>
	);
}
