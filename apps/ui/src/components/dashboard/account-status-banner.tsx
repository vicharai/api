"use client";

import { AlertTriangle, CalendarClock, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/lib/components/alert";
import { useDashboardContext } from "@/lib/dashboard-context";
import { cn } from "@/lib/utils";

import { formatPlanTermLabel, getOrganizationTerm } from "@llmgateway/shared";
import { isOrganizationAdmin } from "@llmgateway/shared/organization-roles";

import type { Route } from "next";
import type { ReactNode } from "react";

/** Days before a booked term ends that the dashboard starts warning. */
const TERM_WARNING_DAYS = 14;

const TONES = {
	destructive:
		"border-destructive/40 bg-destructive-soft [&>svg]:text-destructive",
	warning: "border-warning/40 bg-warning-soft [&>svg]:text-warning",
} as const;

function StatusBanner({
	tone,
	icon,
	title,
	children,
}: {
	tone: keyof typeof TONES;
	icon: ReactNode;
	title: string;
	children: ReactNode;
}) {
	return (
		<Alert
			role="status"
			className={cn(
				"rounded-none border-x-0 border-t-0 px-4 text-foreground sm:px-8",
				TONES[tone],
			)}
		>
			{icon}
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription className="text-current/90">
				<p>{children}</p>
			</AlertDescription>
		</Alert>
	);
}

function SupportLink({ orgId }: { orgId: string }) {
	return (
		<Link
			href={`/dashboard/${orgId}/support` as Route}
			className="whitespace-nowrap font-medium text-brand underline-offset-4 hover:underline"
		>
			Contact support
		</Link>
	);
}

function formatDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		timeZone: "UTC",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

/** Proactive notices about the selected workspace's account state. */
export function AccountStatusBanner() {
	const { selectedOrganization: org } = useDashboardContext();
	if (!org) {
		return null;
	}

	if (org.accountUnderReview) {
		return (
			<StatusBanner
				tone="destructive"
				icon={<ShieldAlert />}
				title="Your account is under review"
			>
				API requests and top-ups are paused while we review this workspace.{" "}
				<SupportLink orgId={org.id} /> to restore access.
			</StatusBanner>
		);
	}

	if (org.status === "inactive") {
		return (
			<StatusBanner
				tone="warning"
				icon={<AlertTriangle />}
				title="This workspace is inactive"
			>
				{org.blockReason ? `${org.blockReason} ` : ""}
				<SupportLink orgId={org.id} /> if this is unexpected.
			</StatusBanner>
		);
	}

	const term = isOrganizationAdmin(org.role) ? getOrganizationTerm(org) : null;
	if (term && term.term.daysLeft <= TERM_WARNING_DAYS) {
		const expired = term.term.daysLeft < 0;
		const kind = term.kind === "trial" ? "trial" : "plan term";
		return (
			<StatusBanner
				tone={
					expired || term.term.status === "critical" ? "destructive" : "warning"
				}
				icon={<CalendarClock />}
				title={expired ? `Your ${kind} has ended` : `Your ${kind} ends soon`}
			>
				{expired ? "It ended" : "It ends"} on {formatDate(term.term.expiresAt)}{" "}
				({formatPlanTermLabel(term.term).toLowerCase()}).{" "}
				<SupportLink orgId={org.id} /> to renew.
			</StatusBanner>
		);
	}

	return null;
}
