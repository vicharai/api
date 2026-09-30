import { ProjectModeSettings } from "@/components/settings/project-mode-settings";
import { getProject } from "@/lib/server-api";

import type { ProjectModeSettingsData } from "@/types/settings";

export const ProjectModeSettingsRsc = async ({
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
				Unable to load project mode settings. Please try again later.
			</p>
		);
	}

	const project = projectData.project;

	// Create the initial data structure
	const initialData: ProjectModeSettingsData = {
		project: {
			id: project.id,
			name: project.name,
			mode: project.mode,
		},
	};

	return (
		<ProjectModeSettings
			initialData={initialData}
			orgId={orgId}
			projectId={projectId}
			projectName={project.name}
		/>
	);
};
