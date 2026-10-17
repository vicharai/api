"use client";

import { formatDistanceToNow } from "date-fns";
import {
	Ban,
	CircleDollarSign,
	CreditCard,
	ShieldAlert,
	UserPlus,
	Wrench,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { cn, formatDateTime, formatUsd } from "@/lib/utils";

import type { ActivityEvent, ActivityType } from "@/lib/api/pending-paths-p2";
import type { Route } from "next";

export const ACTIVITY_TYPES: {
	value: ActivityType;
	label: string;
	icon: LucideIcon;
	className: string;
}[] = [
	{
		value: "signup",
		label: "Signups",
		icon: UserPlus,
		className: "bg-brand-soft text-brand",
	},
	{
		value: "payment",
		label: "Payments",
		icon: CreditCard,
		className: "bg-success/15 text-success",
	},
	{
		value: "credit_change",
		label: "Credit changes",
		icon: CircleDollarSign,
		className: "bg-warning/15 text-warning",
	},
	{
		value: "block",
		label: "Blocks",
		icon: Ban,
		className: "bg-destructive/15 text-destructive",
	},
	{
		value: "flag",
		label: "Flags",
		icon: ShieldAlert,
		className: "bg-destructive/15 text-destructive",
	},
	{
		value: "admin_action",
		label: "Admin actions",
		icon: Wrench,
		className: "bg-muted text-muted-foreground",
	},
];

export function ActivityList({
	events,
	compact = false,
}: {
	events: ActivityEvent[];
	compact?: boolean;
}) {
	return (
		<ul className="divide-y">
			{events.map((event) => {
				const meta =
					ACTIVITY_TYPES.find((t) => t.value === event.type) ??
					ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];
				const Icon = meta.icon;
				return (
					<li key={event.id} className="flex items-start gap-3 py-2.5">
						<span
							className={cn(
								"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
								meta.className,
							)}
						>
							<Icon className="size-3.5" />
						</span>
						<div className="min-w-0 flex-1 space-y-0.5 text-sm">
							<div className="flex flex-wrap items-baseline justify-between gap-x-2">
								<span className="font-medium">{event.title}</span>
								<time
									className="shrink-0 text-xs text-muted-foreground"
									dateTime={event.createdAt}
									title={formatDateTime(event.createdAt)}
								>
									{formatDistanceToNow(new Date(event.createdAt), {
										addSuffix: true,
									})}
								</time>
							</div>
							{event.detail && !compact ? (
								<p className="text-muted-foreground break-words">
									{event.detail}
								</p>
							) : null}
							<div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
								{event.amount !== null ? (
									<span className="tabular-nums text-foreground">
										{formatUsd(event.amount)}
									</span>
								) : null}
								{event.organizationId ? (
									<Link
										href={`/organizations/${event.organizationId}` as Route}
										className="hover:underline"
									>
										Organization
									</Link>
								) : null}
								{event.userId ? (
									<Link
										href={`/users/${event.userId}` as Route}
										className="hover:underline"
									>
										User
									</Link>
								) : null}
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
