"use client";

import { ReadonlyIdField } from "@/components/settings/readonly-id-field";
import { useDashboardContext } from "@/lib/dashboard-context";

export function OrganizationIdSettings() {
	const { selectedOrganization } = useDashboardContext();

	if (!selectedOrganization) {
		return (
			<p className="text-muted-foreground text-sm">
				Please select a workspace to view its ID.
			</p>
		);
	}

	return (
		<ReadonlyIdField
			id="orgId"
			value={selectedOrganization.id}
			copyAriaLabel="Copy workspace ID"
		/>
	);
}
