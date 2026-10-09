import {
	Activity,
	BarChart3,
	Boxes,
	Building2,
	CreditCard,
	Gauge,
	Gift,
	Key,
	LayoutDashboard,
	Route as RouteIcon,
	Users,
} from "lucide-react";

import { buildDashboardUrl, buildOrgUrl } from "@/lib/navigation-utils";

import type { Organization } from "@/lib/types";
import type { Route } from "next";

export type NavIcon = React.ComponentType<{ className?: string }>;

export interface NavItem {
	/** Path segment relative to the project (or org, when orgScoped). */
	segment: string;
	label: string;
	icon: NavIcon;
	orgScoped?: boolean;
	exact?: boolean;
	/** Extra search terms for the command palette. */
	keywords?: string[];
}

export interface NavGroup {
	label?: string;
	items: NavItem[];
}

const org = (
	segment: string,
	label: string,
	icon: NavIcon,
	keywords?: string[],
): NavItem => ({
	segment: `org/${segment}`,
	label,
	icon,
	orgScoped: true,
	keywords,
});

// Work mode: what people come back for daily. Kept short on purpose.
const WORK: NavGroup[] = [
	{
		items: [
			{ segment: "", label: "Overview", icon: LayoutDashboard, exact: true },
			{
				segment: "activity",
				label: "Activity",
				icon: Activity,
				keywords: ["logs", "requests"],
			},
			{
				segment: "analytics",
				label: "Analytics",
				icon: BarChart3,
				keywords: ["usage", "costs"],
			},
		],
	},
	{
		label: "Build",
		items: [
			{
				segment: "api-keys",
				label: "API Keys",
				icon: Key,
				keywords: ["token"],
			},
			org("models", "Models", Boxes, ["catalog", "providers"]),
			org("routing", "Smart Routing", RouteIcon),
		],
	},
	{
		label: "Grow",
		items: [org("referrals", "Referrals", Gift)],
	},
];

const ORG_SETTINGS: NavGroup = {
	label: "Workspace",
	items: [
		org("preferences", "General", Building2, ["workspace settings"]),
		org("team", "Members", Users, ["team", "invite"]),
		org("billing", "Billing", CreditCard, [
			"credits",
			"top up",
			"plan",
			"transactions",
			"invoices",
		]),
		org("limits", "Limits", Gauge, ["rate limit", "spend cap"]),
	],
};

const DEVELOPER_WORK: NavGroup[] = [
	{
		items: [
			{ segment: "me", label: "Dashboard", icon: LayoutDashboard, exact: true },
			{ segment: "me/api-keys", label: "API Keys", icon: Key },
			org("models", "Models", Boxes),
		],
	},
];

export function getNavGroups(organization: Organization | null | undefined) {
	// Account surfaces (profile, security) live in the avatar menu, not settings.
	const isDeveloper = organization?.role === "developer";
	if (isDeveloper) {
		return { work: DEVELOPER_WORK, settings: [] };
	}
	return { work: WORK, settings: [ORG_SETTINGS] };
}

export interface NavIds {
	orgId?: string | null;
	projectId?: string | null;
}

export function navHref(item: NavItem, { orgId, projectId }: NavIds): Route {
	return item.orgScoped
		? (buildOrgUrl(orgId, item.segment) as Route)
		: buildDashboardUrl(orgId, projectId, item.segment);
}

export function isNavItemActive(item: NavItem, pathname: string, ids: NavIds) {
	const target = navHref(item, ids).split("?")[0];
	if (item.exact) {
		return pathname === target;
	}
	if (item.orgScoped) {
		return pathname.startsWith(`/dashboard/${ids.orgId}/${item.segment}`);
	}
	return (
		pathname === target ||
		pathname.startsWith(`${target}/`) ||
		(item.segment === "analytics" &&
			(pathname.endsWith("/usage") || pathname.endsWith("/model-usage")))
	);
}

/** True when the pathname belongs to any settings-scope item. */
export function isSettingsPath(
	pathname: string,
	groups: NavGroup[],
	ids: NavIds,
) {
	return groups.some((g) =>
		g.items.some((item) => isNavItemActive(item, pathname, ids)),
	);
}
