import type { DailyActivity } from "@/types/activity";

/**
 * Billing-mode view for usage reporting: "total" is all traffic, "credits"
 * narrows spend and request counts to billed usage. Tokens, errors, cache and
 * latency metrics are only tracked blended in the rollups, so they always
 * reflect all traffic. The "api-keys" mode only exists in the type for
 * historical data fields — Vichar does not offer BYOK.
 */
export type UsageMode = "total" | "credits" | "api-keys";

export const USAGE_MODE_OPTIONS: { value: UsageMode; label: string }[] = [
	{ value: "total", label: "All" },
	{ value: "credits", label: "Credits" },
];

export const USAGE_MODE_ALL_TRAFFIC_NOTE =
	"Tokens, errors and cache metrics always include all traffic — per-mode history is only tracked for spend and request counts.";

export function parseUsageMode(value: string | null | undefined): UsageMode {
	return value === "credits" ? value : "total";
}

export function usageModeLabel(mode: UsageMode): string {
	return USAGE_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? "All";
}

interface ModeSplitRow {
	cost: number;
	requestCount: number;
	creditsRequestCount: number;
	apiKeysRequestCount: number;
	creditsCost: number;
	apiKeysCost: number;
}

export function pickCost(
	row: Pick<ModeSplitRow, "cost" | "creditsCost" | "apiKeysCost">,
	mode: UsageMode,
): number {
	if (mode === "credits") {
		return row.creditsCost;
	}
	if (mode === "api-keys") {
		return row.apiKeysCost;
	}
	return row.cost;
}

export function pickRequests(
	row: Pick<
		ModeSplitRow,
		"requestCount" | "creditsRequestCount" | "apiKeysRequestCount"
	>,
	mode: UsageMode,
): number {
	if (mode === "credits") {
		return row.creditsRequestCount;
	}
	if (mode === "api-keys") {
		return row.apiKeysRequestCount;
	}
	return row.requestCount;
}

/**
 * Returns a copy of the row with `cost` and `requestCount` replaced by the
 * selected mode's split values, so downstream charts and reducers keep working
 * unchanged. All other measures stay blended (see USAGE_MODE_ALL_TRAFFIC_NOTE).
 */
export function applyUsageMode<T extends ModeSplitRow>(
	row: T,
	mode: UsageMode,
): T {
	if (mode === "total") {
		return row;
	}
	return {
		...row,
		cost: pickCost(row, mode),
		requestCount: pickRequests(row, mode),
	};
}

/**
 * Mode-normalizes a /activity day row including its nested breakdowns and the
 * per-mode data-storage cost.
 */
export function applyUsageModeToDaily(
	day: DailyActivity,
	mode: UsageMode,
): DailyActivity {
	if (mode === "total") {
		return day;
	}
	return {
		...applyUsageMode(day, mode),
		dataStorageCost:
			mode === "credits"
				? day.creditsDataStorageCost
				: day.apiKeysDataStorageCost,
		modelBreakdown: day.modelBreakdown.map((m) => applyUsageMode(m, mode)),
		apiKeyBreakdown: day.apiKeyBreakdown.map((k) => applyUsageMode(k, mode)),
		userBreakdown: day.userBreakdown.map((u) => applyUsageMode(u, mode)),
	};
}
