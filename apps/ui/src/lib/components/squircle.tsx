"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";

import type { Route } from "next";

/**
 * The single surface level used throughout the app: one 1px border, 12px
 * radius, card background, soft navy-tinted shadow. Nested surfaces are an
 * anti-pattern — group inside with dividers and spacing instead.
 */
export function SquircleSurface({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="squircle-surface"
			className={cn(
				"relative flex min-w-0 flex-col rounded-xl border border-border bg-card text-card-foreground shadow-xs",
				className,
			)}
			{...props}
		/>
	);
}

/**
 * A padded content region — no border or background of its own. Kept under
 * the historical "SquirclePanel" name for API compatibility.
 */
export function SquirclePanel({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="squircle-panel"
			className={cn("min-w-0 p-4", className)}
			{...props}
		/>
	);
}

interface SquircleCardProps {
	/** Header label shown in the frame's top strip. */
	title: React.ReactNode;
	/** Optional muted icon before the title. */
	icon?: React.ReactNode;
	/** Rides beside the title — qualifier chips, status dots. */
	titleAside?: React.ReactNode;
	/** Extra actions rendered at the right of the header strip. */
	headerAction?: React.ReactNode;
	/** Where the header's "See all" pill links. Mutually exclusive with onSeeAll. */
	seeAllHref?: Route;
	/** In-place "See all" — renders a button instead of a link. */
	onSeeAll?: () => void;
	/** No "See all" at all. */
	hideSeeAll?: boolean;
	className?: string;
	/** Extra classes for the content region. */
	panelClassName?: string;
	children: React.ReactNode;
}

/**
 * Section card: a Surface with a heading row on top and the content below a
 * hairline divider.
 */
export function SquircleCard({
	title,
	icon,
	titleAside,
	headerAction,
	seeAllHref,
	onSeeAll,
	hideSeeAll = false,
	className,
	panelClassName,
	children,
}: SquircleCardProps) {
	const seeAllClassName =
		"group/seeall flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";
	const seeAllBody = (
		<>
			See all
			<ArrowRight
				aria-hidden="true"
				className="size-3.5 transition-transform duration-200 group-hover/seeall:translate-x-0.5"
			/>
		</>
	);

	return (
		<SquircleSurface className={className}>
			<div className="flex items-center justify-between gap-2 rounded-t-[inherit] border-b border-border bg-card-header-gradient px-4 py-3">
				<div className="flex min-w-0 items-center gap-2">
					<h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
						{icon}
						{title}
					</h2>
					{titleAside}
				</div>
				{headerAction ??
					(hideSeeAll ? null : onSeeAll !== undefined ? (
						<button
							type="button"
							onClick={onSeeAll}
							className={cn(seeAllClassName, "cursor-pointer")}
						>
							{seeAllBody}
						</button>
					) : (
						<Link
							href={seeAllHref ?? ("#" as Route)}
							className={seeAllClassName}
						>
							{seeAllBody}
						</Link>
					))}
			</div>
			<SquirclePanel className={panelClassName}>{children}</SquirclePanel>
		</SquircleSurface>
	);
}
