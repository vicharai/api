"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import type { Route } from "next";

interface RailItem {
	segment: string;
	label: string;
}

const GROUPS: { label: string; items: RailItem[] }[] = [
	{
		label: "Project",
		items: [
			{ segment: "preferences", label: "Preferences" },
			{ segment: "routing", label: "Routing" },
			{ segment: "dynamic-routes", label: "Dynamic Routes" },
			{ segment: "guardrails", label: "Guardrails" },
			{ segment: "sdk", label: "SDK & Integrations" },
		],
	},
	{
		label: "You",
		items: [
			{ segment: "account", label: "Account" },
			{ segment: "security", label: "Security" },
		],
	},
];

/**
 * The settings sub-navigation: a narrow vertical rail on desktop, a
 * horizontal scroll strip on small screens. Shared by every page under
 * /settings/ via the route-group layout.
 */
export function SettingsRail({ basePath }: { basePath: string }) {
	const pathname = usePathname();
	const isActive = (segment: string) =>
		pathname.startsWith(`${basePath}/${segment}`);

	return (
		<>
			{/* Desktop: narrow rail */}
			<nav
				aria-label="Settings"
				className="hidden flex-col gap-5 md:flex md:sticky md:top-24 md:self-start"
			>
				{GROUPS.map((group) => (
					<div key={group.label} className="flex flex-col gap-0.5">
						<span className="mb-1 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
							{group.label}
						</span>
						{group.items.map((item) => {
							const active = isActive(item.segment);
							return (
								<Link
									key={item.segment}
									href={`${basePath}/${item.segment}` as Route}
									aria-current={active ? "page" : undefined}
									className={cn(
										"rounded-lg px-3 py-1.5 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
										active
											? "bg-muted font-medium text-foreground"
											: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
									)}
								>
									{item.label}
								</Link>
							);
						})}
					</div>
				))}
			</nav>
			{/* Mobile: horizontal scroll strip */}
			<nav
				aria-label="Settings"
				className="flex gap-1 overflow-x-auto pb-1 md:hidden"
			>
				{GROUPS.flatMap((g) => g.items).map((item) => {
					const active = isActive(item.segment);
					return (
						<Link
							key={item.segment}
							href={`${basePath}/${item.segment}` as Route}
							aria-current={active ? "page" : undefined}
							className={cn(
								"whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
								active
									? "bg-muted font-medium text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{item.label}
						</Link>
					);
				})}
			</nav>
		</>
	);
}
