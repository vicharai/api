import { CachingSettings } from "@/components/settings/caching-settings";
import { getProject } from "@/lib/server-api";

import type { CachingSettingsData } from "@/types/settings";

export const CachingSettingsRsc = async ({
	orgId,
	projectId,
}: {
	orgId: string;
	projectId: string;
}) => {
	const projectData = await getProject(projectId);

	// Handle null data cases
	if (!projectData) {
		return (
			<p className="text-muted-foreground text-sm">
				Unable to load caching settings. Please try again later.
			</p>
		);
	}

	const project = projectData.project;

	// Create the initial data structure from the project data
	const initialData: CachingSettingsData = {
		preferences: {
			organizationId: orgId,
			projectId: projectId,
			preferences: {
				cachingEnabled: project.cachingEnabled,
				cacheDurationSeconds: project.cacheDurationSeconds,
				providerCacheControlMode: project.providerCacheControlMode,
			},
		},
	};

	return (
		<CachingSettings
			initialData={initialData}
			orgId={orgId}
			projectId={projectId}
			projectName={project.name}
		/>
	);
};
