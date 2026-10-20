"use client";

import { Info } from "lucide-react";
import Link from "next/link";

import { useDashboardState } from "@/lib/dashboard-state";
import { useApi } from "@/lib/fetch-client";

import type { Route } from "next";

/** The workspace's model access restriction, expressed in catalogue model ids. */
export function useProviderAccess() {
	const api = useApi();
	const { selectedOrganization } = useDashboardState();
	const { data } = api.useQuery(
		"get",
		"/orgs/{id}/provider-access",
		{ params: { path: { id: selectedOrganization?.id ?? "" } } },
		{ enabled: !!selectedOrganization?.id },
	);
	return data;
}

export function ProviderAccessNotice({
	unavailableCount,
}: {
	unavailableCount: number;
}) {
	const { selectedOrganization } = useDashboardState();
	return (
		<div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
			<Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
			<p>
				Model access for this workspace is restricted by Vichar
				{unavailableCount > 0
					? `: ${unavailableCount} ${unavailableCount === 1 ? "model is" : "models are"} not available to your API keys, and routing never selects ${unavailableCount === 1 ? "it" : "them"}.`
					: "."}{" "}
				{selectedOrganization && (
					<Link
						href={`/dashboard/${selectedOrganization.id}/support` as Route}
						className="whitespace-nowrap font-medium text-brand underline-offset-4 hover:underline"
					>
						Contact support
					</Link>
				)}{" "}
				to change it.
			</p>
		</div>
	);
}
