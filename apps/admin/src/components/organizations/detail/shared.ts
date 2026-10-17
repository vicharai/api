export type OrgWindow =
	"1h" | "4h" | "12h" | "1d" | "7d" | "30d" | "90d" | "365d";

export const ORG_WINDOWS: { value: OrgWindow; label: string }[] = [
	{ value: "1h", label: "Last hour" },
	{ value: "4h", label: "Last 4 hours" },
	{ value: "12h", label: "Last 12 hours" },
	{ value: "1d", label: "Last 24 hours" },
	{ value: "7d", label: "Last 7 days" },
	{ value: "30d", label: "Last 30 days" },
	{ value: "90d", label: "Last 90 days" },
	{ value: "365d", label: "Last 365 days" },
];

/**
 * Pivots `[{timestamp, entries: [{model, cost}]}]` into chart rows keyed by
 * series, keeping the top `limit` series and folding the rest into "other".
 */
export function pivotTimeseries(
	data: {
		timestamp: string;
		entries: { model: string; cost: number; requestCount: number }[];
	}[],
	metric: "cost" | "requestCount",
	limit = 5,
): { rows: Record<string, number | string>[]; keys: string[] } {
	const totals = new Map<string, number>();
	for (const bucket of data) {
		for (const entry of bucket.entries) {
			totals.set(entry.model, (totals.get(entry.model) ?? 0) + entry[metric]);
		}
	}
	const top = [...totals.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([key]) => key);
	const keyOf = (model: string) =>
		top.includes(model) ? `s${top.indexOf(model)}` : "other";
	const rows = data.map((bucket) => {
		const row: Record<string, number | string> = {
			timestamp: bucket.timestamp,
		};
		for (const k of [...top.map((_, i) => `s${i}`), "other"]) {
			row[k] = 0;
		}
		for (const entry of bucket.entries) {
			const k = keyOf(entry.model);
			row[k] = Number(row[k]) + entry[metric];
		}
		return row;
	});
	const hasOther = totals.size > top.length;
	return { rows, keys: hasOther ? [...top, "other"] : top };
}
