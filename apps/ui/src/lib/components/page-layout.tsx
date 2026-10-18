import * as React from "react";

import { cn } from "@/lib/utils";

import { SquircleSurface } from "./squircle";

/** Page title + optional muted description on the left, actions on the right. */
export function PageHeader({
	title,
	description,
	actions,
	className,
}: {
	title: React.ReactNode;
	description?: React.ReactNode;
	actions?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between",
				className,
			)}
		>
			<div className="min-w-0">
				<h1 className="text-[28px] font-normal leading-9 text-heading">
					{title}
				</h1>
				{description ? (
					<p className="mt-1 text-sm text-muted-foreground">{description}</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex shrink-0 items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}

/** Section heading + optional muted description above a single Surface. */
export function Section({
	title,
	description,
	action,
	children,
	className,
	surface = true,
}: {
	title: React.ReactNode;
	description?: React.ReactNode;
	action?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	/** Set false when the content already provides its own surface(s). */
	surface?: boolean;
}) {
	return (
		<section className={cn("min-w-0", className)}>
			<div className="mb-3 flex items-baseline justify-between gap-3">
				<div className="min-w-0">
					<h2 className="text-base font-medium text-heading">{title}</h2>
					{description ? (
						<p className="mt-0.5 text-sm text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				{action}
			</div>
			{surface ? <SquircleSurface>{children}</SquircleSurface> : children}
		</section>
	);
}

/** One surface split into stat cells — stacks 2×2 on mobile. */
export function StatStrip({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<SquircleSurface
			className={cn(
				"grid grid-cols-2 divide-y divide-divider sm:grid-cols-4 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] sm:divide-x sm:divide-y-0",
				className,
			)}
		>
			{children}
		</SquircleSurface>
	);
}

export function StatCell({
	label,
	value,
	sub,
	isLoading,
	className,
}: {
	label: React.ReactNode;
	value: React.ReactNode;
	sub?: React.ReactNode;
	isLoading?: boolean;
	className?: string;
}) {
	return (
		<div className={cn("min-w-0 px-5 py-4", className)}>
			<p className="truncate text-sm text-muted-foreground">{label}</p>
			{isLoading ? (
				<div className="mt-1.5 h-7 w-20 animate-pulse rounded bg-muted" />
			) : (
				<p className="mt-1 truncate text-[28px] font-normal leading-9 text-heading tabular-nums">
					{value}
				</p>
			)}
			{isLoading ? (
				<div className="mt-1 h-3 w-24 animate-pulse rounded bg-muted" />
			) : sub ? (
				<div className="mt-0.5 truncate text-xs text-muted-foreground">
					{sub}
				</div>
			) : null}
		</div>
	);
}

/** Icon tile + one-line title + hint + one action. */
export function EmptyState({
	icon,
	title,
	hint,
	action,
	className,
}: {
	icon?: React.ReactNode;
	title: React.ReactNode;
	hint?: React.ReactNode;
	action?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center px-6 py-12 text-center",
				className,
			)}
		>
			{icon ? (
				<div className="mb-4 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand [&_svg]:size-6">
					{icon}
				</div>
			) : null}
			<p className="text-base font-medium text-heading">{title}</p>
			{hint ? (
				<p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
			) : null}
			{action ? <div className="mt-4">{action}</div> : null}
		</div>
	);
}

/** Two-column settings row: label+help left (1/3), control right (2/3). */
export function SettingsRow({
	label,
	help,
	children,
	className,
}: {
	label: React.ReactNode;
	help?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"grid gap-2 border-b border-divider px-5 py-5 last:border-b-0 sm:grid-cols-3 sm:gap-6",
				className,
			)}
		>
			<div className="min-w-0">
				<p className="text-sm font-medium">{label}</p>
				{help ? (
					<p className="mt-0.5 text-sm text-muted-foreground">{help}</p>
				) : null}
			</div>
			<div className="min-w-0 sm:col-span-2">{children}</div>
		</div>
	);
}
