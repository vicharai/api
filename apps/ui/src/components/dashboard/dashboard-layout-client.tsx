"use client";

import { usePathname } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { type ReactNode, useEffect } from "react";

import { AppHeader } from "@/components/dashboard/app-header";
import { EnterpriseLicenseBanner } from "@/components/dashboard/enterprise-license-banner";
import { OrganizationRouteGuard } from "@/components/dashboard/organization-route-guard";
import { SideNav } from "@/components/dashboard/side-nav";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { DashboardProvider } from "@/lib/dashboard-context";
import { useDashboardState } from "@/lib/dashboard-state";
import { useSystemBanner } from "@/lib/system-banner-context";

import { SystemBannerBar } from "@llmgateway/shared/system-banner";

interface DashboardLayoutClientProps {
	children: ReactNode;
	initialOrganizationsData?: unknown;
	initialProjectsData?: unknown;
	selectedOrgId?: string;
	selectedProjectId?: string;
}

export function DashboardLayoutClient({
	children,
	initialOrganizationsData,
	initialProjectsData,
	selectedOrgId,
	selectedProjectId,
}: DashboardLayoutClientProps) {
	const posthog = usePostHog();
	const pathname = usePathname();
	const systemBanner = useSystemBanner();

	const {
		organizations,
		projects,
		selectedProject,
		selectedOrganization,
		handleOrganizationSelect,
		handleProjectSelect,
		handleOrganizationCreated,
		handleProjectCreated,
	} = useDashboardState({
		initialOrganizationsData,
		initialProjectsData,
		selectedOrgId,
		selectedProjectId,
	});

	useEffect(() => {
		posthog.capture("page_viewed_dashboard");
	}, [posthog]);

	return (
		<DashboardProvider
			value={{
				organizations,
				projects,
				selectedOrganization,
				selectedProject,
				handleOrganizationSelect,
				handleProjectSelect,
				handleOrganizationCreated,
				handleProjectCreated,
			}}
		>
			<div className="flex min-h-screen w-full flex-col">
				<AppHeader
					projects={projects}
					selectedProject={selectedProject}
					onSelectProject={handleProjectSelect}
					selectedOrganization={selectedOrganization}
					organizations={organizations}
					onSelectOrganization={handleOrganizationSelect}
					onProjectCreated={handleProjectCreated}
					onOrganizationCreated={handleOrganizationCreated}
				/>
				<div className="flex flex-1 pt-14">
					<SideNav />
					<div className="flex min-w-0 flex-1 flex-col">
						<SystemBannerBar banner={systemBanner} />
						<EmailVerificationBanner />
						<EnterpriseLicenseBanner />
						<main className="bg-background relative mx-auto w-full max-w-7xl flex-1 overflow-x-hidden px-4 pb-8 pt-8 sm:px-6">
							<OrganizationRouteGuard>
								{/* Keyed on the path so each view eases in on navigation. */}
								<div key={pathname} className="animate-page-in">
									{children}
								</div>
							</OrganizationRouteGuard>
						</main>
					</div>
				</div>
			</div>
		</DashboardProvider>
	);
}
