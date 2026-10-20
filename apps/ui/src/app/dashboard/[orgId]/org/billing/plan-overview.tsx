"use client";

import { Badge } from "@/lib/components/badge";
import { Progress } from "@/lib/components/progress";
import { useDashboardState } from "@/lib/dashboard-state";
import { useApi } from "@/lib/fetch-client";
import { cn } from "@/lib/utils";

import {
	formatPlanTermLabel,
	getOrganizationTerm,
	type PlanTermStatus,
} from "@llmgateway/shared";
import { formatNumber } from "@llmgateway/shared/number-format";

const PLAN_LABELS: Record<string, string> = {
	free: "Pay as you go",
	pro: "Pro",
	enterprise: "Enterprise",
};

const TERM_BADGE: Record<
	PlanTermStatus,
	"secondary" | "outline" | "destructive"
> = {
	active: "secondary",
	expiring: "outline",
	critical: "destructive",
	expired: "destructive",
};

function formatDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		timeZone: "UTC",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function UsageMeter({
	label,
	usage,
}: {
	label: string;
	usage: { used: number; limit: number } | undefined;
}) {
	const percent = usage
		? Math.min(100, Math.round((usage.used / Math.max(usage.limit, 1)) * 100))
		: 0;
	return (
		<div className="min-w-0 space-y-2">
			<div className="flex items-baseline justify-between gap-2 text-sm">
				<span className="text-muted-foreground">{label}</span>
				{usage ? (
					<span className="tabular-nums">
						{formatNumber(usage.used)}
						<span className="text-muted-foreground">
							{" "}
							/ {formatNumber(usage.limit)}
						</span>
					</span>
				) : (
					<span className="h-4 w-12 animate-pulse rounded bg-muted" />
				)}
			</div>
			<Progress
				value={percent}
				aria-label={`${label} used`}
				className={cn(percent >= 100 && "[&>div]:bg-destructive")}
			/>
		</div>
	);
}

export function PlanOverview() {
	const { selectedOrganization: org } = useDashboardState();
	const api = useApi();
	const { data } = api.useQuery(
		"get",
		"/orgs/{id}/plan-usage",
		{ params: { path: { id: org?.id ?? "" } } },
		{ enabled: !!org?.id },
	);

	if (!org) {
		return null;
	}

	const term = getOrganizationTerm(org);

	return (
		<div className="space-y-5 px-4 py-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-xl font-normal text-heading">
						{PLAN_LABELS[org.plan] ?? org.plan}
						{term?.kind === "trial" && (
							<span className="text-muted-foreground"> trial</span>
						)}
					</p>
					{term ? (
						<p className="mt-0.5 text-sm text-muted-foreground">
							{term.term.startedAt
								? `${formatDate(term.term.startedAt)} – `
								: "Ends "}
							{formatDate(term.term.expiresAt)}
						</p>
					) : (
						<p className="mt-0.5 text-sm text-muted-foreground">
							Billed from your prepaid credit balance.
						</p>
					)}
				</div>
				{term && (
					<Badge variant={TERM_BADGE[term.term.status]}>
						{formatPlanTermLabel(term.term)}
					</Badge>
				)}
			</div>
			{term && term.term.elapsedFraction !== null && (
				<Progress
					value={Math.round(term.term.elapsedFraction * 100)}
					aria-label="Term elapsed"
					className="h-1.5"
				/>
			)}
			<div className="grid gap-5 sm:grid-cols-3">
				<UsageMeter label="Team seats" usage={data?.seats} />
				<UsageMeter label="API keys" usage={data?.apiKeys} />
				<UsageMeter label="Projects" usage={data?.projects} />
			</div>
		</div>
	);
}
