"use client";

import { usePostHog } from "posthog-js/react";
import { type ReactNode, useEffect } from "react";

import { AppHeader } from "@/components/dashboard/app-header";
import { EnterpriseLicenseBanner } from "@/components/dashboard/enterprise-license-banner";
import { NavDock } from "@/components/dashboard/nav-dock";
import { OrganizationRouteGuard } from "@/components/dashboard/organization-route-guard";
import { PlanExpiryBanner } from "@/components/dashboard/plan-expiry-banner";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { TooltipProvider } from "@/lib/components/tooltip";
import { DashboardProvider } from "@/lib/dashboard-context";
import { useDashboardState } from "@/lib/dashboard-state";
import { useSystemBanner } from "@/lib/system-banner-context";

import { SystemBannerBar } from "@llmgateway/shared/system-banner";

import type { AnnouncementEntry } from "@/components/dashboard/changelog-notifications";

interface DashboardLayoutClientProps {
	children: ReactNode;
	initialOrganizationsData?: unknown;
	initialProjectsData?: unknown;
	selectedOrgId?: string;
	selectedProjectId?: string;
	announcementEntries?: AnnouncementEntry[];
}

export function DashboardLayoutClient({
	children,
	initialOrganizationsData,
	initialProjectsData,
	selectedOrgId,
	selectedProjectId,
	announcementEntries = [],
}: DashboardLayoutClientProps) {
	const posthog = usePostHog();
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
				<TooltipProvider delayDuration={0}>
					<AppHeader
						projects={projects}
						selectedProject={selectedProject}
						onSelectProject={handleProjectSelect}
						selectedOrganization={selectedOrganization}
						organizations={organizations}
						onSelectOrganization={handleOrganizationSelect}
						onProjectCreated={handleProjectCreated}
						onOrganizationCreated={handleOrganizationCreated}
						announcementEntries={announcementEntries}
					/>
					<div className="flex flex-1 flex-col pt-14">
						<SystemBannerBar banner={systemBanner} />
						<EmailVerificationBanner />
						<EnterpriseLicenseBanner />
						<PlanExpiryBanner />
						<main className="bg-background relative mx-auto w-full max-w-7xl flex-1 overflow-x-hidden px-4 pb-36 pt-8 sm:px-6">
							<OrganizationRouteGuard>{children}</OrganizationRouteGuard>
						</main>
					</div>
					<NavDock />
				</TooltipProvider>
			</div>
		</DashboardProvider>
	);
}
