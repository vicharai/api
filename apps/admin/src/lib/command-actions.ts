import {
	Ban,
	Building2,
	CircleDollarSign,
	KeyRound,
	Megaphone,
	Power,
	Server,
	Sparkles,
	Ticket,
	User,
	UserX,
	type LucideIcon,
} from "lucide-react";

import { NAV_GROUPS } from "./nav";

import type { Route } from "next";

/** Multi-step palette flows: pick a target, then act on it. */
export type CommandFlow =
	| "open-org"
	| "open-user"
	| "adjust-balance"
	| "block-org"
	| "block-user"
	| "kill-switch";

export interface CommandAction {
	id: string;
	label: string;
	group: string;
	icon: LucideIcon;
	/** Navigates here when selected (ignored when `flow` is set). */
	href?: Route;
	/** Starts a palette flow instead of navigating. */
	flow?: CommandFlow;
	/** Extra words the palette search should match. */
	keywords?: string;
	/** API path the action needs; hidden when the role cannot GET it. */
	requires?: string;
	/** Mutation the action performs (`_` stands for an id); hidden when the role cannot call it. */
	mutation?: {
		method: "POST" | "PUT" | "PATCH" | "DELETE";
		path: string;
	};
}

const QUICK = "Quick actions";

/**
 * Static command palette entries (⌘K). Append new actions here; the palette
 * filters them by query and role and lists groups in this order.
 */
export const COMMAND_ACTIONS: CommandAction[] = [
	{
		id: "flow:open-org",
		label: "Open organization…",
		group: QUICK,
		icon: Building2,
		flow: "open-org",
		keywords: "go find org company",
	},
	{
		id: "flow:open-user",
		label: "Open user…",
		group: QUICK,
		icon: User,
		flow: "open-user",
		keywords: "go find account email",
	},
	{
		id: "flow:adjust-balance",
		label: "Adjust organization balance…",
		group: QUICK,
		icon: CircleDollarSign,
		flow: "adjust-balance",
		keywords: "credits add deduct top up refund",
		mutation: {
			method: "POST",
			path: "/admin/organizations/_/balance-adjustments",
		},
	},
	{
		id: "flow:block-org",
		label: "Block / unblock organization…",
		group: QUICK,
		icon: Ban,
		flow: "block-org",
		keywords: "suspend deactivate reactivate",
		mutation: { method: "POST", path: "/admin/organizations/_/block" },
	},
	{
		id: "flow:block-user",
		label: "Block / unblock user…",
		group: QUICK,
		icon: UserX,
		flow: "block-user",
		keywords: "suspend deactivate reactivate",
		mutation: { method: "POST", path: "/admin/users/_/block" },
	},
	{
		id: "flow:kill-switch",
		label: "Toggle kill switch…",
		group: QUICK,
		icon: Power,
		flow: "kill-switch",
		keywords: "disable provider model mapping routing outage",
		mutation: { method: "POST", path: "/admin/routing-overrides" },
	},
	{
		id: "action:add-model",
		label: "Add model or override a price",
		group: QUICK,
		icon: Sparkles,
		href: "/models?tab=catalog",
		keywords: "catalog managed model mapping pricing",
		mutation: { method: "POST", path: "/admin/catalog/models" },
	},
	{
		id: "action:add-provider",
		label: "Add custom provider",
		group: QUICK,
		icon: Server,
		href: "/providers?tab=catalog",
		keywords: "catalog openai compatible endpoint base url",
		mutation: { method: "POST", path: "/admin/catalog/providers" },
	},
	{
		id: "action:promo",
		label: "Create promo code",
		group: QUICK,
		icon: Ticket,
		href: "/promo-codes",
		keywords: "coupon voucher free credits",
		mutation: { method: "POST", path: "/admin/promo-codes" },
	},
	{
		id: "action:find-key",
		label: "Find API key",
		group: QUICK,
		icon: KeyRound,
		href: "/api-keys",
		keywords: "token prefix revoke",
	},
	{
		id: "action:announce",
		label: "Compose announcement",
		group: QUICK,
		icon: Megaphone,
		href: "/announcements",
		keywords: "broadcast notify message",
		mutation: { method: "POST", path: "/admin/announcements" },
	},
	...NAV_GROUPS.flatMap((group) =>
		group.items.map((item) => ({
			id: `nav:${item.href}`,
			label: `Go to ${item.title}`,
			group: "Navigation",
			icon: item.icon,
			href: item.href,
			keywords: group.label,
			requires: item.requires,
		})),
	),
];
