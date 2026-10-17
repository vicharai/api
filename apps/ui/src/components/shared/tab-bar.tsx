"use client";

import { motion } from "motion/react";
import { useId } from "react";

import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 550, damping: 40 } as const;

export interface TabBarItem {
	value: string;
	label: string;
}

/**
 * Sibling-view switcher: one recessed pill container, one white pill that
 * springs between the active tab. Used for peer views inside a page (the
 * analytics hub, settings rail), not for hierarchical navigation.
 */
export function TabBar({
	tabs,
	value,
	onChange,
	className,
}: {
	tabs: TabBarItem[];
	value: string;
	onChange: (value: string) => void;
	className?: string;
}) {
	const layoutId = useId();

	return (
		<div
			role="tablist"
			className={cn(
				"inline-flex max-w-full items-center gap-2 overflow-x-auto border-b border-divider",
				className,
			)}
		>
			{tabs.map((tab) => {
				const active = tab.value === value;
				return (
					<button
						key={tab.value}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(tab.value)}
						className={cn(
							"relative flex h-12 shrink-0 cursor-pointer items-center whitespace-nowrap px-3 text-sm font-medium outline-none transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring",
							active
								? "text-brand"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{active && (
							<motion.span
								layoutId={layoutId}
								transition={SPRING}
								className="absolute inset-x-1 bottom-0 h-[3px] rounded-t-full bg-brand"
								aria-hidden="true"
							/>
						)}
						<span className="relative z-10">{tab.label}</span>
					</button>
				);
			})}
		</div>
	);
}
