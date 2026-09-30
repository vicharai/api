"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "posthog-js/react";

import { EnterprisePlanTerm } from "@/components/billing/enterprise-plan-term";
import { Badge } from "@/lib/components/badge";
import { Button } from "@/lib/components/button";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { useToast } from "@/lib/components/use-toast";
import { useDashboardState } from "@/lib/dashboard-state";
import { useApi } from "@/lib/fetch-client";

import { getOrganizationTerm } from "@llmgateway/shared";
import { useRerenderAt } from "@llmgateway/shared/components";

const ENTERPRISE_FEATURES = [
	"Dedicated support & SLA",
	"Provider compliance policies",
	"SSO & audit logs",
	"Extended data retention",
	"Custom models & guardrails",
	"Volume pricing",
];

export function PlanManagement() {
	const { selectedOrganization } = useDashboardState();
	const organizationId = selectedOrganization?.id;
	const isOwner = selectedOrganization?.role === "owner";
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const api = useApi();
	const posthog = usePostHog();

	const { data: subscriptionStatus } = api.useQuery(
		"get",
		"/subscriptions/status",
		{ params: { query: { organizationId } } },
		{ enabled: Boolean(organizationId) },
	);

	// Resolved above the early returns so the boundary timer is an unconditional
	// hook call. `renewalProcessing` below is clock-derived and the org/status
	// queries keep returning the same row until the paid invoice advances it, so
	// nothing else would re-render the card when the renewal moment passes.
	const planExpiresAt = selectedOrganization?.planExpiresAt
		? new Date(selectedOrganization.planExpiresAt)
		: null;
	useRerenderAt(planExpiresAt);

	// Keep cancel/resume mutations for existing Pro subscribers (backward compatibility)
	const cancelSubscriptionMutation = api.useMutation(
		"post",
		"/subscriptions/cancel-pro-subscription",
	);

	const resumeSubscriptionMutation = api.useMutation(
		"post",
		"/subscriptions/resume-pro-subscription",
	);

	const handleCancelSubscription = async () => {
		const confirmed = window.confirm(
			"Are you sure you want to cancel your legacy Pro subscription? All features are now available on the Free plan.",
		);

		if (!confirmed) {
			return;
		}

		posthog.capture("subscription_cancel_initiated");

		await cancelSubscriptionMutation.mutateAsync({
			params: { query: { organizationId } },
		});
		await queryClient.invalidateQueries({
			queryKey: api.queryOptions("get", "/subscriptions/status", {
				params: { query: { organizationId } },
			}).queryKey,
		});
		toast({
			title: "Subscription Canceled",
			description:
				"Your Pro subscription has been canceled. All features remain available on the Free plan.",
		});
	};

	const handleResumeSubscription = async () => {
		const confirmed = window.confirm(
			"Are you sure you want to resume your legacy Pro subscription?",
		);

		if (!confirmed) {
			return;
		}

		posthog.capture("subscription_resume_initiated");

		await resumeSubscriptionMutation.mutateAsync({
			params: { query: { organizationId } },
		});
		await queryClient.invalidateQueries({
			queryKey: api.queryOptions("get", "/subscriptions/status", {
				params: { query: { organizationId } },
			}).queryKey,
		});
		toast({
			title: "Subscription Resumed",
			description: "Your Pro subscription has been resumed.",
		});
	};

	if (!selectedOrganization) {
		return (
			<SquircleSurface className="border border-border p-1 shadow-sm">
				<div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
					<h2 className="ml-1 text-sm font-medium text-foreground/80">
						Plan & Billing
					</h2>
				</div>
				<SquirclePanel className="p-4 sm:p-5">
					<p className="text-sm text-muted-foreground">
						Loading plan information...
					</p>
				</SquirclePanel>
			</SquircleSurface>
		);
	}

	// Legacy Pro subscribers may still exist
	const isLegacyPro = selectedOrganization.plan === "pro";
	const paymentPastDue =
		subscriptionStatus?.subscriptionPaymentStatus === "past_due";
	const renewalProcessing =
		isLegacyPro &&
		!paymentPastDue &&
		!subscriptionStatus?.subscriptionCancelled &&
		planExpiresAt !== null &&
		planExpiresAt <= new Date();

	if (selectedOrganization.plan === "enterprise") {
		const resolved = getOrganizationTerm({
			isTrialActive: selectedOrganization.isTrialActive,
			trialStartDate: selectedOrganization.trialStartDate,
			trialEndDate: selectedOrganization.trialEndDate,
			planStartedAt: selectedOrganization.planStartedAt,
			planExpiresAt: selectedOrganization.planExpiresAt,
		});
		const trial = resolved?.kind === "trial";

		return (
			<SquircleSurface className="border border-border p-1 shadow-sm">
				<div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
					<div className="ml-1 flex min-w-0 items-center gap-2">
						<h2 className="text-sm font-medium text-foreground/80">
							{trial ? "Enterprise trial" : "Enterprise agreement"}
						</h2>
						<Badge variant={trial ? "secondary" : "default"}>
							{trial ? "Trial" : "Enterprise"}
						</Badge>
					</div>
				</div>
				<SquirclePanel className="space-y-6 p-4 sm:p-5">
					<EnterprisePlanTerm
						term={resolved?.term ?? null}
						kind={resolved?.kind ?? "contract"}
					/>

					<div className="space-y-3 rounded-xl border border-border bg-card p-4">
						<h4 className="font-medium">
							{trial
								? "Included during your trial"
								: "Included with Enterprise"}
						</h4>
						<div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
							<div className="space-y-2">
								{ENTERPRISE_FEATURES.slice(0, 3).map((feature) => (
									<div key={feature} className="flex items-center gap-2">
										<div className="h-2 w-2 rounded-full bg-emerald-500" />
										<span>{feature}</span>
									</div>
								))}
							</div>
							<div className="space-y-2">
								{ENTERPRISE_FEATURES.slice(3).map((feature) => (
									<div key={feature} className="flex items-center gap-2">
										<div className="h-2 w-2 rounded-full bg-emerald-500" />
										<span>{feature}</span>
									</div>
								))}
							</div>
						</div>
					</div>
				</SquirclePanel>
			</SquircleSurface>
		);
	}

	return (
		<SquircleSurface className="border border-border p-1 shadow-sm">
			<div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
				<div className="ml-1 min-w-0">
					<h2 className="text-sm font-medium text-foreground/80">
						Plan & Billing
					</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Manage your billing preferences
					</p>
				</div>
			</div>
			<SquirclePanel className="space-y-6 p-4 sm:p-5">
				{paymentPastDue && (
					<div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
						We could not collect the renewal payment. Update the subscription
						payment method below; the next renewal date appears after payment
						succeeds.
					</div>
				)}
				<div className="flex items-center justify-between">
					<div>
						<div className="flex items-center gap-2">
							<h3 className="text-lg font-medium">Current Plan</h3>
							<Badge variant="default">
								{isLegacyPro ? "Pro (Legacy)" : "Free"}
							</Badge>
							{paymentPastDue && (
								<Badge variant="destructive">Payment failed</Badge>
							)}
							{renewalProcessing && (
								<Badge variant="secondary">Renewal processing</Badge>
							)}
						</div>
						<p className="text-sm text-muted-foreground mt-1">
							All features included
						</p>
						{isLegacyPro && planExpiresAt && (
							<p className="text-sm text-muted-foreground mt-1">
								{paymentPastDue
									? `Payment due ${planExpiresAt.toDateString()}`
									: renewalProcessing
										? `Renewal payment processing since ${planExpiresAt.toDateString()}`
										: subscriptionStatus?.subscriptionCancelled
											? `Expires on ${planExpiresAt.toDateString()}`
											: `Renews on ${planExpiresAt.toDateString()}`}
							</p>
						)}
					</div>
					<div className="text-right">
						<p className="text-2xl font-bold">
							{isLegacyPro
								? subscriptionStatus?.billingCycle === "yearly"
									? "$500"
									: "$50"
								: "$0"}
							<span className="text-sm font-normal text-muted-foreground">
								{isLegacyPro
									? subscriptionStatus?.billingCycle === "yearly"
										? "/year"
										: "/month"
									: "/forever"}
							</span>
						</p>
					</div>
				</div>

				<div className="space-y-3 rounded-xl border border-border bg-card p-4">
					<h4 className="font-medium">Included Features</h4>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 rounded-full bg-emerald-500" />
								<span>Provider API Keys (BYOK)</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 rounded-full bg-emerald-500" />
								<span>30-day data retention</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 rounded-full bg-emerald-500" />
								<span>Team Management</span>
							</div>
						</div>
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 rounded-full bg-emerald-500" />
								<span>Advanced Analytics</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 rounded-full bg-emerald-500" />
								<span>Auto-routing</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 rounded-full bg-emerald-500" />
								<span>Credits & Hybrid Mode</span>
							</div>
						</div>
					</div>
				</div>

				{/* Only show subscription management for legacy Pro subscribers */}
				{isLegacyPro && (
					<div className="flex justify-between border-t border-border pt-4">
						<div className="flex gap-2">
							{!subscriptionStatus?.subscriptionCancelled && (
								<Button
									variant="outline"
									onClick={handleCancelSubscription}
									disabled={!isOwner || cancelSubscriptionMutation.isPending}
								>
									{cancelSubscriptionMutation.isPending
										? "Canceling..."
										: "Cancel Subscription"}
								</Button>
							)}
							{subscriptionStatus?.subscriptionCancelled && (
								<div className="flex items-center gap-2">
									<Badge variant="destructive">Subscription Canceled</Badge>
									<Button
										variant="default"
										onClick={handleResumeSubscription}
										disabled={!isOwner || resumeSubscriptionMutation.isPending}
									>
										{resumeSubscriptionMutation.isPending
											? "Resuming..."
											: "Resume Subscription"}
									</Button>
								</div>
							)}
						</div>
					</div>
				)}
			</SquirclePanel>
		</SquircleSurface>
	);
}
