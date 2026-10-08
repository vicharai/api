import { Suspense } from "react";

import { ReadonlyIdField } from "@/components/settings/readonly-id-field";
import { SettingsSection } from "@/components/settings/settings-section";

import { ArchiveProjectSettings } from "./_components/archive-project";
import { CachingSettingsRsc } from "./_components/caching-settings-rsc";
import { ProjectNameSettingsRsc } from "./_components/project-name-settings-rsc";
import { CachingSettingsSkeleton } from "./_skeletons/caching-settings-skeleton";
import { ProjectNameSkeleton } from "./_skeletons/project-name-skeleton";

export default async function PreferencesPage({
	params,
}: {
	params: Promise<{ orgId: string; projectId: string }>;
}) {
	const { orgId, projectId } = await params;

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<div className="max-w-3xl mx-auto w-full space-y-5">
					<div>
						<h1 className="text-xl font-medium tracking-tight">Preferences</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Project name, caching, and lifecycle.
						</p>
					</div>

					<SettingsSection
						title="Project ID"
						description="Use this ID when referencing your project in the API or with support."
					>
						<ReadonlyIdField
							id="projectId"
							value={projectId}
							copyAriaLabel="Copy project ID"
						/>
					</SettingsSection>

					<SettingsSection
						title="Project Name"
						description="Update your project's display name"
					>
						<Suspense fallback={<ProjectNameSkeleton />}>
							<ProjectNameSettingsRsc orgId={orgId} projectId={projectId} />
						</Suspense>
					</SettingsSection>

					<SettingsSection
						title="Caching"
						description="Configure caching settings for your API requests"
					>
						<Suspense fallback={<CachingSettingsSkeleton />}>
							<CachingSettingsRsc orgId={orgId} projectId={projectId} />
						</Suspense>
					</SettingsSection>

					<SettingsSection
						title={<span className="text-destructive">Danger Zone</span>}
						description="Irreversible and destructive actions"
						className="border-destructive/40"
					>
						<Suspense
							fallback={
								<p className="text-sm text-muted-foreground">Loading…</p>
							}
						>
							<ArchiveProjectSettings orgId={orgId} projectId={projectId} />
						</Suspense>
					</SettingsSection>
				</div>
			</div>
		</div>
	);
}
