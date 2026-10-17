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
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "@/lib/components/sidebar";
import { useDashboardContext } from "@/lib/dashboard-context";
import { extractOrgAndProjectFromPath } from "@/lib/navigation-utils";

import {
	getNavGroups,
	isNavItemActive,
	isSettingsPath,
	navHref,
	type NavGroup,
	type NavIds,
} from "./nav-config";

import type { Route } from "next";

const PILL_SPRING = { type: "spring", stiffness: 520, damping: 42 } as const;
const LAST_WORK_PATH_KEY = "vichar:last-work-path";

// Slide direction for the work <-> settings swap: settings enters from the
// right (deeper), work returns from the left.
const modeVariants = {
	enter: (dir: number) => ({ opacity: 0, x: 14 * dir }),
	center: { opacity: 1, x: 0 },
	exit: (dir: number) => ({ opacity: 0, x: -14 * dir }),
};

function NavGroups({
	groups,
	pathname,
	ids,
	pillId,
}: {
	groups: NavGroup[];
	pathname: string;
	ids: NavIds;
	pillId: string;
}) {
	return groups.map((group, gi) => (
		<SidebarGroup key={group.label ?? gi} className="py-1.5">
			{group.label && (
				<SidebarGroupLabel className="h-7 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
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
									className="group/nav relative isolate h-9 rounded-lg text-[13.5px] font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground data-[active=true]:bg-transparent data-[active=true]:font-semibold data-[active=true]:text-sidebar-active-foreground"
								>
									<Link href={navHref(item, ids)} prefetch={true}>
										{active && (
											<motion.span
												layoutId={pillId}
												transition={PILL_SPRING}
												className="absolute inset-0 -z-10 rounded-lg bg-sidebar-active ring-1 ring-inset ring-brand/15"
											/>
										)}
										{active && (
											<motion.span
												layoutId={`${pillId}-bar`}
												transition={PILL_SPRING}
												className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-gradient group-data-[collapsible=icon]:hidden"
											/>
										)}
										<Icon
											className={
												"transition-[transform,color] duration-200 ease-out group-hover/nav:scale-110 " +
												(active
													? "text-brand"
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
				className="h-9 rounded-lg text-[13px] text-muted-foreground hover:text-foreground"
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
	const { selectedOrganization, selectedProject } = useDashboardContext();
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
			className="top-[56px]! bottom-0! h-auto! border-sidebar-border!"
		>
			<SidebarContent className="overflow-x-hidden px-2 pt-4">
				<AnimatePresence mode="wait" initial={false} custom={dir}>
					<motion.div
						key={inSettings ? "settings" : "work"}
						custom={dir}
						variants={modeVariants}
						initial="enter"
						animate="center"
						exit="exit"
						transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
					>
						{inSettings && (
							<SidebarGroup className="pb-1">
								<SidebarMenu>
									<SidebarMenuItem>
										<SidebarMenuButton
											asChild
											tooltip="Back to dashboard"
											className="group/back h-9 rounded-lg text-[13px] text-muted-foreground hover:text-foreground"
										>
											<Link href={backHref}>
												<ArrowLeft className="transition-transform duration-200 group-hover/back:-translate-x-0.5" />
												<span>Back</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								</SidebarMenu>
								<p className="px-2.5 pt-3 font-display text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
									Settings
								</p>
							</SidebarGroup>
						)}
						<NavGroups
							groups={inSettings ? settings : work}
							pathname={pathname}
							ids={ids}
							pillId={inSettings ? "nav-pill-settings" : "nav-pill-work"}
						/>
					</motion.div>
				</AnimatePresence>
			</SidebarContent>
			<SidebarFooter className="gap-1 border-t border-sidebar-border px-2 pb-3 pt-2">
				<SidebarMenu className="gap-0.5">
					{!inSettings && (
						<SidebarMenuItem>
							<SidebarMenuButton
								asChild
								tooltip="Settings"
								className="group/set h-9 rounded-lg text-[13.5px] font-medium text-sidebar-foreground hover:text-foreground"
							>
								<Link href={settingsHref}>
									<Settings className="text-muted-foreground transition-transform duration-500 ease-out group-hover/set:rotate-90 group-hover/set:text-foreground" />
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
