import { cookies } from "next/headers";

import { AgentsView } from "@/components/activity/agents-view";
import { DevPassCard } from "@/components/dashboard/devpass-card";
import { parseAgentTimeRange } from "@/lib/agent-time-ranges";
import { DEVPASS_CARD_COLLAPSED_COOKIE } from "@/lib/cookies";
import { fetchServerData } from "@/lib/server-api";

import type { SourceActivityData } from "@/types/activity";

export default async function AgentsPage({
	params,
	searchParams,
}: {
	params: Promise<{ orgId: string; projectId: string }>;
	searchParams?: Promise<{ timeRange?: string }>;
}) {
	const { orgId, projectId } = await params;
	const searchParamsData = await searchParams;

	const timeRange = parseAgentTimeRange(searchParamsData?.timeRange);

	const cookieStore = await cookies();
	const devPassCollapsed =
		cookieStore.get(DEVPASS_CARD_COLLAPSED_COOKIE)?.value === "1";

	const initialData = await fetchServerData<SourceActivityData>(
		"GET",
		"/activity/sources",
		{
			params: {
				query: {
					projectId,
					timeRange,
				},
			},
		},
	);

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<div>
					<h2 className="text-xl font-medium tracking-tight">Agents</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Monitor your AI coding agents and their activity
					</p>
				</div>
				<DevPassCard defaultCollapsed={devPassCollapsed} />
				<AgentsView
					projectId={projectId}
					orgId={orgId}
					initialData={initialData ?? undefined}
				/>
			</div>
		</div>
	);
}
