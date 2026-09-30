"use client";

import {
	Activity,
	BarChart3,
	BotMessageSquare,
	Boxes,
	CreditCard,
	Gift,
	Key,
	KeyRound,
	LayoutDashboard,
	MessagesSquare,
	PanelLeftClose,
	PanelLeftOpen,
	ReceiptText,
	Settings,
	SlidersHorizontal,
	Users,
} from "lucide-react";
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
import {
	buildDashboardUrl,
	buildOrgUrl as buildOrganizationUrl,
	extractOrgAndProjectFromPath,
} from "@/lib/navigation-utils";

import type { Route } from "next";

type NavIcon = React.ComponentType<{ className?: string }>;

interface NavItem {
	/** Path segment relative to the project root; "" is the overview. */
	segment: string;
	label: string;
	icon: NavIcon;
	/** Link lives under /dashboard/{org}/org/ rather than the project. */
	orgScoped?: boolean;
	/** Match exactly rather than as a prefix. */
	exact?: boolean;
}

const PROJECT_ITEMS: NavItem[] = [
	{ segment: "", label: "Overview", icon: LayoutDashboard, exact: true },
	{ segment: "activity", label: "Activity", icon: Activity },
	{ segment: "analytics", label: "Analytics", icon: BarChart3 },
	{ segment: "agents", label: "Agents", icon: BotMessageSquare },
	{ segment: "api-keys", label: "API Keys", icon: Key },
	{ segment: "sessions", label: "Sessions", icon: MessagesSquare },
	{ segment: "settings/preferences", label: "Settings", icon: Settings },
];

const ORG_ITEMS: NavItem[] = [
	{
		segment: "org/billing",
		label: "Billing",
		icon: CreditCard,
		orgScoped: true,
	},
	{
		segment: "org/transactions",
		label: "Transactions",
		icon: ReceiptText,
		orgScoped: true,
	},
	{ segment: "org/team", label: "Team", icon: Users, orgScoped: true },
	{
		segment: "org/provider-keys",
		label: "Provider Keys",
		icon: KeyRound,
		orgScoped: true,
	},
	{ segment: "org/models", label: "Models", icon: Boxes, orgScoped: true },
	{
		segment: "org/referrals",
		label: "Referrals",
		icon: Gift,
		orgScoped: true,
	},
	{
		segment: "org/preferences",
		label: "Org Settings",
		icon: SlidersHorizontal,
		orgScoped: true,
	},
];

const DEVELOPER_PROJECT_ITEMS: NavItem[] = [
	{ segment: "me", label: "Dashboard", icon: LayoutDashboard, exact: true },
	{ segment: "me/api-keys", label: "API Keys", icon: Key },
];

const DEVELOPER_ORG_ITEMS: NavItem[] = [
	{ segment: "org/models", label: "Models", icon: Boxes, orgScoped: true },
];

function CollapseItem() {
	const { state, toggleSidebar } = useSidebar();
	const collapsed = state === "collapsed";
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				onClick={toggleSidebar}
				tooltip={collapsed ? "Expand sidebar" : "Collapse sidebar"}
			>
				{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
				<span>Collapse</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

/**
 * The app rail: slim navigation column under the fixed header. Collapses to
 * a 3rem icon rail (Cmd/Ctrl+B or the footer button), persists via cookie,
 * and becomes a slide-over sheet on mobile.
 */
export function SideNav() {
	const pathname = usePathname();
	const { selectedOrganization, selectedProject } = useDashboardContext();
	const { isMobile, setOpenMobile } = useSidebar();

	React.useEffect(() => {
		setOpenMobile(false);
	}, [pathname, setOpenMobile]);

	const { orgId, projectId } = React.useMemo(
		() => extractOrgAndProjectFromPath(pathname),
		[pathname],
	);
	const currentOrgId = orgId ?? selectedOrganization?.id;
	const currentProjectId = projectId ?? selectedProject?.id;

	const isDeveloper = selectedOrganization?.role === "developer";
	const projectItems = isDeveloper ? DEVELOPER_PROJECT_ITEMS : PROJECT_ITEMS;
	const orgItems = isDeveloper ? DEVELOPER_ORG_ITEMS : ORG_ITEMS;

	const hrefFor = (item: NavItem): Route =>
		item.orgScoped
			? (buildOrganizationUrl(currentOrgId, item.segment) as Route)
			: buildDashboardUrl(currentOrgId, currentProjectId, item.segment);

	const isActive = (item: NavItem) => {
		const target = hrefFor(item).split("?")[0];
		if (item.exact) {
			return pathname === target;
		}
		if (item.segment.startsWith("settings")) {
			return pathname.includes("/settings/");
		}
		if (item.orgScoped) {
			return pathname.startsWith(`/dashboard/${currentOrgId}/${item.segment}`);
		}
		return (
			pathname === target ||
			pathname.startsWith(`${target}/`) ||
			// merged views: analytics owns the old usage/model-usage URLs
			(item.segment === "analytics" &&
				(pathname.endsWith("/usage") || pathname.endsWith("/model-usage")))
		);
	};

	if (!currentOrgId) {
		return null;
	}

	const renderItems = (items: NavItem[]) => (
		<SidebarMenu>
			{items.map((item) => {
				const Icon = item.icon;
				return (
					<SidebarMenuItem key={item.segment || "overview"}>
						<SidebarMenuButton
							asChild
							isActive={isActive(item)}
							tooltip={item.label}
						>
							<Link href={hrefFor(item)} prefetch={true}>
								<Icon />
								<span>{item.label}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				);
			})}
		</SidebarMenu>
	);

	return (
		<Sidebar collapsible="icon" className="top-14! bottom-0! h-auto!">
			<SidebarContent className="px-2 pt-4">
				<SidebarGroup>
					<SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
						Project
					</SidebarGroupLabel>
					<SidebarGroupContent>{renderItems(projectItems)}</SidebarGroupContent>
				</SidebarGroup>
				{orgItems.length > 0 && (
					<SidebarGroup>
						<SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
							Organization
						</SidebarGroupLabel>
						<SidebarGroupContent>{renderItems(orgItems)}</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>
			{!isMobile && (
				<SidebarFooter className="border-t border-sidebar-border px-2 py-2">
					<SidebarMenu>
						<CollapseItem />
					</SidebarMenu>
				</SidebarFooter>
			)}
			<SidebarRail />
		</Sidebar>
	);
}
