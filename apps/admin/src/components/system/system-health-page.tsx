"use client";

import { CheckCircle2, RefreshCw, XCircle, AlertTriangle } from "lucide-react";

import { Tone } from "@/components/ui/controls";
import {
	KeyValue,
	PageHeader,
	QueryState,
	Section,
} from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { cn, formatDateTime, formatMs } from "@/lib/utils";

import { Button, Card, CardContent } from "@llmgateway/shared/components";

import type { HealthCheck } from "@/lib/api/pending-paths-p2";

const REFRESH_MS = 30_000;

const STATUS: Record<
	HealthCheck["status"],
	{ tone: "good" | "warn" | "bad"; icon: typeof CheckCircle2; label: string }
> = {
	ok: { tone: "good", icon: CheckCircle2, label: "OK" },
	degraded: { tone: "warn", icon: AlertTriangle, label: "Degraded" },
	down: { tone: "bad", icon: XCircle, label: "Down" },
};

function overall(checks: HealthCheck[]): HealthCheck["status"] {
	if (checks.some((c) => c.status === "down")) {
		return "down";
	}
	return checks.some((c) => c.status === "degraded") ? "degraded" : "ok";
}

export function SystemHealthPage() {
	const api = useApi();
	const health = api.useQuery(
		"get",
		"/admin/system/health",
		{},
		{ refetchInterval: REFRESH_MS, refetchIntervalInBackground: false },
	);

	return (
		<>
			<PageHeader
				title="System health"
				description="Database, Redis, worker and queue checks. Refreshes every 30 seconds."
				actions={
					<Button
						variant="outline"
						size="sm"
						disabled={health.isFetching}
						onClick={() => void health.refetch()}
					>
						<RefreshCw className={cn(health.isFetching && "animate-spin")} />
						Refresh
					</Button>
				}
			/>
			<QueryState query={health} rows={6}>
				{(data) => {
					const status = STATUS[overall(data.checks)];
					return (
						<div className="space-y-4">
							<Section>
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div className="flex items-center gap-2 text-lg font-semibold">
										<status.icon
											className={cn(
												"size-5",
												status.tone === "good" && "text-success",
												status.tone === "warn" && "text-warning",
												status.tone === "bad" && "text-destructive",
											)}
										/>
										{status.tone === "good"
											? "All systems operational"
											: status.tone === "warn"
												? "Degraded"
												: "Outage"}
									</div>
									<KeyValue
										items={[
											{ label: "App version", value: data.version ?? "—" },
											{ label: "Migration", value: data.migration ?? "—" },
											{
												label: "Checked",
												value: formatDateTime(data.checkedAt),
											},
										]}
									/>
								</div>
							</Section>
							<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
								{data.checks.map((check) => {
									const s = STATUS[check.status];
									return (
										<Card key={check.name} className="py-4">
											<CardContent className="space-y-2 px-4">
												<div className="flex items-center justify-between gap-2">
													<span className="font-medium">{check.name}</span>
													<Tone tone={s.tone}>{s.label}</Tone>
												</div>
												<p className="text-2xl font-semibold tabular-nums">
													{formatMs(check.latencyMs)}
												</p>
												{check.detail ? (
													<p className="text-xs break-words text-muted-foreground">
														{check.detail}
													</p>
												) : null}
											</CardContent>
										</Card>
									);
								})}
							</div>
						</div>
					);
				}}
			</QueryState>
		</>
	);
}
