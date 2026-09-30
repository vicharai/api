import {
	Activity,
	BadgeCheck,
	BarChart3,
	BotMessageSquare,
	Boxes,
	Building2,
	Code2,
	CreditCard,
	FileClock,
	Gauge,
	Gift,
	Key,
	KeyRound,
	KeySquare,
	LayoutDashboard,
	Lock,
	MessagesSquare,
	Percent,
	PieChart,
	ReceiptText,
	Route as RouteIcon,
	ScrollText,
	ShieldAlert,
	ShieldCheck,
	SlidersHorizontal,
	Split,
	Terminal,
	UserRound,
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
			{ segment: "sessions", label: "Sessions", icon: MessagesSquare },
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
			{ segment: "agents", label: "Agents", icon: BotMessageSquare },
			org("models", "Models", Boxes, ["catalog", "providers"]),
			org("provider-keys", "Provider Keys", KeyRound, ["byok"]),
		],
	},
];

const PROJECT_SETTINGS: NavGroup = {
	label: "Project",
	items: [
		{
			segment: "settings/preferences",
			label: "General",
			icon: SlidersHorizontal,
			keywords: ["project settings"],
		},
		{ segment: "settings/routing", label: "Routing", icon: RouteIcon },
		{
			segment: "settings/dynamic-routes",
			label: "Dynamic Routes",
			icon: Split,
		},
		{ segment: "settings/guardrails", label: "Guardrails", icon: ShieldCheck },
		{ segment: "settings/sdk", label: "SDK & Integrations", icon: Code2 },
	],
};

const ORG_SETTINGS: NavGroup = {
	label: "Organization",
	items: [
		org("preferences", "General", Building2, ["organization settings"]),
		org("team", "Team", Users, ["members", "invite"]),
		org("billing", "Billing", CreditCard, ["credits", "top up", "plan"]),
		org("transactions", "Transactions", ReceiptText, ["invoices"]),
		org("limits", "Limits", Gauge, ["rate limit", "spend cap"]),
		org("policies", "Policies", ScrollText),
		org("routing", "Smart Routing", RouteIcon),
		org("discounts", "Discounts", Percent),
		org("referrals", "Referrals", Gift),
	],
};

const ENTERPRISE_SETTINGS: NavGroup = {
	label: "Enterprise",
	items: [
		org("analytics", "Org Analytics", PieChart),
		org("skills", "Skills", Terminal),
		org("guardrails", "Guardrails", ShieldCheck),
		org("compliance", "Compliance", BadgeCheck),
		org("security-events", "Security Events", ShieldAlert),
		org("master-keys", "Master Keys", KeySquare),
		org("sso", "SSO", Lock),
		org("audit-logs", "Audit Logs", FileClock),
	],
};

const ACCOUNT_SETTINGS: NavGroup = {
	label: "Account",
	items: [
		{
			segment: "settings/account",
			label: "Profile",
			icon: UserRound,
			keywords: ["account", "name", "email"],
		},
		{
			segment: "settings/security",
			label: "Security",
			icon: Lock,
			keywords: ["password", "2fa"],
		},
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
	const isDeveloper = organization?.role === "developer";
	if (isDeveloper) {
		return { work: DEVELOPER_WORK, settings: [ACCOUNT_SETTINGS] };
	}
	const settings = [PROJECT_SETTINGS, ORG_SETTINGS];
	if (organization?.enterpriseAccess === true) {
		settings.push(ENTERPRISE_SETTINGS);
	}
	settings.push(ACCOUNT_SETTINGS);
	return { work: WORK, settings };
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
