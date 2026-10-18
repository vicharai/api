"use client";

import { Section } from "@/components/ui/page";

import { LogsExplorer } from "./logs-explorer";

export function OrgLogsTab({ orgId }: { orgId: string }) {
	return (
		<Section
			title="Request logs"
			description="Newest first. Click a row for the payload and error details."
		>
			<LogsExplorer orgId={orgId} />
		</Section>
	);
}
