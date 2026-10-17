"use client";

import Link from "next/link";
import { useState } from "react";

import { BarList } from "@/components/ui/charts";
import { SimpleSelect, Toolbar } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, Section, StatCard, StatGrid } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatPercent } from "@/lib/utils";

import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Violations = ApiData<"/admin/content-filter/violations">;
type OrgRow = Violations["organizations"][number];
type ModelRow = Violations["models"][number];
type CfWindow = "24h" | "7d" | "30d";

const orgColumns: ColumnDef<OrgRow>[] = [
	{
		id: "org",
		header: "Organization",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<Link
					href={
						`/organizations/${row.original.organizationId}?tab=safety` as Route
					}
					className="font-medium hover:underline"
				>
					{row.original.organizationName ?? row.original.organizationId}
				</Link>
				<div className="text-xs text-muted-foreground">
					{row.original.billingEmail ?? "—"} · {row.original.plan ?? "—"}
				</div>
			</div>
		),
	},
	{
		accessorKey: "violationCount",
		header: "Violations",
		cell: ({ row }) => formatNumber(row.original.violationCount),
	},
	{
		accessorKey: "violationRate",
		header: "Rate",
		cell: ({ row }) => formatPercent(row.original.violationRate * 100),
	},
	{
		accessorKey: "blockedCount",
		header: "Blocked",
		cell: ({ row }) => formatNumber(row.original.blockedCount),
	},
	{
		accessorKey: "sampledCount",
		header: "Sampled",
		cell: ({ row }) => formatNumber(row.original.sampledCount),
	},
	{
		id: "categories",
		header: "Top categories",
		cell: ({ row }) => (
			<span className="text-xs text-muted-foreground">
				{row.original.topCategories
					.slice(0, 3)
					.map((c) => `${c.category} (${c.violationCount})`)
					.join(", ") || "—"}
			</span>
		),
	},
];

export function ContentViolations() {
	const api = useApi();
	const [range, setRange] = useState<CfWindow>("7d");
	const [sort, setSort] = useState<"violations" | "rate">("violations");
	const [focus, setFocus] = useState<ModelRow | null>(null);
	const data = api.useQuery("get", "/admin/content-filter/violations", {
		params: { query: { window: range, sort } },
	});

	return (
		<div className="space-y-4">
			<Toolbar>
				<SimpleSelect
					value={range}
					onChange={setRange}
					options={[
						{ value: "24h", label: "24 hours" },
						{ value: "7d", label: "7 days" },
						{ value: "30d", label: "30 days" },
					]}
				/>
				<SimpleSelect
					value={sort}
					onChange={setSort}
					options={[
						{ value: "violations", label: "Most violations" },
						{ value: "rate", label: "Highest rate" },
					]}
				/>
			</Toolbar>
			<QueryState query={data}>
				{(v) => (
					<>
						<StatGrid>
							<StatCard
								label="Sampled"
								value={formatNumber(v.totals.sampledCount)}
							/>
							<StatCard
								label="Violations"
								value={formatNumber(v.totals.violationCount)}
								tone={v.totals.violationCount ? "warn" : undefined}
							/>
							<StatCard
								label="Blocked"
								value={formatNumber(v.totals.blockedCount)}
								tone={v.totals.blockedCount ? "bad" : undefined}
							/>
							<StatCard
								label="Rate"
								value={formatPercent(
									v.totals.sampledCount
										? (v.totals.violationCount / v.totals.sampledCount) * 100
										: 0,
								)}
							/>
						</StatGrid>
						<div className="grid gap-4 lg:grid-cols-2">
							<Section
								title="By model"
								description="Click a model for its orgs."
							>
								<div className="space-y-1">
									{v.models.slice(0, 15).map((m) => (
										<button
											key={`${m.usedProvider}/${m.usedModel}`}
											type="button"
											className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-accent"
											onClick={() => setFocus(m)}
										>
											<span className="truncate font-mono text-xs">
												{m.usedModel}
											</span>
											<span className="tabular-nums">
												{formatNumber(m.violationCount)}{" "}
												<span className="text-xs text-muted-foreground">
													{formatPercent(m.violationRate * 100)}
												</span>
											</span>
										</button>
									))}
								</div>
							</Section>
							<Section title="By provider">
								<BarList
									items={v.providers.map((p) => ({
										label: p.usedProvider,
										value: p.violationCount,
										hint: formatPercent(p.violationRate * 100),
									}))}
									formatter={formatNumber}
								/>
							</Section>
						</div>
						<Section title="Organizations">
							<DataTable
								columns={orgColumns}
								data={v.organizations}
								getRowId={(o) => o.organizationId}
								empty="No violations."
							/>
						</Section>
					</>
				)}
			</QueryState>
			<Sheet open={focus !== null} onOpenChange={(o) => !o && setFocus(null)}>
				<SheetContent className="w-full overflow-y-auto sm:max-w-xl">
					<SheetHeader>
						<SheetTitle className="font-mono text-sm">
							{focus?.usedModel}
						</SheetTitle>
					</SheetHeader>
					{focus ? <ModelOrgs model={focus} range={range} /> : null}
				</SheetContent>
			</Sheet>
		</div>
	);
}

function ModelOrgs({ model, range }: { model: ModelRow; range: CfWindow }) {
	const api = useApi();
	const orgs = api.useQuery(
		"get",
		"/admin/content-filter/violations/organizations",
		{
			params: {
				query: {
					window: range,
					usedProvider: model.usedProvider,
					usedModel: model.usedModel,
				},
			},
		},
	);
	return (
		<div className="p-4">
			<QueryState query={orgs}>
				{(data) => (
					<ul className="space-y-2 text-sm">
						{data.organizations.map((o) => (
							<li key={o.organizationId} className="flex justify-between gap-2">
								<Link
									href={
										`/organizations/${o.organizationId}?tab=safety` as Route
									}
									className="truncate hover:underline"
								>
									{o.organizationName ?? o.organizationId}
								</Link>
								<span className="tabular-nums">
									{formatNumber(o.violationCount)} /{" "}
									{formatNumber(o.sampledCount)}{" "}
									<span className="text-xs text-muted-foreground">
										{formatPercent(o.violationRate * 100)}
										{o.belowSampleFloor ? " · low sample" : ""}
									</span>
								</span>
							</li>
						))}
					</ul>
				)}
			</QueryState>
		</div>
	);
}
