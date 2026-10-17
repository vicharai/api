"use client";

import {
	ArrowLeft,
	PanelLeftClose,
	PanelLeftOpen,
	Settings,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "@/lib/components/sidebar";
import { useDashboardContext } from "@/lib/dashboard-context";
import { VicharMark } from "@/lib/icons/vichar-logo";
import { extractOrgAndProjectFromPath } from "@/lib/navigation-utils";

import {
	getNavGroups,
	isNavItemActive,
	isSettingsPath,
	navHref,
	type NavGroup,
	type NavIds,
} from "./nav-config";
import { ProjectSwitcher } from "./project-switcher";

import type { Route } from "next";

const LAST_WORK_PATH_KEY = "vichar:last-work-path";

// Slide direction for the work <-> settings swap: settings enters from the
// right (deeper), work returns from the left.
const modeVariants = {
	enter: (dir: number) => ({ opacity: 0, x: 8 * dir }),
	center: { opacity: 1, x: 0 },
	exit: (dir: number) => ({ opacity: 0, x: -8 * dir }),
};

function NavGroups({
	groups,
	pathname,
	ids,
}: {
	groups: NavGroup[];
	pathname: string;
	ids: NavIds;
}) {
	return groups.map((group, gi) => (
		<SidebarGroup key={group.label ?? gi} className="py-1.5">
			{group.label && (
				<SidebarGroupLabel className="h-8 px-4 text-xs font-medium tracking-[0.01em] text-muted-foreground">
					{group.label}
				</SidebarGroupLabel>
			)}
			<SidebarGroupContent>
				<SidebarMenu className="gap-0.5">
					{group.items.map((item) => {
						const Icon = item.icon;
						const active = isNavItemActive(item, pathname, ids);
						return (
							<SidebarMenuItem key={item.segment || "overview"}>
								<SidebarMenuButton
									asChild
									isActive={active}
									tooltip={item.label}
									className="group/nav h-10 gap-3 rounded-full px-4 text-sm font-normal text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground data-[active=true]:bg-sidebar-active data-[active=true]:font-medium data-[active=true]:text-sidebar-active-foreground data-[active=true]:hover:bg-sidebar-active group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>svg]:size-[18px]"
								>
									<Link href={navHref(item, ids)} prefetch={true}>
										<Icon
											className={
												"transition-colors duration-150 " +
												(active
													? "text-sidebar-active-foreground"
													: "text-muted-foreground group-hover/nav:text-foreground")
											}
										/>
										<span>{item.label}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	));
}

function CollapseItem() {
	const { state, toggleSidebar } = useSidebar();
	const collapsed = state === "collapsed";
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				onClick={toggleSidebar}
				tooltip={collapsed ? "Expand  ⌘B" : "Collapse  ⌘B"}
				className="h-10 gap-3 rounded-full px-4 text-sm text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>svg]:size-[18px]"
			>
				{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
				<span>Collapse</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

/**
 * The app rail. Two modes share one column: "work" (the handful of pages
 * people return to daily) and "settings" (every configuration surface,
 * scoped Project → Workspace → Account). Entering any settings page
 * swaps the rail; "Back" returns to the last work page.
 */
export function SideNav() {
	const pathname = usePathname();
	const {
		selectedOrganization,
		selectedProject,
		projects,
		handleProjectSelect,
		handleProjectCreated,
	} = useDashboardContext();
	const { isMobile, setOpenMobile } = useSidebar();
	const [lastWorkPath, setLastWorkPath] = React.useState<string | null>(null);

	React.useEffect(() => {
		setOpenMobile(false);
	}, [pathname, setOpenMobile]);

	const fromPath = React.useMemo(
		() => extractOrgAndProjectFromPath(pathname),
		[pathname],
	);
	const ids: NavIds = {
		orgId: fromPath.orgId ?? selectedOrganization?.id,
		projectId: fromPath.projectId ?? selectedProject?.id,
	};

	const { work, settings } = getNavGroups(selectedOrganization);
	const inSettings = isSettingsPath(pathname, settings, ids);

	React.useEffect(() => {
		if (!inSettings) {
			sessionStorage.setItem(LAST_WORK_PATH_KEY, pathname);
			setLastWorkPath(pathname);
		} else {
			setLastWorkPath(sessionStorage.getItem(LAST_WORK_PATH_KEY));
		}
	}, [inSettings, pathname]);

	if (!ids.orgId) {
		return null;
	}

	const settingsHref = navHref(settings[0].items[0], ids);
	const backHref = (lastWorkPath ?? navHref(work[0].items[0], ids)) as Route;
	const dir = inSettings ? 1 : -1;

	return (
		<Sidebar
			collapsible="icon"
			className="top-[64px]! bottom-0! h-auto! border-transparent!"
		>
			{isMobile && (
				<SidebarHeader className="gap-4 border-b border-divider px-5 pb-4 pt-5">
					<div className="flex items-center gap-2">
						<VicharMark className="size-8 text-brand" />
						<span className="text-[20px] font-medium leading-none text-muted-foreground">
							Vichar
						</span>
					</div>
					{!pathname.includes("/org/") && (
						<ProjectSwitcher
							projects={projects}
							selectedProject={selectedProject}
							onSelectProject={handleProjectSelect}
							currentOrganization={selectedOrganization}
							onProjectCreated={handleProjectCreated}
						/>
					)}
				</SidebarHeader>
			)}
			<SidebarContent className="overflow-x-hidden px-3 pt-2">
				<AnimatePresence mode="wait" initial={false} custom={dir}>
					<motion.div
						key={inSettings ? "settings" : "work"}
						custom={dir}
						variants={modeVariants}
						initial="enter"
						animate="center"
						exit="exit"
						transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
					>
						{inSettings && (
							<SidebarGroup className="pb-1">
								<SidebarMenu>
									<SidebarMenuItem>
										<SidebarMenuButton
											asChild
											tooltip="Back to dashboard"
											className="h-10 gap-3 rounded-full px-4 text-sm text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>svg]:size-[18px]"
										>
											<Link href={backHref}>
												<ArrowLeft />
												<span>Back</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								</SidebarMenu>
								<p className="px-4 pt-3 text-xs font-medium tracking-[0.01em] text-muted-foreground group-data-[collapsible=icon]:hidden">
									Settings
								</p>
							</SidebarGroup>
						)}
						<NavGroups
							groups={inSettings ? settings : work}
							pathname={pathname}
							ids={ids}
						/>
					</motion.div>
				</AnimatePresence>
			</SidebarContent>
			<SidebarFooter className="gap-1 px-3 pb-3 pt-2">
				<SidebarMenu className="gap-0.5">
					{!inSettings && (
						<SidebarMenuItem>
							<SidebarMenuButton
								asChild
								tooltip="Settings"
								className="group/set h-10 gap-3 rounded-full px-4 text-sm text-sidebar-foreground hover:text-foreground group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>svg]:size-[18px]"
							>
								<Link href={settingsHref}>
									<Settings className="text-muted-foreground transition-colors group-hover/set:text-foreground" />
									<span>Settings</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}
					{!isMobile && <CollapseItem />}
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
