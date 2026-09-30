import { Layers3, Users } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import type { Route } from "next";

export function TeamTabs({
	active,
	teamUrl,
}: {
	active: "members" | "teams";
	teamUrl: string;
}) {
	const linkClass = (isActive: boolean) =>
		cn(
			"inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
			isActive && "bg-card text-foreground shadow-xs",
		);

	return (
		<nav
			className="inline-flex w-fit items-center gap-0.5 rounded-lg border border-border bg-panel p-0.5"
			aria-label="Team sections"
		>
			<Link
				href={teamUrl as Route}
				aria-current={active === "members" ? "page" : undefined}
				className={linkClass(active === "members")}
			>
				<Users className="h-4 w-4" />
				Members
			</Link>
			<Link
				href={`${teamUrl}?tab=teams` as Route}
				aria-current={active === "teams" ? "page" : undefined}
				className={linkClass(active === "teams")}
			>
				<Layers3 className="h-4 w-4" />
				Teams
			</Link>
		</nav>
	);
}
