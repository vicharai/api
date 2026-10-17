"use client";

import { Tone } from "@/components/ui/controls";
import { formatPercent } from "@/lib/utils";

import { formatNumber } from "@llmgateway/shared/number-format";

export type StatsMode = "total" | "credits" | "api-keys";
export type HistoryWindow =
	| "1m"
	| "2m"
	| "5m"
	| "15m"
	| "1h"
	| "2h"
	| "4h"
	| "12h"
	| "24h"
	| "2d"
	| "3d"
	| "7d"
	| "30d"
	| "90d";

export const HISTORY_WINDOWS: { value: HistoryWindow; label: string }[] = [
	{ value: "1h", label: "1 hour" },
	{ value: "4h", label: "4 hours" },
	{ value: "12h", label: "12 hours" },
	{ value: "24h", label: "24 hours" },
	{ value: "3d", label: "3 days" },
	{ value: "7d", label: "7 days" },
	{ value: "30d", label: "30 days" },
	{ value: "90d", label: "90 days" },
];

export const MODE_OPTIONS: { value: StatsMode; label: string }[] = [
	{ value: "total", label: "All traffic" },
	{ value: "credits", label: "Credits only" },
	{ value: "api-keys", label: "BYOK only" },
];

export function isHourly(window: HistoryWindow) {
	return !["3d", "7d", "30d", "90d"].includes(window);
}

export function ErrorCell({
	errors,
	total,
	upstream,
	gateway,
	client,
}: {
	errors: number;
	total: number;
	upstream?: number;
	gateway?: number;
	client?: number;
}) {
	const rate = total ? (errors / total) * 100 : 0;
	return (
		<span className="inline-flex items-center gap-1.5 tabular-nums">
			{formatNumber(errors)}
			{errors > 0 ? (
				<Tone tone={rate >= 10 ? "bad" : rate >= 2 ? "warn" : "muted"}>
					{formatPercent(rate)}
				</Tone>
			) : null}
			{upstream !== undefined && errors > 0 ? (
				<span className="text-xs text-muted-foreground">
					{upstream}u/{gateway ?? 0}g/{client ?? 0}c
				</span>
			) : null}
		</span>
	);
}
