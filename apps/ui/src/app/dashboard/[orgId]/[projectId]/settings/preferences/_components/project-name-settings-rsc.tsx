import { ProjectNameSettings } from "@/components/settings/project-name-settings";
import { getProject } from "@/lib/server-api";

export const ProjectNameSettingsRsc = async ({
	orgId,
	projectId,
}: {
	orgId: string;
	projectId: string;
}) => {
	const projectData = await getProject(projectId);

	if (!projectData) {
		return (
			<p className="text-muted-foreground text-sm">
				Unable to load project settings. Please try again later.
			</p>
		);
	}

	return (
		<ProjectNameSettings
			projectId={projectId}
			orgId={orgId}
			initialName={projectData.project.name}
		/>
	);
};
