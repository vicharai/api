"use client";

import { useState } from "react";

import { BarList, TimeSeriesChart } from "@/components/ui/charts";
import { SimpleSelect, Toolbar, Tone } from "@/components/ui/controls";
import {
	KeyValue,
	QueryState,
	Section,
	StatCard,
	StatGrid,
} from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatUsd } from "@/lib/utils";

import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import { ORG_WINDOWS, pivotTimeseries, type OrgWindow } from "./shared";

import type { ApiData } from "@/lib/api/types";

type Detail = ApiData<"/admin/organizations/{orgId}">;
type GroupBy = "model" | "project" | "api-key" | "user";

export function OrgOverviewTab({
	orgId,
	initial,
}: {
	orgId: string;
	initial: Detail;
}) {
	const api = useApi();
	const [range, setRange] = useState<OrgWindow>("30d");
	const [groupBy, setGroupBy] = useState<GroupBy>("model");
	const [metric, setMetric] = useState<"cost" | "requestCount">("cost");

	const detail = api.useQuery(
		"get",
		"/admin/organizations/{orgId}",
		{ params: { path: { orgId }, query: { window: range } } },
		{ initialData: range === "30d" ? initial : undefined },
	);
	const costByModel = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/cost-by-model",
		{ params: { path: { orgId }, query: { window: range, groupBy } } },
	);
	const timeseries = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/cost-by-model-timeseries",
		{
			params: {
				path: { orgId },
				query: {
					window: range,
					groupBy,
					bucket: ["1h", "4h", "12h", "1d"].includes(range) ? "hour" : "day",
				},
			},
		},
	);

	return (
		<div className="space-y-4">
			<Toolbar>
				<SimpleSelect value={range} onChange={setRange} options={ORG_WINDOWS} />
				<SimpleSelect
					value={groupBy}
					onChange={setGroupBy}
					options={[
						{ value: "model", label: "By model" },
						{ value: "project", label: "By project" },
						{ value: "api-key", label: "By API key" },
						{ value: "user", label: "By user" },
					]}
				/>
				<SimpleSelect
					value={metric}
					onChange={setMetric}
					options={[
						{ value: "cost", label: "Cost" },
						{ value: "requestCount", label: "Requests" },
					]}
				/>
			</Toolbar>
			<QueryState query={detail} rows={3}>
				{(d) => (
					<>
						<StatGrid>
							<StatCard
								label="Requests"
								value={formatNumber(d.totalRequests)}
								hint={`${formatNumber(d.creditsRequestCount)} credits · ${formatNumber(d.apiKeysRequestCount)} BYOK`}
							/>
							<StatCard
								label="Tokens"
								value={formatCompactNumber(d.totalTokens)}
								hint={`${formatCompactNumber(d.inputTokens)} in · ${formatCompactNumber(d.outputTokens)} out · ${formatCompactNumber(d.cachedTokens)} cached`}
							/>
							<StatCard
								label="Cost"
								value={formatUsd(d.totalCost)}
								hint={`${formatUsd(d.creditsCost)} credits · ${formatUsd(d.apiKeysCost)} BYOK`}
							/>
							<StatCard
								label="Discount savings"
								value={formatUsd(d.discountSavings)}
							/>
							<StatCard
								label="Most used model"
								value={
									<span className="text-base">{d.mostUsedModel ?? "—"}</span>
								}
								hint={`${formatUsd(d.mostUsedModelCost)} · via ${d.mostUsedProvider ?? "—"}`}
							/>
							<StatCard
								label="Lifetime top-ups"
								value={formatUsd(d.organization.totalCreditsAllTime)}
								hint={`${formatUsd(d.organization.totalSpent)} spent all time`}
							/>
							<StatCard
								label="Data storage"
								value={formatUsd(d.dataStorageCost, true)}
							/>
							<StatCard
								label="Cache writes"
								value={formatCompactNumber(d.cacheWriteTokens)}
								hint={formatUsd(d.cacheWriteCost, true)}
							/>
						</StatGrid>
						<div className="grid gap-4 lg:grid-cols-2">
							<Section title="Trust tier">
								<KeyValue
									items={[
										{
											label: "Tier",
											value: (
												<span>
													{d.trustTier.tier}{" "}
													{d.trustTier.overridden ? (
														<Tone tone="warn">override</Tone>
													) : null}
													{d.trustTier.exempt !== "none" ? (
														<Tone tone="info">
															exempt: {d.trustTier.exempt}
														</Tone>
													) : null}
												</span>
											),
										},
										{
											label: "Account age",
											value: `${formatNumber(d.trustTier.accountAgeDays)} days`,
										},
										{
											label: "Qualifying spend",
											value: formatUsd(d.trustTier.qualifyingSpendUsd),
										},
										{
											label: "RPM multiplier",
											value: `×${d.trustTier.rpmMultiplier}`,
										},
										{
											label: "Daily / monthly cap",
											value: `${formatUsd(d.trustTier.dailyCapUsd)} / ${formatUsd(d.trustTier.monthlyCapUsd)}`,
										},
										{
											label: "Top-up daily cap",
											value: formatUsd(d.trustTier.topUpDailyCapUsd),
										},
									]}
								/>
							</Section>
							<Section title="Content filter tier">
								<KeyValue
									items={[
										{
											label: "Tier",
											value: (
												<span>
													{d.contentFilterTier.tier}{" "}
													{d.contentFilterTier.overridden ? (
														<Tone tone="warn">override</Tone>
													) : null}
												</span>
											),
										},
										{ label: "Level", value: d.contentFilterTier.level },
										{
											label: "Exempt",
											value: d.contentFilterTier.exempt ? "yes" : "no",
										},
										{
											label: "Log only",
											value: d.contentFilterTier.logOnly ? "yes" : "no",
										},
									]}
								/>
							</Section>
						</div>
					</>
				)}
			</QueryState>
			<div className="grid gap-4 lg:grid-cols-2">
				<Section
					title={metric === "cost" ? "Cost over time" : "Requests over time"}
				>
					<QueryState query={timeseries} rows={4}>
						{(ts) => {
							const { rows, keys } = pivotTimeseries(ts.data, metric);
							return (
								<TimeSeriesChart
									data={rows}
									xKey="timestamp"
									kind="bar"
									stacked
									hourly={ts.bucket === "hour"}
									series={keys.map((name, i) => ({
										key: name === "other" ? "other" : `s${i}`,
										label: name === "other" ? "Other" : name,
									}))}
									valueFormatter={
										metric === "cost"
											? (v) => formatUsd(v)
											: formatCompactNumber
									}
								/>
							);
						}}
					</QueryState>
				</Section>
				<Section title="Breakdown">
					<QueryState query={costByModel} rows={6}>
						{(c) => (
							<BarList
								items={[...c.models]
									.sort((a, b) => b[metric] - a[metric])
									.slice(0, 12)
									.map((m) => ({
										label: m.model,
										value: m[metric],
										hint:
											metric === "cost"
												? `${formatCompactNumber(m.requestCount)} req`
												: formatUsd(m.cost),
									}))}
								formatter={
									metric === "cost" ? (v) => formatUsd(v) : formatCompactNumber
								}
							/>
						)}
					</QueryState>
				</Section>
			</div>
		</div>
	);
}
