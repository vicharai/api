import {
	AlertTriangle,
	BarChart3,
	Briefcase,
	Building2,
	CreditCard,
	FlaskConical,
	Gauge,
	History,
	Inbox,
	LayoutDashboard,
	Route as RouteIcon,
	Server,
	Settings,
	ShieldAlert,
	ShieldCheck,
	Sparkles,
	UserCog,
	Users,
	type LucideIcon,
} from "lucide-react";

import type { Route } from "next";

export interface NavItem {
	title: string;
	href: Route;
	icon: LucideIcon;
	/** An API path the item's main data needs; hidden when the role lacks it. */
	requires?: string;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
	{
		label: "Overview",
		items: [{ title: "Overview", href: "/", icon: LayoutDashboard }],
	},
	{
		label: "Customers",
		items: [
			{ title: "Users", href: "/users", icon: Users },
			{ title: "Flagged", href: "/users/flagged", icon: ShieldAlert },
			{ title: "Organizations", href: "/organizations", icon: Building2 },
			{ title: "CRM", href: "/crm", icon: Briefcase },
		],
	},
	{
		label: "Operations",
		items: [
			{ title: "Issues", href: "/issues", icon: AlertTriangle },
			{ title: "Support", href: "/support", icon: Inbox },
			{ title: "Load", href: "/load", icon: Gauge },
			{
				title: "Usage",
				href: "/usage",
				icon: BarChart3,
				requires: "/admin/global-stats",
			},
			{ title: "Providers", href: "/providers", icon: Server },
			{ title: "Models", href: "/models", icon: Sparkles },
			{ title: "Routing", href: "/routing", icon: RouteIcon },
			{ title: "Safety", href: "/safety", icon: ShieldCheck },
			{ title: "Benchmarks", href: "/benchmarks", icon: FlaskConical },
		],
	},
	{
		label: "Business",
		items: [{ title: "Billing", href: "/billing", icon: CreditCard }],
	},
	{
		label: "Admin",
		items: [
			{
				title: "Team",
				href: "/team",
				icon: UserCog,
				requires: "/admin/team",
			},
			{ title: "Audit log", href: "/audit", icon: History },
			{ title: "Settings", href: "/settings", icon: Settings },
		],
	},
];

export function isNavActive(pathname: string, href: string): boolean {
	if (href === "/") {
		return pathname === "/";
	}
	if (href === "/users") {
		return pathname === "/users" || /^\/users\/(?!flagged)/.test(pathname);
	}
	return pathname === href || pathname.startsWith(`${href}/`);
}
