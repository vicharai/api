"use client";

import { Key } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { ApiKeysList } from "@/components/api-keys/api-keys-list";
import { CreateApiKeyDialog } from "@/components/api-keys/create-api-key-dialog";
import { Button } from "@/lib/components/button";
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
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<h1 className="text-xl font-medium tracking-tight">API Keys</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Create and manage API keys to authenticate requests to Vichar
						</p>
					</div>
					{selectedProject && (
						<CreateApiKeyDialog
							selectedProject={selectedProject}
							disabled={
								planLimits
									? planLimits.currentCount >= planLimits.maxKeys
									: false
							}
							disabledMessage={
								planLimits
									? `${planLimits.plan === "enterprise" ? "Enterprise" : planLimits.plan === "pro" ? "Pro" : "Free"} plan allows maximum ${planLimits.maxKeys} API keys per organization`
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
								className="flex w-full items-center md:w-auto"
							>
								<Key className="mr-2 h-4 w-4" />
								Create API Key
							</Button>
						</CreateApiKeyDialog>
					)}
				</div>
				<div className="space-y-4">
					{!selectedProject && (
						<p className="text-sm text-amber-600 dark:text-amber-500">
							Loading project information...
						</p>
					)}
					<ApiKeysList
						selectedProject={selectedProject}
						initialData={initialData}
					/>
				</div>
			</div>
		</div>
	);
}
