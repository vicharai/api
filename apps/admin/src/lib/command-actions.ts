import { NAV_GROUPS } from "./nav";

import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

export interface CommandAction {
	id: string;
	label: string;
	group: string;
	icon: LucideIcon;
	href: Route;
	/** Extra words the palette search should match. */
	keywords?: string;
	/** API path the action needs; hidden when the role cannot GET it. */
	requires?: string;
}

/**
 * Static command palette entries (⌘K). Append new actions here; the palette
 * filters them by query and role.
 */
export const COMMAND_ACTIONS: CommandAction[] = [
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
