"use client";

import { DeleteOrganizationSettings } from "@/components/settings/delete-organization-settings";
import { OrganizationIdSettings } from "@/components/settings/organization-id-settings";
import { OrganizationLogoSettings } from "@/components/settings/organization-logo-settings";
import { OrganizationNameSettings } from "@/components/settings/organization-name-settings";
import { SquircleCard } from "@/lib/components/squircle";

export default function PreferencesPage() {
	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<div>
					<h1 className="text-xl font-medium tracking-tight">Preferences</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Manage your workspace&apos;s identity and notifications
					</p>
				</div>
				<SquircleCard
					title="Workspace ID"
					hideSeeAll
					panelClassName="p-4 sm:p-5"
				>
					<p className="mb-4 text-sm text-muted-foreground">
						Use this ID when referencing your workspace in the API or with
						support.
					</p>
					<OrganizationIdSettings />
				</SquircleCard>
				<SquircleCard
					title="Workspace Name"
					hideSeeAll
					panelClassName="p-4 sm:p-5"
				>
					<p className="mb-4 text-sm text-muted-foreground">
						Manage your workspace&apos;s name.
					</p>
					<OrganizationNameSettings />
				</SquircleCard>
				<SquircleCard
					title="Workspace Logo"
					hideSeeAll
					panelClassName="p-4 sm:p-5"
				>
					<p className="mb-4 text-sm text-muted-foreground">
						Manage your workspace&apos;s logo.
					</p>
					<OrganizationLogoSettings />
				</SquircleCard>
				<SquircleCard
					title={<span className="text-destructive">Danger zone</span>}
					hideSeeAll
					className="border-destructive/25"
					panelClassName="p-4 sm:p-5"
				>
					<p className="mb-4 text-sm text-muted-foreground">
						Irreversible and destructive actions.
					</p>
					<DeleteOrganizationSettings />
				</SquircleCard>
			</div>
		</div>
	);
}
