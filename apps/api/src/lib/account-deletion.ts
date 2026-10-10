import { Decimal } from "decimal.js";

import { getDodo } from "@/billing/dodo.js";

import { db, eq, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

/**
 * Credit balances at or above this are worth warning about before the account
 * is deleted and the balance is forfeited. Dust below it isn't worth a scary
 * dialog.
 */
export const CREDIT_FORFEIT_WARNING_THRESHOLD = new Decimal("1");

/**
 * Every Stripe subscription an organization can hold: the dashboard
 * Pro/Enterprise plan, the DevPass (dev plan) subscription, and the Chat plan
 * subscription. They live in three separate columns, so any teardown path that
 * only looks at one of them silently leaves the others billing.
 */
export interface OrganizationSubscriptionRefs {
	stripeSubscriptionId: string | null;
	devPlanStripeSubscriptionId: string | null;
	chatPlanStripeSubscriptionId: string | null;
}

export function getOrganizationSubscriptionIds(
	org: OrganizationSubscriptionRefs,
): string[] {
	return [
		org.stripeSubscriptionId,
		org.devPlanStripeSubscriptionId,
		org.chatPlanStripeSubscriptionId,
	].filter((id): id is string => Boolean(id));
}

/**
 * Cancels the org's Dodo auto top-up mandate, if it has one. Stripe-era
 * subscription ids are cleared locally only — those subscriptions can no
 * longer be cancelled through Stripe, and any still open there were already
 * terminal. Historical Stripe subscription ids therefore no longer abort a
 * teardown; a Dodo failure is logged and ignored (best effort — the mandate
 * only gates an opt-in charge path, never recurring billing on its own).
 */
export async function cancelOrganizationSubscriptions(org: {
	dodoAutoTopUpSubscriptionId?: string | null;
}): Promise<string[]> {
	if (!org.dodoAutoTopUpSubscriptionId) {
		return [];
	}
	const subscriptionId = org.dodoAutoTopUpSubscriptionId;
	try {
		await getDodo().subscriptions.update(subscriptionId, {
			status: "cancelled",
		});
	} catch (error) {
		logger.warn(
			`Dodo mandate ${subscriptionId} could not be cancelled during teardown: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return [subscriptionId];
}

/**
 * Clears every subscription-backed entitlement after all Stripe subscriptions
 * have been cancelled. Historical transactions remain intact for accounting.
 */
export function getCancelledOrganizationPlanState(now = new Date()) {
	return {
		plan: "free" as const,
		stripeSubscriptionId: null,
		subscriptionCancelled: true,
		planExpiresAt: now,
		isTrialActive: false,
		autoTopUpEnabled: false,
		devPlan: "none" as const,
		devPlanStripeSubscriptionId: null,
		devPlanCancelled: true,
		devPlanExpiresAt: now,
		devPlanPendingTier: null,
		chatPlan: "none" as const,
		chatPlanStripeSubscriptionId: null,
		chatPlanCancelled: true,
		chatPlanExpiresAt: now,
	};
}

export interface SoleMemberOrganization {
	id: string;
	name: string;
	kind: "default" | "chat" | "devpass";
	plan: "free" | "pro" | "enterprise";
	devPlan: "none" | "lite" | "pro" | "max";
	chatPlan: "none" | "starter" | "plus" | "pro";
	credits: string;
	/** Balance is large enough that losing it deserves an explicit warning. */
	hasForfeitableCredits: boolean;
	subscriptions: OrganizationSubscriptionRefs;
	subscriptionIds: string[];
	dodoAutoTopUpSubscriptionId: string | null;
}

/**
 * Returns the organizations the user is the *only* remaining member of.
 *
 * Deleting a user only cascades away their `user_organization` row — the
 * organization itself survives with no members and no way to reach it from any
 * UI, so anything still attached to it (most importantly a live Stripe
 * subscription) keeps charging the card forever. These are the orgs that have
 * to be torn down along with the account. DevPass and Chat orgs are personal by
 * construction, so they always land here; a shared team org only does when the
 * user is its last member.
 */
export async function findSoleMemberOrganizations(
	userId: string,
): Promise<SoleMemberOrganization[]> {
	const memberships = await db.query.userOrganization.findMany({
		where: { userId: { eq: userId } },
		columns: { organizationId: true },
	});

	const orgIds = memberships.map((m) => m.organizationId);
	if (orgIds.length === 0) {
		return [];
	}

	const allMembers = await db.query.userOrganization.findMany({
		where: { organizationId: { in: orgIds } },
		columns: { organizationId: true, userId: true },
	});

	const orgIdsWithOtherMembers = new Set(
		allMembers
			.filter((member) => member.userId !== userId)
			.map((member) => member.organizationId),
	);

	const soleOrgIds = orgIds.filter((id) => !orgIdsWithOtherMembers.has(id));
	if (soleOrgIds.length === 0) {
		return [];
	}

	// Teardown cancels subscriptions org by org and stops at the first Stripe
	// failure, so the order has to be reproducible: without it, which orgs were
	// already cancelled before an outage depends on the row order Postgres
	// happens to return.
	const organizations = await db.query.organization.findMany({
		where: { id: { in: soleOrgIds } },
		orderBy: { createdAt: "asc", id: "asc" },
	});

	return organizations
		.filter((org) => org.status !== "deleted")
		.map((org) => {
			const subscriptions: OrganizationSubscriptionRefs = {
				stripeSubscriptionId: org.stripeSubscriptionId,
				devPlanStripeSubscriptionId: org.devPlanStripeSubscriptionId,
				chatPlanStripeSubscriptionId: org.chatPlanStripeSubscriptionId,
			};

			return {
				id: org.id,
				name: org.name,
				kind: org.kind,
				plan: org.plan,
				devPlan: org.devPlan,
				chatPlan: org.chatPlan,
				credits: org.credits,
				hasForfeitableCredits: new Decimal(org.credits).gte(
					CREDIT_FORFEIT_WARNING_THRESHOLD,
				),
				subscriptions,
				subscriptionIds: getOrganizationSubscriptionIds(subscriptions),
				dodoAutoTopUpSubscriptionId: org.dodoAutoTopUpSubscriptionId,
			};
		});
}

/**
 * Tears down the organizations a user is the last member of, as part of
 * deleting their account: cancels every Stripe subscription those orgs hold,
 * then marks them deleted with all plan state cleared.
 *
 * Stripe is called before any local write so a Stripe failure aborts the whole
 * account deletion — leaving the account intact and retryable is strictly
 * better than deleting it while a subscription keeps charging the card.
 *
 * The subscription id columns are nulled once cancelled, which also makes the
 * trailing `customer.subscription.deleted` webhook a no-op (every handler gates
 * on the stored id) — the terminal state is already applied here.
 */
export async function tearDownSoleMemberOrganizations(
	userId: string,
): Promise<SoleMemberOrganization[]> {
	const organizations = await findSoleMemberOrganizations(userId);
	if (organizations.length === 0) {
		return [];
	}

	const now = new Date();

	for (const org of organizations) {
		const cancelled = await cancelOrganizationSubscriptions(org);

		if (cancelled.length > 0) {
			logger.info(
				`Cancelled Stripe subscriptions for organization ${org.id} on account deletion of user ${userId}: ${cancelled.join(", ")}`,
			);
		}

		await db
			.update(tables.organization)
			.set({
				status: "deleted",
				...getCancelledOrganizationPlanState(now),
			})
			.where(eq(tables.organization.id, org.id));
	}

	return organizations;
}
