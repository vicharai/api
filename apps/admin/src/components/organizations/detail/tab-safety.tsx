"use client";

import { useState } from "react";

import { BarList, TimeSeriesChart } from "@/components/ui/charts";
import { SimpleSelect, StatusBadge, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
	EmptyState,
	QueryState,
	Section,
	StatCard,
	StatGrid,
} from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime, formatPercent } from "@/lib/utils";

import { formatNumber } from "@llmgateway/shared/number-format";

import { ORG_WINDOWS, type OrgWindow } from "./shared";

import type { ApiData } from "@/lib/api/types";

type Guardrails = ApiData<"/admin/organizations/{orgId}/guardrails">;
type Violation = Guardrails["violations"]["recent"][number];
type Rule = Guardrails["rules"][number];

const violationColumns: ColumnDef<Violation>[] = [
	{
		accessorKey: "createdAt",
		header: "When",
		cell: ({ row }) => formatDateTime(row.original.createdAt),
	},
	{ accessorKey: "ruleName", header: "Rule" },
	{ accessorKey: "category", header: "Category" },
	{
		accessorKey: "actionTaken",
		header: "Action",
		cell: ({ row }) => <Tone tone="warn">{row.original.actionTaken}</Tone>,
	},
	{
		accessorKey: "model",
		header: "Model",
		cell: ({ row }) => row.original.model ?? "—",
	},
];

const ruleColumns: ColumnDef<Rule>[] = [
	{ accessorKey: "name", header: "Rule" },
	{ accessorKey: "type", header: "Type" },
	{ accessorKey: "action", header: "Action" },
	{ accessorKey: "priority", header: "Priority" },
	{
		accessorKey: "enabled",
		header: "Enabled",
		cell: ({ row }) => (
			<StatusBadge status={row.original.enabled ? "active" : "inactive"} />
		),
	},
];

export function OrgSafetyTab({ orgId }: { orgId: string }) {
	const api = useApi();
	const [range, setRange] = useState<OrgWindow>("7d");
	const guardrails = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/guardrails",
		{ params: { path: { orgId } } },
	);
	const contentFilter = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/content-filter",
		{ params: { path: { orgId }, query: { window: range } } },
	);

	return (
		<div className="space-y-4">
			<Section
				title="Content filter activity"
				description="Sampled requests checked by the platform content classifier."
				actions={
					<SimpleSelect
						value={range}
						onChange={setRange}
						options={ORG_WINDOWS}
					/>
				}
			>
				<QueryState query={contentFilter}>
					{(cf) => (
						<div className="space-y-4">
							<StatGrid>
								<StatCard
									label="Sampled"
									value={formatNumber(cf.totals.sampledCount)}
								/>
								<StatCard
									label="Violations"
									value={formatNumber(cf.totals.violationCount)}
									tone={cf.totals.violationCount > 0 ? "warn" : undefined}
								/>
								<StatCard
									label="Blocked"
									value={formatNumber(cf.totals.blockedCount)}
									tone={cf.totals.blockedCount > 0 ? "bad" : undefined}
								/>
								<StatCard
									label="Violation rate"
									value={formatPercent(cf.totals.violationRate * 100)}
								/>
							</StatGrid>
							<div className="grid gap-4 lg:grid-cols-2">
								<TimeSeriesChart
									data={cf.data}
									xKey="timestamp"
									kind="bar"
									hourly={cf.bucket === "hour"}
									series={[
										{ key: "sampledCount", label: "Sampled" },
										{
											key: "violationCount",
											label: "Violations",
											color: "var(--chart-4)",
										},
										{
											key: "blockedCount",
											label: "Blocked",
											color: "var(--chart-error)",
										},
									]}
								/>
								<div className="space-y-4">
									<BarList
										items={cf.topCategories.map((c) => ({
											label: c.category,
											value: c.violationCount,
										}))}
										formatter={formatNumber}
									/>
									<BarList
										items={cf.topModels.map((m) => ({
											label: m.usedModel,
											value: m.violationCount,
											hint: formatPercent(m.violationRate * 100),
										}))}
										formatter={formatNumber}
									/>
								</div>
							</div>
						</div>
					)}
				</QueryState>
			</Section>
			<QueryState query={guardrails}>
				{(g) => (
					<>
						<Section
							title="Guardrails"
							description={
								g.config
									? `${g.config.enabled ? "Enabled" : "Disabled"} · max file ${g.config.maxFileSizeMb} MB · ${formatNumber(g.violations.total)} violations total, ${formatNumber(g.violations.last30Days)} in 30 days`
									: "Not configured."
							}
						>
							{g.config?.systemRules ? (
								<div className="mb-4 flex flex-wrap gap-2">
									{Object.entries(g.config.systemRules).map(([name, rule]) => (
										<Tone key={name} tone={rule.enabled ? "info" : "muted"}>
											{name.replace(/_/g, " ")}:{" "}
											{rule.enabled ? rule.action : "off"}
										</Tone>
									))}
								</div>
							) : null}
							{g.rules.length > 0 ? (
								<DataTable
									columns={ruleColumns}
									data={g.rules}
									getRowId={(r) => r.id}
								/>
							) : (
								<EmptyState>No custom rules.</EmptyState>
							)}
						</Section>
						<Section title="Recent guardrail violations">
							<DataTable
								columns={violationColumns}
								data={g.violations.recent}
								getRowId={(v) => v.id}
								empty="No violations."
							/>
						</Section>
					</>
				)}
			</QueryState>
		</div>
	);
}
