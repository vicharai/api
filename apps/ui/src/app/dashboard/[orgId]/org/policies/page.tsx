"use client";

import { OrganizationRetentionSettings } from "@/components/settings/organization-retention-settings";
import { Card, CardContent } from "@/lib/components/card";

export default function PoliciesPage() {
	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-4">
				<div className="space-y-6">
					<div>
						<h1 className="text-xl font-medium tracking-tight">Policies</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Manage your organization&apos;s data retention settings
						</p>
					</div>
					<Card>
						<CardContent className="space-y-6 pt-6">
							<OrganizationRetentionSettings />
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
