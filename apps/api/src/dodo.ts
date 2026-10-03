import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import DodoPayments from "dodopayments";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { and, db, eq, isNull, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import {
	DEV_PLAN_PRICES,
	getDevPlanCreditsLimit,
	type DevPlanCycle,
	type DevPlanTier,
} from "@llmgateway/shared";

import { posthog } from "./posthog.js";
import {
	notifyDevPlanCancelled,
	notifyDevPlanRenewed,
	notifyDevPlanSubscribed,
} from "./utils/discord.js";
import {
	generateSubscriptionCancelledEmailHtml,
	sendTransactionalEmail,
} from "./utils/email.js";

import type { ServerTypes } from "./vars.js";
import type { Organization } from "@llmgateway/db";

// Dodo Payments is the DevPass billing rail. Subscribing goes through a hosted
// checkout session; everything after that is webhook-driven — there is no
// setup-then-finalize dance like the Stripe path because Dodo charges at
// checkout and emits `subscription.active` when the mandate is live.

let dodoClient: DodoPayments | null = null;

export function isDodoBillingEnabled(): boolean {
	return !!process.env.DODO_PAYMENTS_API_KEY;
}

export function getDodo(): DodoPayments {
	if (!dodoClient) {
		const bearerToken = process.env.DODO_PAYMENTS_API_KEY;
		if (!bearerToken) {
			throw new Error("DODO_PAYMENTS_API_KEY is not set");
		}
		dodoClient = new DodoPayments({
			bearerToken,
			environment:
				process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
					? "live_mode"
					: "test_mode",
		});
	}
	return dodoClient;
}

const DODO_DEV_PLAN_PRODUCT_ENV_KEYS: Record<
	DevPlanCycle,
	Record<DevPlanTier, string>
> = {
	monthly: {
		lite: "DODO_DEV_PLAN_LITE_PRODUCT_ID",
		pro: "DODO_DEV_PLAN_PRO_PRODUCT_ID",
		max: "DODO_DEV_PLAN_MAX_PRODUCT_ID",
	},
	annual: {
		lite: "DODO_DEV_PLAN_LITE_ANNUAL_PRODUCT_ID",
		pro: "DODO_DEV_PLAN_PRO_ANNUAL_PRODUCT_ID",
		max: "DODO_DEV_PLAN_MAX_ANNUAL_PRODUCT_ID",
	},
};

export function getDodoDevPlanProductId(
	tier: DevPlanTier,
	cycle: DevPlanCycle = "monthly",
): string | undefined {
	return process.env[DODO_DEV_PLAN_PRODUCT_ENV_KEYS[cycle][tier]];
}

function getDevPlanTierFromDodoProductId(
	productId: string,
): { tier: DevPlanTier; cycle: DevPlanCycle } | null {
	for (const cycle of Object.keys(
		DODO_DEV_PLAN_PRODUCT_ENV_KEYS,
	) as DevPlanCycle[]) {
		for (const tier of Object.keys(
			DODO_DEV_PLAN_PRODUCT_ENV_KEYS[cycle],
		) as DevPlanTier[]) {
			if (
				process.env[DODO_DEV_PLAN_PRODUCT_ENV_KEYS[cycle][tier]] === productId
			) {
				return { tier, cycle };
			}
		}
	}
	return null;
}

/**
 * Ensure the org has a Dodo customer. Mirrors ensureStripeCustomer: the row is
 * claimed under a lock so racing requests can't each create a customer.
 */
export async function ensureDodoCustomer(
	organizationId: string,
): Promise<string> {
	const { dodoCustomerId, created, billingEmail } = await db.transaction(
		async (tx) => {
			const [organization] = await tx
				.select()
				.from(tables.organization)
				.where(eq(tables.organization.id, organizationId))
				.for("update")
				.limit(1);

			if (!organization) {
				throw new Error(`Organization not found: ${organizationId}`);
			}

			if (organization.dodoCustomerId) {
				return {
					dodoCustomerId: organization.dodoCustomerId,
					created: false,
					billingEmail: organization.billingEmail,
				};
			}

			const customer = await getDodo().customers.create({
				email: organization.billingEmail,
				name: organization.name ?? undefined,
				metadata: { organizationId },
			});

			await tx
				.update(tables.organization)
				.set({ dodoCustomerId: customer.customer_id })
				.where(eq(tables.organization.id, organizationId));

			return {
				dodoCustomerId: customer.customer_id,
				created: true,
				billingEmail: organization.billingEmail,
			};
		},
	);

	if (!created && billingEmail) {
		try {
			await getDodo().customers.update(dodoCustomerId, {
				email: billingEmail,
			});
		} catch (error) {
			logger.warn("Failed to sync Dodo customer email", {
				dodoCustomerId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return dodoCustomerId;
}

/**
 * Hosted checkout for a dev plan subscription. Returns the URL the user is
 * redirected to; activation happens in the `subscription.active` webhook.
 */
export async function createDodoDevPlanCheckout(params: {
	organizationId: string;
	userEmail: string;
	tier: DevPlanTier;
	cycle: DevPlanCycle;
}): Promise<string> {
	const productId = getDodoDevPlanProductId(params.tier, params.cycle);
	if (!productId) {
		throw new Error(
			`DODO_DEV_PLAN_${params.tier.toUpperCase()}${params.cycle === "annual" ? "_ANNUAL" : ""}_PRODUCT_ID environment variable is not set`,
		);
	}

	const dodoCustomerId = await ensureDodoCustomer(params.organizationId);
	const codeUrl = process.env.CODE_URL ?? "http://localhost:3004";

	const session = await getDodo().checkoutSessions.create({
		product_cart: [{ product_id: productId, quantity: 1 }],
		customer: { customer_id: dodoCustomerId },
		return_url: `${codeUrl}/dashboard?dodo_checkout=success`,
		metadata: {
			organizationId: params.organizationId,
			subscriptionType: "dev_plan",
			devPlan: params.tier,
			devPlanCycle: params.cycle,
			userEmail: params.userEmail,
		},
	});

	if (!session.checkout_url) {
		throw new Error("Dodo did not return a checkout URL");
	}
	return session.checkout_url;
}

/** Schedule cancellation at period end (the Stripe `cancel_at_period_end` analog). */
export async function cancelDodoDevPlanSubscription(
	subscriptionId: string,
): Promise<void> {
	await getDodo().subscriptions.update(subscriptionId, {
		cancel_at_next_billing_date: true,
	});
}

/** Undo a scheduled cancellation. */
export async function resumeDodoDevPlanSubscription(
	subscriptionId: string,
): Promise<void> {
	await getDodo().subscriptions.update(subscriptionId, {
		cancel_at_next_billing_date: false,
	});
}

/**
 * Change the billed tier. Upgrades charge the full new price now
 * (`full_immediately`, matching the Stripe path's no-proration restart);
 * downgrades are scheduled to the next billing date at no charge, matching the
 * deferred-downgrade model.
 */
export async function changeDodoDevPlanTier(params: {
	subscriptionId: string;
	newTier: DevPlanTier;
	cycle: DevPlanCycle;
	effectiveAt: "immediately" | "next_billing_date";
}): Promise<void> {
	const productId = getDodoDevPlanProductId(params.newTier, params.cycle);
	if (!productId) {
		throw new Error(
			`DODO_DEV_PLAN_${params.newTier.toUpperCase()}${params.cycle === "annual" ? "_ANNUAL" : ""}_PRODUCT_ID environment variable is not set`,
		);
	}
	await getDodo().subscriptions.changePlan(params.subscriptionId, {
		product_id: productId,
		quantity: 1,
		effective_at: params.effectiveAt,
		proration_billing_mode:
			params.effectiveAt === "immediately" ? "full_immediately" : "do_not_bill",
		on_payment_failure:
			params.effectiveAt === "immediately" ? "prevent_change" : null,
	});
}

/** Drop a scheduled (next-cycle) plan change by re-pointing it at the current product. */
export async function cancelDodoScheduledTierChange(params: {
	subscriptionId: string;
	currentTier: DevPlanTier;
	cycle: DevPlanCycle;
}): Promise<void> {
	const productId = getDodoDevPlanProductId(params.currentTier, params.cycle);
	if (!productId) {
		throw new Error(
			`DODO_DEV_PLAN_${params.currentTier.toUpperCase()}${params.cycle === "annual" ? "_ANNUAL" : ""}_PRODUCT_ID environment variable is not set`,
		);
	}
	await getDodo().subscriptions.changePlan(params.subscriptionId, {
		product_id: productId,
		quantity: 1,
		effective_at: "next_billing_date",
		proration_billing_mode: "do_not_bill",
		cancel_scheduled_change_plan: true,
	});
}

/**
 * Resolve the devpass org for a webhook payload: session metadata first (set at
 * checkout creation), then the stored dodoCustomerId, then billing email — the
 * last covers the first subscription where the customer id isn't persisted yet.
 */
async function resolveDevPlanOrgFromSubscription(subscription: {
	subscription_id: string;
	metadata?: Record<string, unknown> | null;
	customer?: { customer_id?: string; email?: string | null } | null;
}): Promise<{ organizationId: string; organization: Organization } | null> {
	let organizationId =
		(subscription.metadata?.organizationId as string | undefined) ?? null;

	let organization: Organization | null = null;

	if (!organizationId && subscription.customer?.customer_id) {
		organization =
			(await db.query.organization.findFirst({
				where: { dodoCustomerId: subscription.customer.customer_id },
			})) ?? null;
		if (organization) {
			organizationId = organization.id;
		}
	}

	if (!organizationId && subscription.customer?.email) {
		organization =
			(await db.query.organization.findFirst({
				where: {
					billingEmail: subscription.customer.email,
					kind: "devpass",
				},
			})) ?? null;
		if (organization) {
			organizationId = organization.id;
		}
	}

	if (!organizationId) {
		// Last resort: an org already pointing at this subscription.
		organization =
			(await db.query.organization.findFirst({
				where: { devPlanDodoSubscriptionId: subscription.subscription_id },
			})) ?? null;
		if (organization) {
			organizationId = organization.id;
		}
	}

	if (!organizationId) {
		logger.error("Dodo webhook: could not resolve organization", {
			subscriptionId: subscription.subscription_id,
			customerId: subscription.customer?.customer_id,
		});
		return null;
	}

	organization ??=
		(await db.query.organization.findFirst({
			where: { id: organizationId },
		})) ?? null;

	if (!organization) {
		logger.error(
			`Dodo webhook: organization ${organizationId} not found in database`,
		);
		return null;
	}

	return { organizationId, organization };
}

const webhookRoute = createRoute({
	method: "post",
	path: "/webhook",
	request: {},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						received: z.boolean(),
					}),
				},
			},
			description: "Webhook received successfully",
		},
	},
});

export const dodoRoutes = new OpenAPIHono<ServerTypes>();

dodoRoutes.openapi(webhookRoute, async (c) => {
	const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
	if (!webhookKey) {
		throw new HTTPException(500, {
			message: "DODO_PAYMENTS_WEBHOOK_KEY is not configured",
		});
	}

	const body = await c.req.raw.text();
	const headers: Record<string, string> = {};
	for (const key of ["webhook-id", "webhook-timestamp", "webhook-signature"]) {
		const value = c.req.header(key);
		if (value) {
			headers[key] = value;
		}
	}

	let event: ReturnType<DodoPayments["webhooks"]["unwrap"]>;
	try {
		event = getDodo().webhooks.unwrap(body, { headers, key: webhookKey });
	} catch (error) {
		logger.warn("Ignoring Dodo webhook with invalid signature", {
			message: error instanceof Error ? error.message : String(error),
		});
		throw new HTTPException(400, { message: "Invalid signature" });
	}

	logger.info("Dodo webhook received", { eventType: event.type });

	try {
		switch (event.type) {
			case "subscription.active":
				await handleSubscriptionActive(event.data);
				break;
			case "subscription.renewed":
				await handleSubscriptionRenewed(event.data);
				break;
			case "subscription.plan_changed":
				await handleSubscriptionPlanChanged(event.data);
				break;
			case "subscription.updated":
				await handleSubscriptionUpdated(event.data);
				break;
			case "subscription.on_hold":
			case "subscription.past_due":
				await handleSubscriptionPastDue(event.data);
				break;
			case "subscription.cancelled":
			case "subscription.expired":
			case "subscription.failed":
				await handleSubscriptionEnded(event.data);
				break;
			case "payment.succeeded":
				await handlePaymentSucceeded(event.data);
				break;
			default:
				logger.info(`Ignoring Dodo event type: ${event.type}`);
		}
	} catch (error) {
		logger.error("Dodo webhook error:", error as Error);
		throw new HTTPException(400, {
			message: `Webhook error: ${error instanceof Error ? error.message : "Unknown error"}`,
		});
	}

	return c.json({ received: true });
});

interface DodoSubscriptionPayload {
	subscription_id: string;
	status: string;
	product_id: string;
	next_billing_date?: string | null;
	cancel_at_next_billing_date?: boolean;
	metadata?: Record<string, unknown> | null;
	customer?: { customer_id?: string; email?: string | null } | null;
}

/**
 * `subscription.active` — first payment settled, the mandate is live. Grants
 * the plan exactly once: the claim predicate on the subscription id keeps
 * webhook retries and races with a concurrent activation from double-granting.
 */
async function handleSubscriptionActive(
	data: DodoSubscriptionPayload,
): Promise<void> {
	const resolved = await resolveDevPlanOrgFromSubscription(data);
	if (!resolved) {
		return;
	}
	const { organizationId, organization } = resolved;

	const mapped = getDevPlanTierFromDodoProductId(data.product_id);
	const tier =
		mapped?.tier ??
		(organization.devPlan !== "none" ? organization.devPlan : null);
	const cycle = mapped?.cycle ?? "monthly";
	if (!tier) {
		logger.error(
			`Dodo subscription.active for org ${organizationId} mapped to no tier (product ${data.product_id})`,
		);
		return;
	}

	const creditsLimit = getDevPlanCreditsLimit(tier);

	const claimed = await db
		.update(tables.organization)
		.set({
			devPlan: tier,
			devPlanCreditsLimit: creditsLimit.toString(),
			devPlanCreditsUsed: "0",
			devPlanIncludedResetPassesUsed: 0,
			devPlanBillingCycleStart: new Date(),
			devPlanExpiresAt: data.next_billing_date
				? new Date(data.next_billing_date)
				: null,
			devPlanDodoSubscriptionId: data.subscription_id,
			devPlanCancelled: false,
			devPlanCycle: cycle,
			dodoCustomerId: data.customer?.customer_id ?? organization.dodoCustomerId,
			subscriptionPaymentStatus: "current",
		})
		.where(
			and(
				eq(tables.organization.id, organizationId),
				isNull(tables.organization.devPlanDodoSubscriptionId),
			),
		)
		.returning({ id: tables.organization.id });

	if (claimed.length === 0) {
		logger.info(
			`Dodo subscription ${data.subscription_id} activation skipped for org ${organizationId}: already has a dodo subscription id`,
		);
		return;
	}

	await db.insert(tables.transaction).values({
		organizationId,
		type: "dev_plan_start",
		creditAmount: creditsLimit.toString(),
		currency: "USD",
		status: "completed",
		description: `Dev Plan ${tier.toUpperCase()} started (Dodo)`,
	});

	logger.info(
		`Dev plan ${tier} activated for organization ${organizationId} with ${creditsLimit} credits via Dodo`,
	);

	posthog.capture({
		distinctId: "organization",
		event: "dev_plan_subscribed",
		groups: { organization: organizationId },
		properties: { tier, provider: "dodo" },
	});
	if (organization.billingEmail) {
		await notifyDevPlanSubscribed(
			organization.billingEmail,
			organization.name,
			tier,
			cycle,
			DEV_PLAN_PRICES[tier],
			"USD",
		).catch(() => {});
	}
}

/**
 * `subscription.renewed` — a cycle billed. Resets the monthly usage window and
 * applies a pending tier change, mirroring the Stripe renewal-invoice path.
 */
async function handleSubscriptionRenewed(
	data: DodoSubscriptionPayload,
): Promise<void> {
	const resolved = await resolveDevPlanOrgFromSubscription(data);
	if (!resolved) {
		return;
	}
	const { organizationId, organization } = resolved;

	const mapped = getDevPlanTierFromDodoProductId(data.product_id);
	const effectiveTier =
		mapped?.tier ??
		organization.devPlanPendingTier ??
		(organization.devPlan !== "none" ? organization.devPlan : null);
	if (!effectiveTier) {
		return;
	}
	const remainingPendingTier =
		organization.devPlanPendingTier &&
		organization.devPlanPendingTier !== effectiveTier
			? organization.devPlanPendingTier
			: null;
	const creditsLimit = getDevPlanCreditsLimit(effectiveTier);

	await db
		.update(tables.organization)
		.set({
			devPlan: effectiveTier,
			devPlanPendingTier: remainingPendingTier,
			devPlanCreditsLimit: creditsLimit.toString(),
			devPlanCreditsUsed: "0",
			devPlanPremiumCreditsUsed: "0",
			devPlanPremiumWeekStart: new Date(),
			devPlanIncludedResetPassesUsed: 0,
			devPlanBillingCycleStart: new Date(),
			devPlanExpiresAt: data.next_billing_date
				? new Date(data.next_billing_date)
				: undefined,
			devPlanCancelled: false,
			subscriptionPaymentStatus: "current",
		})
		.where(eq(tables.organization.id, organizationId));

	logger.info(
		`Dev plan ${effectiveTier} renewed for organization ${organizationId} via Dodo, credits reset to 0/${creditsLimit}`,
	);

	if (organization.billingEmail) {
		await notifyDevPlanRenewed(
			organization.billingEmail,
			organization.name,
			effectiveTier,
		).catch(() => {});
	}
}

/**
 * `subscription.plan_changed` — the billed product moved to another tier.
 * Applies the new tier for the current cycle.
 */
async function handleSubscriptionPlanChanged(
	data: DodoSubscriptionPayload,
): Promise<void> {
	const resolved = await resolveDevPlanOrgFromSubscription(data);
	if (!resolved) {
		return;
	}
	const { organizationId } = resolved;

	const mapped = getDevPlanTierFromDodoProductId(data.product_id);
	if (!mapped) {
		logger.warn(
			`Dodo plan_changed for org ${organizationId} has unknown product ${data.product_id}`,
		);
		return;
	}

	const creditsLimit = getDevPlanCreditsLimit(mapped.tier);
	await db
		.update(tables.organization)
		.set({
			devPlan: mapped.tier,
			devPlanPendingTier: null,
			devPlanCycle: mapped.cycle,
			devPlanCreditsLimit: creditsLimit.toString(),
		})
		.where(eq(tables.organization.id, organizationId));

	logger.info(
		`Dev plan changed to ${mapped.tier} for organization ${organizationId} via Dodo`,
	);
}

/**
 * `subscription.updated` — tracks the cancel-at-period-end flag so the
 * dashboard can show "ends on <date>" before the plan actually terminates.
 */
async function handleSubscriptionUpdated(
	data: DodoSubscriptionPayload,
): Promise<void> {
	const resolved = await resolveDevPlanOrgFromSubscription(data);
	if (!resolved) {
		return;
	}
	const { organizationId } = resolved;

	const cancelled = data.cancel_at_next_billing_date === true;
	await db
		.update(tables.organization)
		.set({
			devPlanCancelled: cancelled,
			...(data.next_billing_date
				? { devPlanExpiresAt: new Date(data.next_billing_date) }
				: {}),
		})
		.where(eq(tables.organization.id, organizationId));
}

async function handleSubscriptionPastDue(
	data: DodoSubscriptionPayload,
): Promise<void> {
	const resolved = await resolveDevPlanOrgFromSubscription(data);
	if (!resolved) {
		return;
	}
	await db
		.update(tables.organization)
		.set({ subscriptionPaymentStatus: "past_due" })
		.where(eq(tables.organization.id, resolved.organizationId));

	logger.warn(
		`Dev plan subscription ${data.subscription_id} past due for org ${resolved.organizationId}`,
	);
}

/**
 * `subscription.cancelled` / `expired` / `failed` — the plan is over. Mirrors
 * the Stripe `customer.subscription.deleted` reset.
 */
async function handleSubscriptionEnded(
	data: DodoSubscriptionPayload,
): Promise<void> {
	const resolved = await resolveDevPlanOrgFromSubscription(data);
	if (!resolved) {
		return;
	}
	const { organizationId, organization } = resolved;

	const previousDevPlan = organization.devPlan;

	await db.insert(tables.transaction).values({
		organizationId,
		type: "dev_plan_end",
		currency: "USD",
		status: "completed",
		description: `Dev Plan ${previousDevPlan?.toUpperCase()} ended`,
	});

	await db
		.update(tables.organization)
		.set({
			devPlan: "none",
			devPlanPendingTier: null,
			devPlanCreditsLimit: "0",
			devPlanCreditsUsed: "0",
			devPlanPremiumCreditsUsed: "0",
			devPlanPremiumWeekStart: null,
			devPlanIncludedResetPassesUsed: 0,
			devPlanDodoSubscriptionId: null,
			devPlanExpiresAt: null,
			devPlanCancelled: false,
			devPlanBillingCycleStart: null,
			subscriptionPaymentStatus: "current",
		})
		.where(eq(tables.organization.id, organizationId));

	if (organization.billingEmail) {
		try {
			await sendTransactionalEmail({
				to: organization.billingEmail,
				organizationId: organization.id,
				subject: "Your Vichar Dev Plan Has Been Cancelled",
				html: generateSubscriptionCancelledEmailHtml({
					id: organizationId,
					name: organization.name,
					kind: "devpass",
				}),
			});
		} catch (error) {
			logger.error("Dev plan cancelled email failed", error as Error);
		}
	}

	posthog.capture({
		distinctId: "organization",
		event: "dev_plan_ended",
		groups: { organization: organizationId },
		properties: { tier: previousDevPlan, provider: "dodo" },
	});
	if (organization.billingEmail) {
		await notifyDevPlanCancelled(
			organization.billingEmail,
			organization.name,
			previousDevPlan ?? "none",
		).catch(() => {});
	}

	logger.info(
		`Ended dev plan ${previousDevPlan} for organization ${organizationId} via Dodo`,
	);
}

/**
 * `payment.succeeded` — records the renewal transaction. The subscription
 * state itself is handled by `subscription.renewed`; this event only produces
 * the ledger row, deduped by payment id so retries can't double-record.
 */
async function handlePaymentSucceeded(data: {
	payment_id?: string;
	subscription_id?: string | null;
	total_amount?: number;
	currency?: string;
	metadata?: Record<string, unknown> | null;
}): Promise<void> {
	if (!data.subscription_id || !data.payment_id) {
		return;
	}

	const organization = await db.query.organization.findFirst({
		where: { devPlanDodoSubscriptionId: data.subscription_id },
	});
	if (!organization || organization.devPlan === "none") {
		return;
	}

	const existing = await db.query.transaction.findFirst({
		where: { dodoPaymentId: data.payment_id },
	});
	if (existing) {
		return;
	}

	await db.insert(tables.transaction).values({
		organizationId: organization.id,
		type: "dev_plan_renewal",
		amount: ((data.total_amount ?? 0) / 100).toString(),
		currency: (data.currency ?? "USD").toUpperCase(),
		status: "completed",
		dodoPaymentId: data.payment_id,
		description: `Dev Plan ${organization.devPlan.toUpperCase()} renewed`,
	});
}
