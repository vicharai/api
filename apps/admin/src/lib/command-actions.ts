import {
	Ban,
	Building2,
	CircleDollarSign,
	Megaphone,
	Power,
	User,
	UserX,
	type LucideIcon,
} from "lucide-react";

import type { Route } from "next";

/** Multi-step palette flows: pick a target, then act on it. */
export type CommandFlow =
	| "open-org"
	| "open-user"
	| "add-credits"
	| "block-org"
	| "block-user"
	| "kill-switch";

export interface CommandAction {
	id: string;
	label: string;
	icon: LucideIcon;
	/** Extra words the palette search matches. */
	keywords?: string;
	run: { flow: CommandFlow } | { href: Route };
	/** Hidden when the admin role may not call this (`_` stands for an id). */
	requires?: {
		method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
		path: string;
	};
}

/** Quick actions in the command palette (⌘K). Append new ones here. */
export const COMMAND_ACTIONS: CommandAction[] = [
	{
		id: "open-org",
		label: "Open organization…",
		icon: Building2,
		keywords: "go find org company",
		run: { flow: "open-org" },
	},
	{
		id: "open-user",
		label: "Open user…",
		icon: User,
		keywords: "go find account email",
		run: { flow: "open-user" },
	},
	{
		id: "add-credits",
		label: "Add credits to organization…",
		icon: CircleDollarSign,
		keywords: "balance adjust top up gift",
		run: { flow: "add-credits" },
		requires: { method: "POST", path: "/admin/organizations/_/credits" },
	},
	{
		id: "block-org",
		label: "Block / unblock organization…",
		icon: Ban,
		keywords: "suspend deactivate reactivate",
		run: { flow: "block-org" },
		requires: { method: "POST", path: "/admin/organizations/_/block" },
	},
	{
		id: "block-user",
		label: "Block / unblock user…",
		icon: UserX,
		keywords: "suspend deactivate reactivate",
		run: { flow: "block-user" },
		requires: { method: "POST", path: "/admin/users/_/block" },
	},
	{
		id: "kill-switch",
		label: "Toggle kill switch…",
		icon: Power,
		keywords: "disable provider model mapping routing outage",
		run: { flow: "kill-switch" },
		requires: { method: "POST", path: "/admin/routing-overrides" },
	},
	{
		id: "announce",
		label: "Compose announcement",
		icon: Megaphone,
		keywords: "broadcast notify message",
		run: { href: "/announcements" },
		requires: { method: "POST", path: "/admin/announcements" },
	},
];
