"use client";

import { Key } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { ApiKeysList } from "@/components/api-keys/api-keys-list";
import { CreateApiKeyDialog } from "@/components/api-keys/create-api-key-dialog";
import { Button } from "@/lib/components/button";
import { PageHeader } from "@/lib/components/page-layout";
import { useApi } from "@/lib/fetch-client";
import { extractOrgAndProjectFromPath } from "@/lib/navigation-utils";

import type { Project, ApiKey } from "@/lib/types";

export function ApiKeysClient({ initialData }: { initialData: ApiKey[] }) {
	const pathname = usePathname();

	// Extract project and org IDs directly from URL to avoid dashboard state conflicts
	const { projectId, orgId } = useMemo(() => {
		const result = extractOrgAndProjectFromPath(pathname);
		return result;
	}, [pathname]);

	// Fetch actual project data instead of using mock values
	const api = useApi();

	const { data: projectsData } = api.useQuery(
		"get",
		"/orgs/{id}/projects",
		{
			params: {
				path: { id: orgId ?? "" },
			},
		},
		{
			enabled: !!orgId,
			staleTime: 5 * 60 * 1000, // 5 minutes
			refetchOnWindowFocus: false,
		},
	);

	// Find the actual project from the fetched data
	const selectedProject = useMemo((): Project | null => {
		if (!projectId || !projectsData?.projects) {
			return null;
		}

		const actualProject = projectsData.projects.find(
			(p: Project) => p.id === projectId,
		);
		return actualProject ?? null;
	}, [projectId, projectsData]);

	// Get API keys data to check plan limits
	const { data: apiKeysData } = api.useQuery(
		"get",
		"/keys/api",
		{
			params: {
				query: { projectId: selectedProject?.id ?? "" },
			},
		},
		{
			enabled: !!selectedProject?.id,
			staleTime: 5 * 60 * 1000, // 5 minutes
			refetchOnWindowFocus: false,
		},
	);

	const planLimits = apiKeysData?.planLimits;

	return (
		<div className="space-y-8">
			<PageHeader
				title="API keys"
				description="Create and manage keys that authenticate requests to Vichar."
				actions={
					selectedProject ? (
						<CreateApiKeyDialog
							selectedProject={selectedProject}
							disabled={
								planLimits
									? planLimits.currentCount >= planLimits.maxKeys
									: false
							}
							disabledMessage={
								planLimits
									? `This plan allows maximum ${planLimits.maxKeys} API keys per workspace`
									: undefined
							}
						>
							<Button
								disabled={
									!selectedProject ||
									(planLimits
										? planLimits.currentCount >= planLimits.maxKeys
										: false)
								}
							>
								<Key className="mr-1.5 size-4" />
								Create API key
							</Button>
						</CreateApiKeyDialog>
					) : undefined
				}
			/>
			<ApiKeysList
				selectedProject={selectedProject}
				initialData={initialData}
			/>
		</div>
	);
}
