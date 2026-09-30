"use client";

import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

/**
 * Dark high-contrast chart tooltip — the same surface in both themes, matching
 * the usage overview chart. Recharts owns tooltip positioning, so each chart
 * passes these pieces to its `content` render prop.
 */
export function ChartTooltipShell({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"min-w-56 rounded-xl bg-[#1b1e28] p-3 text-white shadow-[0_1px_1px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-white/10",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function ChartTooltipHeading({ children }: { children: ReactNode }) {
	return <p className="text-xs font-medium text-white/60">{children}</p>;
}

export function ChartTooltipRow({
	color,
	label,
	value,
}: {
	color?: string;
	label: ReactNode;
	value: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-6 text-sm">
			<span className="flex min-w-0 items-center gap-1.5 text-white/60">
				{color ? (
					<span
						className="h-2 w-2 shrink-0 rounded-full"
						style={{ backgroundColor: color }}
					/>
				) : null}
				<span className="truncate">{label}</span>
			</span>
			<span className="shrink-0 font-medium tabular-nums">{value}</span>
		</div>
	);
}
