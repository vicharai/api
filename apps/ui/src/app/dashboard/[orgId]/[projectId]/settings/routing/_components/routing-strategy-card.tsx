"use client";

import { RoutingStrategySettings } from "@/components/settings/routing-strategy-settings";
import { SettingsSection } from "@/components/settings/settings-section";
import { useApi } from "@/lib/fetch-client";

export function RoutingStrategyCard({
	orgId,
	projectId,
}: {
	orgId: string;
	projectId: string;
}) {
	const api = useApi();
	const { data } = api.useQuery("get", "/projects/{id}", {
		params: { path: { id: projectId } },
	});

	return (
		<SettingsSection
			title="Routing Strategy"
			description="Set the default provider-selection strategy for this project. Available on all plans."
		>
			{data?.project ? (
				<RoutingStrategySettings
					initialStrategy={data.project.defaultRoutingStrategy}
					orgId={orgId}
					projectId={projectId}
				/>
			) : (
				<p className="text-sm text-muted-foreground">Loading…</p>
			)}
		</SettingsSection>
	);
}
