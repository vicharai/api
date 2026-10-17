"use client";

import {
	AlertTriangle,
	CreditCard,
	Gauge,
	Inbox,
	ShieldAlert,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useCan } from "@/components/shell/admin-session";
import { BarList, TimeSeriesChart } from "@/components/ui/charts";
import { SimpleSelect } from "@/components/ui/controls";
import {
	ErrorState,
	PageHeader,
	QueryState,
	Section,
	StatCard,
	StatGrid,
} from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { cn, formatUsd } from "@/lib/utils";

import { Card, CardContent } from "@llmgateway/shared/components";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import type { Route } from "next";

type Range = "7d" | "30d" | "90d" | "365d" | "all";

const RANGES: { value: Range; label: string }[] = [
	{ value: "7d", label: "Last 7 days" },
	{ value: "30d", label: "Last 30 days" },
	{ value: "90d", label: "Last 90 days" },
	{ value: "365d", label: "Last 365 days" },
	{ value: "all", label: "All time" },
];

export function Overview() {
	const can = useCan();
	const [range, setRange] = useState<Range>("30d");
	const showRevenue = can("GET", "/admin/metrics");

	return (
		<>
			<PageHeader
				title="Overview"
				description="Platform health, revenue and the things that need a human."
				actions={
					<SimpleSelect
						value={range}
						onChange={setRange}
						options={RANGES}
						ariaLabel="Range"
					/>
				}
			/>
			<div className="space-y-6">
				<NeedsAttention />
				{showRevenue ? <RevenueSection range={range} /> : null}
			</div>
		</>
	);
}

function AttentionTile({
	icon: Icon,
	label,
	value,
	href,
	loading,
}: {
	icon: LucideIcon;
	label: string;
	value: number | undefined;
	href: Route;
	loading: boolean;
}) {
	const hot = (value ?? 0) > 0;
	return (
		<Link href={href}>
			<Card
				className={cn(
					"gap-0 py-4 transition-colors hover:bg-accent",
					hot && "border-warning/40",
				)}
			>
				<CardContent className="flex items-center gap-3 px-4">
					<div
						className={cn(
							"flex size-9 items-center justify-center rounded-md bg-muted",
							hot && "bg-warning/15 text-warning",
						)}
					>
						<Icon className="size-4" />
					</div>
					<div>
						<p className="text-xs text-muted-foreground">{label}</p>
						<p className="text-xl font-semibold tabular-nums">
							{loading ? "…" : formatNumber(value ?? 0)}
						</p>
					</div>
				</CardContent>
			</Card>
		</Link>
	);
}

function NeedsAttention() {
	const api = useApi();
	const flagged = api.useQuery("get", "/admin/flagged-accounts", {
		params: { query: { status: "flagged", limit: 1 } },
	});
	const chats = api.useQuery("get", "/admin/chat-support-logs", {
		params: { query: { limit: 100, archived: "false" } },
	});
	const readStatuses = api.useQuery(
		"get",
		"/admin/chat-support-logs/read-statuses",
	);
	const failures = api.useQuery("get", "/admin/payment-failures", {
		params: { query: { days: 7, limit: 1 } },
	});
	const unstable = api.useQuery("get", "/admin/unstable-mappings", {
		params: { query: { window: "24h", limit: 100 } },
	});
	const limitHits = api.useQuery("get", "/admin/limit-hits", {
		params: { query: { days: 7, limit: 1 } },
	});

	const unread = chats.data?.conversations.filter(
		(c) => c.messageCount > (readStatuses.data?.readStatuses[c.id] ?? 0),
	).length;
	const unstableCount = unstable.data?.mappings.filter(
		(m) => m.errorRate >= 0.1 && m.logsCount >= 5,
	).length;

	return (
		<section className="space-y-2">
			<h2 className="text-sm font-medium text-muted-foreground">
				Needs attention
			</h2>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
				<AttentionTile
					icon={ShieldAlert}
					label="Flagged accounts"
					value={flagged.data?.flaggedCount}
					href="/users/flagged"
					loading={flagged.isLoading}
				/>
				<AttentionTile
					icon={Inbox}
					label="Unread support chats"
					value={unread}
					href="/support"
					loading={chats.isLoading || readStatuses.isLoading}
				/>
				<AttentionTile
					icon={CreditCard}
					label="Payment failures (7d)"
					value={failures.data?.summary.total7d}
					href="/issues?tab=payments"
					loading={failures.isLoading}
				/>
				<AttentionTile
					icon={AlertTriangle}
					label="Unstable mappings (24h)"
					value={unstableCount}
					href="/issues"
					loading={unstable.isLoading}
				/>
				<AttentionTile
					icon={Gauge}
					label="Orgs hitting limits (7d)"
					value={limitHits.data?.total}
					href="/issues?tab=limits"
					loading={limitHits.isLoading}
				/>
			</div>
		</section>
	);
}

function costWindow(range: Range) {
	return range === "all" ? "365d" : range;
}

function RevenueSection({ range }: { range: Range }) {
	const api = useApi();
	const metrics = api.useQuery("get", "/admin/metrics", {
		params: { query: { range } },
	});
	const usage = api.useQuery("get", "/admin/global-stats", {
		params: { query: { range, groupBy: "model", modelView: "canonical" } },
	});
	const timeseries = api.useQuery("get", "/admin/metrics/timeseries", {
		params: { query: { range } },
	});
	const costByModel = api.useQuery("get", "/admin/metrics/cost-by-model", {
		params: { query: { window: costWindow(range) } },
	});

	const metricsError: unknown = metrics.error;
	if (metricsError) {
		return <ErrorState error={metricsError} />;
	}

	const m = metrics.data;
	const totals = usage.data?.totals;

	return (
		<>
			<StatGrid>
				<StatCard
					label="Net revenue"
					value={m ? formatUsd(m.totalRevenue) : "…"}
					hint="Top-ups and payments minus refunds"
				/>
				<StatCard
					label="Gross revenue"
					value={m ? formatUsd(m.grossRevenue) : "…"}
				/>
				<StatCard
					label="Refunds"
					value={m ? formatUsd(m.totalRefunds) : "…"}
					tone={m && m.totalRefunds > 0 ? "warn" : undefined}
				/>
				<StatCard
					label="Bonus + gifted credits"
					value={
						m ? formatUsd(m.totalBonusCredits + m.totalGiftedCredits) : "…"
					}
				/>
				<StatCard
					label="Organizations"
					value={m ? formatNumber(m.totalOrganizations) : "…"}
					hint={m ? `${formatNumber(m.payingCustomers)} paying` : undefined}
				/>
				<StatCard
					label="Signups"
					value={m ? formatNumber(m.totalSignups) : "…"}
					hint={m ? `${formatNumber(m.verifiedUsers)} verified` : undefined}
				/>
				<StatCard
					label="Requests"
					value={totals ? formatCompactNumber(totals.requestCount) : "…"}
					hint={
						totals
							? `${formatCompactNumber(totals.errorCount)} errors`
							: undefined
					}
				/>
				<StatCard
					label="Tokens"
					value={totals ? formatCompactNumber(totals.totalTokens) : "…"}
				/>
				<StatCard
					label="Inference cost"
					value={totals ? formatUsd(totals.cost) : "…"}
				/>
				<StatCard
					label="Unused credits"
					value={m ? formatUsd(m.unusedCredits) : "…"}
				/>
				<StatCard
					label="Total spent"
					value={m ? formatUsd(m.totalSpent) : "…"}
				/>
				<StatCard
					label="Processed"
					value={m ? formatUsd(m.totalProcessed) : "…"}
				/>
			</StatGrid>

			<div className="grid gap-4 lg:grid-cols-2">
				<Section title="Daily net revenue">
					<QueryState query={timeseries} rows={4}>
						{(data) => (
							<TimeSeriesChart
								data={data.data}
								xKey="date"
								kind="bar"
								series={[{ key: "dailyNet", label: "Net revenue" }]}
								valueFormatter={(v) => formatUsd(v)}
							/>
						)}
					</QueryState>
				</Section>
				<Section title="Daily signups and paying customers">
					<QueryState query={timeseries} rows={4}>
						{(data) => (
							<TimeSeriesChart
								data={data.data}
								xKey="date"
								kind="line"
								series={[
									{ key: "dailySignups", label: "Signups" },
									{ key: "dailyPaidCustomers", label: "New paying" },
								]}
							/>
						)}
					</QueryState>
				</Section>
				<Section title="Requests and cost">
					<QueryState query={usage} rows={4}>
						{(data) => (
							<TimeSeriesChart
								data={data.timeseries}
								xKey="date"
								series={[{ key: "requestCount", label: "Requests" }]}
							/>
						)}
					</QueryState>
				</Section>
				<Section
					title="Cost by model"
					description={
						costByModel.data
							? `${formatUsd(costByModel.data.totalCost)} across ${formatNumber(costByModel.data.totalRequests)} requests`
							: undefined
					}
				>
					<QueryState query={costByModel} rows={6}>
						{(data) => (
							<BarList
								items={data.models.slice(0, 10).map((x) => ({
									label: x.model,
									value: x.cost,
									hint: `${formatCompactNumber(x.requestCount)} req`,
								}))}
								formatter={(v) => formatUsd(v)}
							/>
						)}
					</QueryState>
				</Section>
			</div>
		</>
	);
}
