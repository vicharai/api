import { ArchiveProjectSettings as ArchiveProjectSettingsClient } from "@/components/settings/archive-project-settings";
import { getOrganizations, getProject } from "@/lib/server-api";

export const ArchiveProjectSettings = async ({
	orgId,
	projectId,
}: {
	orgId: string;
	projectId: string;
}) => {
	const [projectData, organizationsData] = await Promise.all([
		getProject(projectId),
		getOrganizations(),
	]);

	// Handle null data cases
	if (!projectData || !organizationsData) {
		return (
			<p className="text-muted-foreground text-sm">
				Unable to load project settings. Please try again later.
			</p>
		);
	}

	// Find the organization by ID
	const project = projectData.project;
	const organization = organizationsData.organizations.find(
		(o) => o.id === orgId,
	);

	if (!organization) {
		return (
			<p className="text-muted-foreground text-sm">Organization not found.</p>
		);
	}

	if (organization.role !== "owner") {
		return (
			<p className="text-muted-foreground text-sm">
				Only organization owners can archive projects.
			</p>
		);
	}

	return (
		<ArchiveProjectSettingsClient
			orgId={orgId}
			projectId={projectId}
			projectName={project.name}
		/>
	);
};
