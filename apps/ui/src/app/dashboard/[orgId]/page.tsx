import { FolderOpen, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";

import { StatusCard } from "@/components/auth/auth-shell";
import { getLastUsedProjectId } from "@/lib/last-used-project-server";
import { getOrgProjects } from "@/lib/server-api";

interface OrgPageProps {
	params: Promise<{ orgId: string }>;
}

export default async function OrgPage({ params }: OrgPageProps) {
	const { orgId } = await params;

	// Fetch projects for this organization
	const projectsData = await getOrgProjects(orgId);

	// Check if API returned null (error case)
	if (!projectsData) {
		return (
			<StatusCard
				icon={<TriangleAlert />}
				tone="destructive"
				title="Couldn't load projects"
				description="Failed to load projects for this organization. Please check your connection and try again."
			/>
		);
	}

	const projects = projectsData.projects;

	if (projects && projects.length > 0) {
		// Check for last used project first, fallback to first project
		const lastUsedProjectId = await getLastUsedProjectId(orgId);
		const defaultProjectId =
			lastUsedProjectId && projects.some((p) => p.id === lastUsedProjectId)
				? lastUsedProjectId
				: projects[0].id;

		// Redirect to the selected project
		redirect(`/dashboard/${orgId}/${defaultProjectId}`);
	}

	// If no projects found, show a message or redirect to create project
	return (
		<StatusCard
			icon={<FolderOpen />}
			tone="neutral"
			title="No projects yet"
			description="This organization doesn't have any projects yet. Create a project to get started."
		/>
	);
}
