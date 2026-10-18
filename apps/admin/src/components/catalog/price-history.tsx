"use client";

import { Tone } from "@/components/ui/controls";
import { EmptyState, QueryState } from "@/components/ui/page";
import { perTokenToPerMillion } from "@/lib/decimal";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

function priceOf(summary: Record<string, unknown> | null, key: string) {
	const body = summary?.body;
	if (!body || typeof body !== "object") {
		return null;
	}
	const value = (body as Record<string, unknown>)[key];
	return typeof value === "string" ? perTokenToPerMillion(value) : null;
}

/** Mapping writes for a model, read from the admin audit log. */
export function PriceHistory({ modelId }: { modelId: string }) {
	const api = useApi();
	const history = api.useQuery("get", "/admin/audit-logs", {
		params: {
			query: {
				search: `/admin/catalog/models/${modelId}/mappings/`,
				limit: 50,
			},
		},
	});

	return (
		<QueryState query={history} rows={3}>
			{(data) => {
				const entries = data.entries.filter(
					(e) => e.statusCode >= 200 && e.statusCode < 300,
				);
				if (entries.length === 0) {
					return <EmptyState>No price changes recorded.</EmptyState>;
				}
				return (
					<ul className="divide-y text-sm">
						{entries.map((e) => {
							const provider = e.path.split("/mappings/")[1] ?? "";
							const input = priceOf(e.requestSummary, "inputPrice");
							const output = priceOf(e.requestSummary, "outputPrice");
							return (
								<li
									key={e.id}
									className="flex flex-wrap items-center gap-2 py-2"
								>
									<Tone tone={e.method === "DELETE" ? "bad" : "info"}>
										{e.method === "DELETE" ? "deactivated" : "set"}
									</Tone>
									<span className="font-mono text-xs">
										{decodeURIComponent(provider)}
									</span>
									{input !== null || output !== null ? (
										<span className="tabular-nums">
											${input ?? "—"} in · ${output ?? "—"} out /1M
										</span>
									) : null}
									<span className="ml-auto text-xs text-muted-foreground">
										{e.adminEmail} · {formatDateTime(e.createdAt)}
									</span>
								</li>
							);
						})}
					</ul>
				);
			}}
		</QueryState>
	);
}
