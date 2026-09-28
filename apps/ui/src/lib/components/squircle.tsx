"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";

import type { Route } from "next";

/**
 * Continuous-curvature (squircle) surface. The shape technique — oversized
 * border-radius bent by `corner-shape: squircle` plus a `shape()` clip-path
 * tuned by --card-clip-radius/--card-clip-handle, with the plain-radius
 * fallback in globals.css — follows the pattern used by Open Analytics
 * (github.com/OpenLabs-so/openanalytics, AGPL-3.0; this codebase outside
 * ee/ is AGPLv3), reimplemented here without its base-ui dependency.
 *
 * Tune corners through --card-clip-radius/--card-clip-handle overrides in
 * className; never edit the formula in globals.css.
 */
export function SquircleSurface({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="squircle-surface"
			className={cn(
				"relative flex min-w-0 flex-col bg-card text-card-foreground not-dark:bg-clip-padding",
				// Oversized radius that corner-shape bends into a squircle; the
				// @supports fallback in globals.css replaces it with a plain
				// radius on engines without corner-shape.
				"rounded-[26px] [--card-clip-radius:14px] [--card-clip-handle:2.25px] sm:rounded-[40px] sm:[--card-clip-radius:18px] sm:[--card-clip-handle:3px]",
				className,
			)}
			{...props}
		/>
	);
}

/**
 * Recessed inner panel that lives inside a squircle frame — the layered
 * surface that gives the card its two-tone depth.
 */
export function SquirclePanel({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<SquircleSurface
			data-slot="squircle-panel"
			className={cn(
				"grow overflow-hidden border border-border bg-panel shadow-sm",
				"rounded-[22px] [--card-clip-radius:12px] [--card-clip-handle:2.25px] sm:rounded-[34px] sm:[--card-clip-radius:15px]",
				className,
			)}
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
	/** Extra classes for the recessed panel. */
	panelClassName?: string;
	children: React.ReactNode;
}

/**
 * The standard dashboard card: white squircle frame with a title strip on
 * top and a recessed squircle panel holding the content.
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
		<SquircleSurface
			className={cn("border border-border p-1 shadow-sm", className)}
		>
			<div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
				<div className="ml-1 flex min-w-0 items-center gap-2">
					<h2 className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground/80 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
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
