import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import Stripe from "stripe";
import { z } from "zod";

import {
	checkAndReserveTopUp,
	releaseTopUpReservation,
} from "@llmgateway/actions";
import {
	and,
	db,
	enqueueWebhookDeliveries,
	eq,
	inArray,
	ne,
	sql,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import {
	DEV_PLAN_RESET_PASS_PRICES,
	type DevPlanTier,
} from "@llmgateway/shared";

import { computeReferralBonus } from "./lib/referral-bonus.js";
import { posthog } from "./posthog.js";
import { getStripe, type StripeMode } from "./routes/payments.js";
import { notifyCreditsPurchased, notifyRefund } from "./utils/discord.js";
import {
	generatePaymentFailureEmailHtml,
	sendTransactionalEmail,
} from "./utils/email.js";
import { generateAndEmailInvoice } from "./utils/invoice.js";

import type { ServerTypes } from "./vars.js";

export async function ensureStripeCustomer(
	organizationId: string,
): Promise<string> {
	// Claim the row under a lock so two concurrent callers (e.g. the
	// setup_intent.succeeded webhook racing a payment-intent request) can't
	// each create a Stripe customer. Losing that race orphans one customer
	// and strands any payment method attached to it, which later breaks
	// off-session charges with "PaymentMethod does not belong to the
	// Customer". The second caller blocks until the first commits, then
	// sees the persisted id.
	const { stripeCustomerId, created, billingEmail } = await db.transaction(
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

			if (organization.stripeCustomerId) {
				return {
					stripeCustomerId: organization.stripeCustomerId,
					created: false,
					billingEmail: organization.billingEmail,
				};
			}

			// Deterministic idempotency key: if Stripe creates the customer but
			// the surrounding DB transaction fails to commit, the retry returns
			// the already-created customer instead of minting a duplicate.
			const customer = await getStripe().customers.create(
				{
					email: organization.billingEmail,
					metadata: {
						organizationId,
					},
				},
				{
					idempotencyKey: `ensure-stripe-customer:${organizationId}`,
				},
			);

			await tx
				.update(tables.organization)
				.set({
					stripeCustomerId: customer.id,
				})
				.where(eq(tables.organization.id, organizationId));

			return {
				stripeCustomerId: customer.id,
				created: true,
				billingEmail: organization.billingEmail,
			};
		},
	);

	if (!created) {
		// Update existing customer email if billingEmail has changed
		await getStripe().customers.update(stripeCustomerId, {
			email: billingEmail,
		});
	}

	return stripeCustomerId;
}

/**
 * LLM SDK: ensure the end-customer has its own Stripe customer, separate
 * from the developer's org customer, so cards and receipts are per-end-user.
 */
export async function ensureEndCustomerStripeCustomer(
	endCustomerId: string,
	mode: StripeMode = "live",
): Promise<string> {
	// Claim the row under a lock so two concurrent top-ups for the same customer
	// can't each create a Stripe customer (orphaning one). The second caller
	// blocks until the first commits, then sees the persisted id.
	return await db.transaction(async (tx) => {
		const [endCustomer] = await tx
			.select()
			.from(tables.endCustomer)
			.where(eq(tables.endCustomer.id, endCustomerId))
			.for("update")
			.limit(1);

		if (!endCustomer) {
			throw new Error(`End customer not found: ${endCustomerId}`);
		}

		if (endCustomer.stripeCustomerId) {
			return endCustomer.stripeCustomerId;
		}

		// Deterministic idempotency key: if Stripe creates the customer but
		// the surrounding DB transaction fails to commit, the retry returns
		// the already-created customer instead of minting a duplicate.
		const customer = await getStripe(mode).customers.create(
			{
				email: endCustomer.email ?? undefined,
				name: endCustomer.name ?? undefined,
				metadata: {
					endCustomerId,
					projectId: endCustomer.projectId,
					organizationId: endCustomer.organizationId,
				},
			},
			{
				idempotencyKey: `ensure-end-customer-stripe-customer:${endCustomerId}`,
			},
		);

		await tx
			.update(tables.endCustomer)
			.set({ stripeCustomerId: customer.id })
			.where(eq(tables.endCustomer.id, endCustomerId));

		return customer.id;
	});
}

/**
 * Unified helper to resolve organizationId from various Stripe event sources
 * and validate that the organization exists in the database.
 */
async function resolveOrganizationFromStripeEvent(eventData: {
	metadata?: { organizationId?: string };
	customer?: string;
	subscription?: string;
	lines?: { data?: Array<{ metadata?: { organizationId?: string } }> };
}): Promise<{ organizationId: string; organization: any } | null> {
	let organizationId: string | null = null;

	// 1. Try to get organizationId from direct metadata
	if (eventData.metadata?.organizationId) {
		organizationId = eventData.metadata.organizationId;
		logger.debug("Found organizationId in direct metadata", { organizationId });
	}

	// 2. Check line items metadata (common in invoices)
	if (!organizationId && eventData.lines?.data) {
		logger.info(
			`Checking ${eventData.lines.data.length} line items for organizationId`,
		);
		for (const lineItem of eventData.lines.data) {
			if (lineItem.metadata?.organizationId) {
				organizationId = lineItem.metadata.organizationId;
				logger.info(
					`Found organizationId in line item metadata: ${organizationId}`,
				);
				break;
			}
		}
	}

	// 3. Try to get from subscription metadata if subscription ID is available
	if (!organizationId && eventData.subscription) {
		try {
			const stripeSubscription = await getStripe().subscriptions.retrieve(
				eventData.subscription,
			);
			if (stripeSubscription.metadata?.organizationId) {
				organizationId = stripeSubscription.metadata.organizationId;
				logger.info(
					`Found organizationId in subscription metadata: ${organizationId}`,
				);
			}
		} catch (error) {
			logger.error("Error retrieving subscription:", error as Error);
		}
	}

	// 4. Fallback: find organization by Stripe customer ID
	if (!organizationId && eventData.customer) {
		const organization = await db.query.organization.findFirst({
			where: {
				stripeCustomerId: eventData.customer,
			},
		});

		if (organization) {
			organizationId = organization.id;
			logger.info(
				`Found organizationId via customer lookup: ${organizationId}`,
			);
		}
	}

	if (!organizationId) {
		logger.error(`Organization not found for event data:`, {
			hasMetadata: !!eventData.metadata,
			customer: eventData.customer,
			subscription: eventData.subscription,
			lineItemsCount: eventData.lines?.data?.length ?? 0,
		});
		return null;
	}

	// Validate that the organization exists
	const organization = await db.query.organization.findFirst({
		where: {
			id: organizationId,
		},
	});

	if (!organization) {
		logger.error(
			`Organization with ID ${organizationId} does not exist in database`,
		);
		return null;
	}

	logger.info(
		`Successfully resolved organization: ${organization.name} (${organization.id})`,
	);
	return { organizationId, organization };
}

export const stripeRoutes = new OpenAPIHono<ServerTypes>();

const webhookHandler = createRoute({
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

/**
 * Verify a Stripe webhook signature against the live secret, then the sandbox
 * secret. Whichever verifies wins; if both are configured and neither matches,
 * the last error is rethrown so the handler returns 400.
 */
function constructWebhookEvent(
	body: string,
	sig: string,
): { event: Stripe.Event; mode: StripeMode } {
	const secrets: ReadonlyArray<[StripeMode, string | undefined]> = [
		["live", process.env.STRIPE_WEBHOOK_SECRET],
		["test", process.env.STRIPE_WEBHOOK_SECRET_TEST],
	];
	let lastError: Error | undefined;
	for (const [mode, secret] of secrets) {
		if (!secret) {
			continue;
		}
		try {
			return {
				event: getStripe(mode).webhooks.constructEvent(body, sig, secret),
				mode,
			};
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
		}
	}
	throw lastError ?? new Error("No Stripe webhook secret configured");
}

/**
 * Test-mode (sandbox) webhook events are only ever legitimate for LLM SDK
 * end-user wallet top-ups. Route them to the SDK handlers only — never the live
 * org billing handlers (credit top-ups, subscriptions, invoices) — even if the
 * test webhook endpoint is configured to forward broader event types. The
 * `payment_intent.*` handlers already gate on `kind === "end_user_topup"`, and
 * `charge.refunded` is restricted to end-user top-up refunds here.
 */
async function handleTestModeWebhookEvent(event: Stripe.Event): Promise<void> {
	switch (event.type) {
		case "payment_intent.succeeded": {
			const pi = event.data.object;
			if (pi.metadata?.kind === "end_user_topup") {
				await handleEndUserTopUpSucceeded(pi);
			} else {
				logger.warn("Ignoring non-SDK test-mode payment_intent.succeeded", {
					paymentIntentId: pi.id,
				});
			}
			break;
		}
		case "payment_intent.payment_failed": {
			const pi = event.data.object;
			logger.info("Test-mode payment intent failed", {
				paymentIntentId: pi.id,
				kind: pi.metadata?.kind,
			});
			break;
		}
		case "charge.refunded":
			await handleChargeRefunded(event, { endUserOnly: true });
			break;
		default:
			logger.info(`Ignoring test-mode event: ${event.type}`);
	}
}

stripeRoutes.openapi(webhookHandler, async (c) => {
	const sig = c.req.header("stripe-signature");

	if (!sig) {
		throw new HTTPException(400, {
			message: "Missing stripe-signature header",
		});
	}

	try {
		const body = await c.req.raw.text();

		// Verify against the live secret first, then the sandbox secret. Stripe
		// signs test-mode events (from LLM SDK test secret keys topping up via the
		// sandbox) with STRIPE_WEBHOOK_SECRET_TEST, delivered to the same endpoint.
		const { event, mode } = constructWebhookEvent(body, sig);

		logger.info("Stripe webhook received", {
			eventId: event.id,
			eventType: event.type,
			mode,
		});

		// Sandbox events must never reach the live org billing handlers — only the
		// SDK end-user wallet flow operates in test mode.
		if (mode === "test") {
			await handleTestModeWebhookEvent(event);
			return c.json({ received: true });
		}

		switch (event.type) {
			case "payment_intent.succeeded":
				await handlePaymentIntentSucceeded(event);
				break;
			case "payment_intent.payment_failed":
				await handlePaymentIntentFailed(event);
				break;
			case "setup_intent.succeeded":
				await handleSetupIntentSucceeded(event);
				break;
			case "checkout.session.completed":
				await handleCheckoutSessionCompleted(event);
				break;
			case "checkout.session.async_payment_succeeded": {
				// Delayed payment methods settle after `completed` fired with
				// payment_status "unpaid". Only the airside listing fee opts into
				// this event; other checkout flows settle synchronously.
				const settledSession = event.data.object as Stripe.Checkout.Session;
				if (settledSession.metadata?.type === "airside_listing_fee") {
					await handleAirsideListingCheckout(settledSession);
				}
				break;
			}
			case "charge.refunded":
				await handleChargeRefunded(event);
				break;
			default:
				logger.warn(`Unhandled event type: ${event.type}`);
		}

		return c.json({ received: true });
	} catch (error) {
		// Signature verification failures are almost always spoofed/bogus traffic
		// hitting the public webhook endpoint (e.g. a `fake_signature` header). They
		// are not actionable, so log at warn level and still return 400 rather than
		// raising an error alert.
		if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
			logger.warn("Ignoring Stripe webhook with invalid signature", {
				message: error.message,
			});
			throw new HTTPException(400, { message: "Invalid signature" });
		}
		logger.error("Webhook error:", error as Error);
		throw new HTTPException(400, {
			message: `Webhook error: ${error instanceof Error ? error.message : "Unknown error"}`,
		});
	}
});

function isStripePaymentIntent(value: unknown): value is Stripe.PaymentIntent {
	if (!value || typeof value !== "object") {
		return false;
	}
	return (value as { object?: unknown }).object === "payment_intent";
}

export async function getPaymentIntentFromInvoicePayments(
	invoice: Stripe.Invoice,
): Promise<Stripe.PaymentIntent | null> {
	let invoicePayments = invoice.payments?.data ?? [];
	if (invoicePayments.length === 0) {
		const listedPayments = await getStripe().invoicePayments.list({
			invoice: invoice.id,
			limit: 10,
		});
		invoicePayments = listedPayments.data;
	}

	for (const invoicePayment of invoicePayments) {
		const paymentIntent = invoicePayment.payment.payment_intent;
		if (!paymentIntent) {
			continue;
		}
		if (typeof paymentIntent !== "string") {
			if (isStripePaymentIntent(paymentIntent)) {
				return paymentIntent;
			}
			continue;
		}
		const retrieved = await getStripe().paymentIntents.retrieve(paymentIntent);
		return isStripePaymentIntent(retrieved) ? retrieved : null;
	}

	return null;
}

async function handleCheckoutSessionCompleted(
	event: Stripe.CheckoutSessionCompletedEvent,
) {
	const session = event.data.object;
	const { customer, metadata, subscription } = session;

	logger.info(
		`Processing checkout session completed for customer: ${customer}, subscription: ${subscription}, mode: ${session.mode}`,
	);

	if (!subscription && metadata?.type === "credit_topup") {
		await handleCreditTopUpCheckout(session);
		return;
	}

	if (!subscription && metadata?.type === "provider_listing") {
		await handleProviderListingCheckout(session);
		return;
	}

	if (!subscription && metadata?.type === "airside_listing_fee") {
		await handleAirsideListingCheckout(session);
		return;
	}

	logger.info("Unrecognized checkout session, skipping");
}

type BonusType = "first_purchase" | "referral";

function getBonusLabel(bonusType: BonusType | null): string {
	switch (bonusType) {
		case "referral":
			return "referral bonus";
		default:
			return "first-time bonus";
	}
}

async function applyFirstTimeBonus({
	organizationId,
	creditAmount,
	isEmailVerified,
}: {
	organizationId: string;
	creditAmount: number;
	isEmailVerified: boolean;
}): Promise<{
	finalCreditAmount: number;
	bonusAmount: number;
	bonusType: BonusType | null;
}> {
	let bonusAmount = 0;
	let finalCreditAmount = creditAmount;
	let bonusType: BonusType | null = null;

	if (!isEmailVerified) {
		return { finalCreditAmount, bonusAmount, bonusType };
	}

	const previousPurchases = await db.query.transaction.findMany({
		where: {
			organizationId: { eq: organizationId },
			type: { eq: "credit_topup" },
			status: { eq: "completed" },
		},
		orderBy: { createdAt: "asc" },
		limit: 2,
	});

	// On the first top-up, a referral signup bonus takes precedence over the
	// generic first-time bonus (they do not stack).
	if (previousPurchases.length === 0) {
		const referralBonus = await computeReferralBonus(
			organizationId,
			creditAmount,
		);
		if (referralBonus > 0) {
			bonusAmount = referralBonus;
			finalCreditAmount = creditAmount + bonusAmount;
			bonusType = "referral";

			logger.info(
				`Applied referral signup bonus of $${bonusAmount} to organization ${organizationId}`,
			);

			return { finalCreditAmount, bonusAmount, bonusType };
		}
	}

	const firstBonusMultiplier = process.env.FIRST_TIME_CREDIT_BONUS_MULTIPLIER
		? parseFloat(process.env.FIRST_TIME_CREDIT_BONUS_MULTIPLIER)
		: 0;

	if (firstBonusMultiplier <= 1) {
		return { finalCreditAmount, bonusAmount, bonusType };
	}

	if (previousPurchases.length === 0) {
		const potentialBonus = creditAmount * (firstBonusMultiplier - 1);
		const maxBonus = 50;
		bonusAmount = Math.min(potentialBonus, maxBonus);
		finalCreditAmount = creditAmount + bonusAmount;
		bonusType = "first_purchase";

		logger.info(
			`Applied first-time bonus of $${bonusAmount} to organization ${organizationId} (${firstBonusMultiplier}x multiplier, max $${maxBonus})`,
		);
	}

	return { finalCreditAmount, bonusAmount, bonusType };
}

/**
 * Resolves the PostHog distinct id for a purchase conversion event. The
 * frontends identify browser persons with the user's id, so capturing
 * payments against that same id lets pageview journeys be joined to
 * payments in analytics (e.g. the converting-URL sections of the traffic
 * report). Falls back to the legacy "organization" pseudo-person when no
 * user can be resolved.
 */
async function resolvePurchaserDistinctId(
	...emails: (string | null | undefined)[]
): Promise<string> {
	const candidates = new Set(
		emails.filter((email): email is string => Boolean(email)),
	);
	for (const email of candidates) {
		const purchaser = await db.query.user.findFirst({
			where: { email: { eq: email } },
		});
		if (purchaser) {
			return purchaser.id;
		}
	}
	return "organization";
}

async function recordCreditTopUp({
	organizationId,
	finalCreditAmount,
	bonusAmount,
	creditAmount,
	totalAmountInDollars,
	currency,
	stripePaymentIntentId,
	description,
	organization,
	source,
	bonusType,
	purchaserUserId,
}: {
	organizationId: string;
	finalCreditAmount: number;
	bonusAmount: number;
	creditAmount: number;
	totalAmountInDollars: number;
	currency: string;
	stripePaymentIntentId: string | null;
	description: string;
	organization: {
		name: string;
		billingEmail: string | null;
		billingCompany: string | null;
		billingAddress: string | null;
		billingTaxId: string | null;
		billingNotes: string | null;
	};
	source: string;
	bonusType?: BonusType | null;
	purchaserUserId?: string | null;
}) {
	await db
		.update(tables.organization)
		.set({
			credits: sql`${tables.organization.credits} + ${finalCreditAmount}`,
			paymentFailureCount: 0,
			lastPaymentFailureAt: null,
			paymentFailureStartedAt: null,
			lastTopUpAmount: creditAmount.toString(),
		})
		.where(eq(tables.organization.id, organizationId));

	// Reset low-balance email dedup so alerts can fire again on next cycle
	await db
		.delete(tables.followUpEmail)
		.where(
			and(
				eq(tables.followUpEmail.organizationId, organizationId),
				inArray(tables.followUpEmail.emailType, [
					"low_balance_20",
					"low_balance_5",
				]),
			),
		);

	const [completedTransaction] = await db
		.insert(tables.transaction)
		.values({
			organizationId,
			type: "credit_topup",
			creditAmount: finalCreditAmount.toString(),
			amount: totalAmountInDollars.toString(),
			currency,
			status: "completed",
			stripePaymentIntentId,
			description,
		})
		.returning();

	// The completed transaction row now covers this amount in the velocity
	// window's DB sum, so the initiation-time Redis reservation would count it
	// twice until its TTL — release it here (never recreates an expired key).
	try {
		await releaseTopUpReservation(organizationId, totalAmountInDollars);
	} catch (e) {
		logger.error("Top-up velocity settle-release failed", e as Error);
	}

	// Defense-in-depth observability for the top-up velocity cap: initiation is
	// where it is enforced, but a payment can settle after the window moved (e.g.
	// a checkout link paid late). Never refuse or refund a settled payment here —
	// just surface that the org ended up over its cap.
	try {
		const orgRow = await db.query.organization.findFirst({
			where: { id: { eq: organizationId } },
		});
		const overCapCheck = orgRow
			? await checkAndReserveTopUp({
					org: orgRow,
					amountUsd: 0,
					reserve: false,
				})
			: null;
		if (overCapCheck && !overCapCheck.allowed) {
			logger.warn("Organization exceeded its top-up velocity cap", {
				organizationId,
				capUsd: overCapCheck.capUsd,
				windowUsedUsd: overCapCheck.usedUsd,
				settledUsd: totalAmountInDollars,
			});
		}
	} catch (e) {
		logger.error("Top-up velocity post-check failed", e as Error);
	}

	const lineItems = [
		{
			description: `Credit Top-up ($${creditAmount})`,
			amount: totalAmountInDollars,
		},
	];

	if (bonusAmount > 0) {
		const label = getBonusLabel(bonusType ?? null);
		const bonusLabel = label.charAt(0).toUpperCase() + label.slice(1);
		lineItems.push({
			description: `${bonusLabel} (+$${bonusAmount.toFixed(2)})`,
			amount: 0,
		});
	}

	try {
		await generateAndEmailInvoice({
			organizationId,
			invoiceNumber: completedTransaction.id,
			invoiceDate: new Date(),
			organizationName: organization.name,
			billingEmail: organization.billingEmail ?? "",
			billingCompany: organization.billingCompany,
			billingAddress: organization.billingAddress,
			billingTaxId: organization.billingTaxId,
			billingNotes: organization.billingNotes,
			lineItems,
			currency,
		});
	} catch (e) {
		logger.error(
			"Invoice email failed (credit top-up); suppressing webhook failure",
			e as Error,
		);
	}

	posthog.groupIdentify({
		groupType: "organization",
		groupKey: organizationId,
		properties: {
			name: organization.name,
		},
	});
	posthog.capture({
		distinctId:
			purchaserUserId ??
			(await resolvePurchaserDistinctId(organization.billingEmail)),
		event: "credits_purchased",
		groups: {
			organization: organizationId,
		},
		properties: {
			amount: creditAmount,
			totalPaid: totalAmountInDollars,
			source,
			organization: organizationId,
		},
	});
}

async function handleAirsideListingCheckout(session: Stripe.Checkout.Session) {
	if (session.payment_status !== "paid") {
		logger.info(
			`Airside listing checkout session payment not yet settled (status: ${session.payment_status}), skipping`,
		);
		return;
	}
	const providerCompanyId = session.metadata?.providerCompanyId;
	if (!providerCompanyId) {
		logger.error("Airside listing checkout session missing providerCompanyId");
		return;
	}
	const updated = await db
		.update(tables.providerCompany)
		.set({
			paymentStatus: "paid",
			stripeCheckoutSessionId: session.id,
			paidAt: new Date(),
		})
		.where(
			and(
				eq(tables.providerCompany.id, providerCompanyId),
				ne(tables.providerCompany.paymentStatus, "paid"),
			),
		)
		.returning({ id: tables.providerCompany.id });
	if (updated.length === 0) {
		// Already paid via another session: a duplicate successful charge that
		// needs a manual refund.
		logger.error(
			`Airside listing fee paid twice for provider company ${providerCompanyId}; refund checkout session ${session.id}`,
		);
		return;
	}
	logger.info(`Marked airside provider company ${providerCompanyId} as paid`);
}

async function handleProviderListingCheckout(session: Stripe.Checkout.Session) {
	if (session.payment_status !== "paid") {
		logger.info(
			`Provider listing checkout session payment not yet settled (status: ${session.payment_status}), skipping`,
		);
		return;
	}

	const requestId = session.metadata?.submissionId;
	if (!requestId) {
		logger.error("Provider listing checkout session missing submissionId");
		return;
	}

	await db
		.update(tables.providerListingRequest)
		.set({
			paymentStatus: "paid",
			stripeCheckoutSessionId: session.id,
			paidAt: new Date(),
		})
		.where(eq(tables.providerListingRequest.id, requestId));

	logger.info(`Marked provider listing request ${requestId} as paid`);
}

async function handleCreditTopUpCheckout(session: Stripe.Checkout.Session) {
	const { customer, metadata } = session;

	if (session.payment_status !== "paid") {
		logger.info(
			`Credit top-up checkout session payment not yet settled (status: ${session.payment_status}), skipping`,
		);
		return;
	}

	const creditAmount = Number(metadata?.baseAmount);
	if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
		logger.error("Invalid baseAmount in credit top-up checkout metadata", {
			baseAmount: metadata?.baseAmount,
		});
		return;
	}

	const result = await resolveOrganizationFromStripeEvent({
		metadata: metadata as { organizationId?: string } | undefined,
		customer: typeof customer === "string" ? customer : customer?.id,
	});

	if (!result) {
		logger.error(
			"Could not resolve organization from credit top-up checkout session",
		);
		return;
	}

	const { organizationId, organization } = result;
	const totalAmountInDollars = (session.amount_total ?? 0) / 100;

	const stripePaymentIntentId =
		typeof session.payment_intent === "string"
			? session.payment_intent
			: (session.payment_intent?.id ?? null);

	if (!stripePaymentIntentId) {
		logger.error(
			"Credit top-up checkout session has no payment intent, skipping",
		);
		return;
	}

	const existingTransaction = await db.query.transaction.findFirst({
		where: {
			organizationId: { eq: organizationId },
			stripePaymentIntentId: { eq: stripePaymentIntentId },
			type: { eq: "credit_topup" },
			status: { eq: "completed" },
		},
	});

	if (existingTransaction) {
		logger.info(
			`Skipping duplicate credit top-up checkout for organization ${organizationId} (transaction ${existingTransaction.id} already exists)`,
		);
		return;
	}

	const userEmail = metadata?.userEmail;
	const resolvedUser = userEmail
		? await db.query.user.findFirst({
				where: {
					email: { eq: userEmail },
				},
			})
		: null;

	const { finalCreditAmount, bonusAmount, bonusType } =
		await applyFirstTimeBonus({
			organizationId,
			creditAmount,
			isEmailVerified: resolvedUser?.emailVerified ?? false,
		});

	const bonusLabel = getBonusLabel(bonusType);

	await recordCreditTopUp({
		organizationId,
		finalCreditAmount,
		bonusAmount,
		creditAmount,
		totalAmountInDollars,
		currency: (session.currency ?? "USD").toUpperCase(),
		stripePaymentIntentId,
		description:
			bonusAmount > 0
				? `Credit top-up via Stripe Checkout (+$${bonusAmount.toFixed(2)} ${bonusLabel})`
				: "Credit top-up via Stripe Checkout",
		organization,
		source: "stripe_checkout",
		bonusType,
		purchaserUserId: resolvedUser?.id ?? null,
	});

	await notifyCreditsPurchased({
		email: userEmail ?? organization.billingEmail,
		name: resolvedUser?.name,
		creditAmount,
		bonusAmount,
		grossAmount: totalAmountInDollars,
		currency: (session.currency ?? "USD").toUpperCase(),
		organizationId,
		organizationName: organization.name,
		source: "stripe_checkout",
	});

	logger.info(
		`Added ${finalCreditAmount} credits to organization ${organizationId} via Stripe Checkout (paid $${totalAmountInDollars} including fees)`,
	);
}

/**
 * LLM SDK: credit an end-user wallet after a successful top-up payment.
 * Idempotent on wallet_ledger.stripePaymentIntentId. Splits the charge into the
 * net credited to the wallet, the developer's margin (accrued to the developer
 * org), and the platform fee — all carried in the PaymentIntent metadata that
 * /v1/wallet/top-up set.
 */
export async function handleEndUserTopUpSucceeded(
	paymentIntent: Stripe.PaymentIntent,
) {
	const md = paymentIntent.metadata;
	const walletId = md.walletId;
	const netCredited = Number(md.netCredited);
	const developerMargin = Number(md.developerMargin ?? "0");
	const platformFee = Number(md.platformFee ?? "0");
	const bonusCredited = Number(md.bonusCredited ?? "0");
	const grossPaid = paymentIntent.amount / 100;

	if (!walletId || !Number.isFinite(netCredited) || netCredited <= 0) {
		logger.error("Invalid end_user_topup metadata", {
			paymentIntentId: paymentIntent.id,
			metadata: md,
		});
		return;
	}

	// Fast-path idempotency: a topup ledger row for this payment intent means we
	// already processed it (webhook re-delivery). The authoritative guard is the
	// unique partial index on wallet_ledger(stripePaymentIntentId) WHERE
	// type='topup', enforced inside the transaction below to close the race
	// between concurrent deliveries.
	const existing = await db.query.walletLedger.findFirst({
		where: {
			stripePaymentIntentId: { eq: paymentIntent.id },
			type: { eq: "topup" },
		},
	});
	if (existing) {
		logger.info(
			`Skipping duplicate end-user top-up for wallet ${walletId} (ledger ${existing.id} already processed)`,
		);
		return;
	}

	const wallet = await db.query.wallet.findFirst({
		where: { id: { eq: walletId } },
	});
	if (!wallet) {
		logger.error(`Wallet not found for end-user top-up: ${walletId}`);
		return;
	}

	// Test-mode top-ups are Stripe-sandbox payments: never accrue real, payable
	// developer margin. Persist zero on the ledger row too, so a later refund
	// (which claws back the ledger's developerMargin) can't erase live earnings.
	const accruedMargin = wallet.mode === "test" ? 0 : developerMargin;

	// Credit the wallet, write the ledger row, and accrue the developer margin
	// atomically. The ledger insert hits the unique index first, so a concurrent
	// duplicate delivery rolls the whole transaction back instead of double-
	// crediting.
	let txResult: { balance: string; bonusApplied: number };
	try {
		txResult = await db.transaction(async (tx) => {
			// Developer-funded bonus: resolve and reserve it FIRST, locking the org
			// row (SELECT … FOR UPDATE) and debiting its credits before we touch the
			// wallet. The worker debits org credits before wallet balance
			// (worker.ts), so acquiring the org lock ahead of the wallet here keeps a
			// consistent org→wallet lock order and avoids deadlocking a concurrent
			// usage-debit batch. Live wallets only (test-mode top-ups are Stripe
			// sandbox and must never spend real org credits), and capped with
			// `Math.floor` at the org's available credits so `credits` can never go
			// negative.
			let bonusApplied = 0;
			if (bonusCredited > 0 && wallet.mode !== "test") {
				const [org] = await tx
					.select({ credits: tables.organization.credits })
					.from(tables.organization)
					.where(eq(tables.organization.id, wallet.organizationId))
					.for("update")
					.limit(1);

				const availableCredits = Math.max(0, Number(org?.credits ?? "0"));
				bonusApplied =
					Math.floor(Math.min(bonusCredited, availableCredits) * 1e6) / 1e6;

				if (bonusApplied > 0) {
					await tx
						.update(tables.organization)
						.set({
							credits: sql`${tables.organization.credits} - ${bonusApplied}`,
						})
						.where(eq(tables.organization.id, wallet.organizationId));

					await tx.insert(tables.transaction).values({
						organizationId: wallet.organizationId,
						type: "end_user_bonus",
						amount: String(bonusApplied),
						creditAmount: String(-bonusApplied),
						status: "completed",
						stripePaymentIntentId: paymentIntent.id,
						description: `End-user top-up bonus (wallet ${walletId})`,
					});
				} else {
					logger.warn(
						`Skipping end-user top-up bonus for wallet ${walletId}: developer org ${wallet.organizationId} has insufficient credits (${availableCredits} available, ${bonusCredited} needed)`,
					);
				}
			}

			// Credit the paid amount + write the topup ledger row. The ledger insert
			// hits the unique index, so a concurrent duplicate delivery blocks on the
			// wallet row above, then rolls the whole transaction back here.
			const [updated] = await tx
				.update(tables.wallet)
				.set({ balance: sql`${tables.wallet.balance} + ${netCredited}` })
				.where(eq(tables.wallet.id, walletId))
				.returning();

			await tx.insert(tables.walletLedger).values({
				walletId,
				endCustomerId: wallet.endCustomerId,
				organizationId: wallet.organizationId,
				type: "topup",
				amount: String(netCredited),
				balanceAfter: updated.balance,
				grossPaid: String(grossPaid),
				platformFee: String(platformFee),
				developerMargin: String(accruedMargin),
				netCredited: String(netCredited),
				stripePaymentIntentId: paymentIntent.id,
				description: "End-user credit top-up",
			});

			// Record the end-user top-up as Vichar revenue, mirroring an org
			// credit purchase: `amount` = gross Stripe charge, `creditAmount` = net
			// credit value (Stripe fees excluded; the developer's markup margin is
			// tracked separately as a liability, not revenue). Live wallets only —
			// sandbox top-ups are not real money. Reversed on refund below.
			if (wallet.mode !== "test") {
				await tx.insert(tables.transaction).values({
					organizationId: wallet.organizationId,
					type: "end_user_topup",
					amount: String(grossPaid),
					creditAmount: String(netCredited),
					status: "completed",
					stripePaymentIntentId: paymentIntent.id,
					description: `End-user credit top-up (wallet ${walletId})`,
				});
			}

			// Accrue the developer's margin to their org (settled out-of-band / via
			// Stripe Connect) and record it in the org's transaction history.
			if (accruedMargin > 0) {
				await tx
					.update(tables.organization)
					.set({
						endUserMarginBalance: sql`${tables.organization.endUserMarginBalance} + ${accruedMargin}`,
					})
					.where(eq(tables.organization.id, wallet.organizationId));

				await tx.insert(tables.transaction).values({
					organizationId: wallet.organizationId,
					type: "end_user_margin_accrual",
					amount: String(accruedMargin),
					creditAmount: String(accruedMargin),
					status: "completed",
					stripePaymentIntentId: paymentIntent.id,
					description: `End-user top-up margin (wallet ${walletId})`,
				});
			}

			// Credit the reserved bonus on top of the paid amount, in its own ledger
			// row so the economic split stays legible.
			let finalBalance = updated.balance;
			if (bonusApplied > 0) {
				const [bonusUpdated] = await tx
					.update(tables.wallet)
					.set({ balance: sql`${tables.wallet.balance} + ${bonusApplied}` })
					.where(eq(tables.wallet.id, walletId))
					.returning();
				finalBalance = bonusUpdated.balance;

				await tx.insert(tables.walletLedger).values({
					walletId,
					endCustomerId: wallet.endCustomerId,
					organizationId: wallet.organizationId,
					type: "bonus",
					amount: String(bonusApplied),
					balanceAfter: bonusUpdated.balance,
					stripePaymentIntentId: paymentIntent.id,
					description: "End-user top-up bonus",
				});
			}

			return { balance: finalBalance, bonusApplied };
		});
	} catch (err) {
		const code =
			(err as { code?: string; cause?: { code?: string } })?.code ??
			(err as { cause?: { code?: string } })?.cause?.code;
		if (code === "23505") {
			logger.info(
				`Skipping duplicate end-user top-up for wallet ${walletId} (concurrent delivery for ${paymentIntent.id})`,
			);
			return;
		}
		throw err;
	}

	const { balance: newBalance, bonusApplied } = txResult;

	logger.info(
		`Credited ${netCredited} to end-user wallet ${walletId} (margin ${developerMargin}, platform fee ${platformFee}, bonus ${bonusApplied}, balance now ${newBalance})`,
	);

	// Notify the developer's webhook endpoints (best-effort). Skip for test-mode
	// wallets: webhook endpoints are live-only (test keys can't manage them), so
	// delivering sandbox top-up events to the developer's real consumers would
	// be misleading.
	if (wallet.mode !== "test") {
		try {
			await enqueueWebhookDeliveries({
				projectId: wallet.projectId,
				eventType: "wallet.credited",
				data: {
					walletId,
					endCustomerId: wallet.endCustomerId,
					netCredited,
					// Developer-funded bonus actually applied (post-cap), and the total
					// spend power added, so consumers don't have to infer it from the
					// balance delta.
					bonusCredited: bonusApplied,
					totalCredited: netCredited + bonusApplied,
					grossPaid,
					balance: newBalance,
					currency: wallet.currency,
				},
			});
		} catch (err) {
			logger.warn("Failed to enqueue wallet.credited webhook", {
				walletId,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
}

/**
 * LLM SDK: reverse an end-user wallet top-up on refund. Idempotent on a
 * reversal ledger row. The wallet debit is clamped to the current balance (the
 * end-user may have already spent some), and the developer's accrued margin is
 * clawed back (clamped at zero).
 */
export async function handleEndUserTopUpRefunded(
	topUp: typeof tables.walletLedger.$inferSelect,
) {
	if (!topUp.stripePaymentIntentId) {
		return;
	}

	const alreadyReversed = await db.query.walletLedger.findFirst({
		where: {
			stripePaymentIntentId: { eq: topUp.stripePaymentIntentId },
			type: { eq: "reversal" },
		},
	});
	if (alreadyReversed) {
		logger.info(
			`Skipping duplicate end-user refund for wallet ${topUp.walletId}`,
		);
		return;
	}

	const credited = Number(topUp.netCredited ?? "0");
	const developerMargin = Number(topUp.developerMargin ?? "0");

	// The developer-funded bonus (if any) shares this PaymentIntent. Reverse it
	// too so a refunded top-up can't leave gifted, developer-funded spend power in
	// the wallet (top up → get bonus → refund → keep bonus).
	const bonusRow = await db.query.walletLedger.findFirst({
		where: {
			stripePaymentIntentId: { eq: topUp.stripePaymentIntentId },
			type: { eq: "bonus" },
		},
	});
	const bonusOriginal = Number(bonusRow?.amount ?? "0");

	// Debit the wallet, write the reversal ledger row, and claw back the margin
	// atomically. The ledger insert hits the unique partial index
	// (wallet_ledger_reversal_payment_intent_unique), so a concurrent / re-
	// delivered charge.refunded rolls the whole transaction back instead of
	// double-reversing. The wallet is locked + re-read inside the transaction so
	// the balance clamp can't go stale against a concurrent debit.
	let reversal: number;
	try {
		reversal = await db.transaction(async (tx) => {
			// When restoring org credits for a bonus claw-back, lock the org row
			// before the wallet to match the worker's org→wallet lock order and the
			// top-up path above, avoiding a deadlock with a concurrent usage-debit.
			if (bonusOriginal > 0) {
				await tx
					.select({ id: tables.organization.id })
					.from(tables.organization)
					.where(eq(tables.organization.id, topUp.organizationId))
					.for("update")
					.limit(1);
			}

			const [wallet] = await tx
				.select()
				.from(tables.wallet)
				.where(eq(tables.wallet.id, topUp.walletId))
				.for("update")
				.limit(1);
			if (!wallet) {
				logger.error(`Wallet not found for end-user refund: ${topUp.walletId}`);
				return 0;
			}

			// Reverse the paid top-up first, then the bonus, each clamped to the
			// balance still in the wallet (the end-user may have already spent some).
			const currentBalance = Math.max(Number(wallet.balance ?? "0"), 0);
			const topupReversed = Math.min(credited, currentBalance);
			const bonusReversed =
				Math.floor(
					Math.min(bonusOriginal, currentBalance - topupReversed) * 1e6,
				) / 1e6;
			const amount = Math.round((topupReversed + bonusReversed) * 1e6) / 1e6;

			const [updated] = await tx
				.update(tables.wallet)
				.set({ balance: sql`${tables.wallet.balance} - ${amount}` })
				.where(eq(tables.wallet.id, topUp.walletId))
				.returning();

			await tx.insert(tables.walletLedger).values({
				walletId: topUp.walletId,
				endCustomerId: topUp.endCustomerId,
				organizationId: topUp.organizationId,
				type: "reversal",
				amount: String(-amount),
				balanceAfter: updated.balance,
				stripePaymentIntentId: topUp.stripePaymentIntentId,
				description:
					bonusReversed > 0
						? "End-user top-up refund (incl. bonus claw-back)"
						: "End-user top-up refund",
			});

			// Reverse the top-up revenue booked at top-up time. The Stripe refund
			// returns the whole payment, so reverse the full net/gross (independent
			// of how much of the wallet balance was already spent). Live wallets
			// only, matching the `end_user_topup` grant above.
			const revenueReversed = Number(topUp.netCredited ?? "0");
			const grossReversed = Number(topUp.grossPaid ?? "0");
			if (
				wallet.mode !== "test" &&
				(revenueReversed > 0 || grossReversed > 0)
			) {
				await tx.insert(tables.transaction).values({
					organizationId: topUp.organizationId,
					type: "end_user_topup",
					amount: String(-grossReversed),
					creditAmount: String(-revenueReversed),
					status: "completed",
					stripePaymentIntentId: topUp.stripePaymentIntentId,
					description: `End-user top-up refund reversal (wallet ${topUp.walletId})`,
				});
			}

			if (developerMargin > 0) {
				await tx
					.update(tables.organization)
					.set({
						endUserMarginBalance: sql`GREATEST(${tables.organization.endUserMarginBalance} - ${developerMargin}, 0)`,
					})
					.where(eq(tables.organization.id, topUp.organizationId));

				await tx.insert(tables.transaction).values({
					organizationId: topUp.organizationId,
					type: "end_user_refund",
					amount: String(developerMargin),
					creditAmount: String(developerMargin),
					status: "completed",
					stripePaymentIntentId: topUp.stripePaymentIntentId,
					description: `End-user top-up refund margin claw-back (wallet ${topUp.walletId})`,
				});
			}

			// Return the clawed-back bonus to the developer org's credit balance.
			if (bonusReversed > 0) {
				await tx
					.update(tables.organization)
					.set({
						credits: sql`${tables.organization.credits} + ${bonusReversed}`,
					})
					.where(eq(tables.organization.id, topUp.organizationId));

				await tx.insert(tables.transaction).values({
					organizationId: topUp.organizationId,
					type: "end_user_bonus",
					amount: String(bonusReversed),
					creditAmount: String(bonusReversed),
					status: "completed",
					stripePaymentIntentId: topUp.stripePaymentIntentId,
					description: `End-user top-up bonus claw-back on refund (wallet ${topUp.walletId})`,
				});
			}

			return amount;
		});
	} catch (err) {
		const code =
			(err as { code?: string; cause?: { code?: string } })?.code ??
			(err as { cause?: { code?: string } })?.cause?.code;
		if (code === "23505") {
			logger.info(
				`Skipping duplicate end-user refund for wallet ${topUp.walletId} (concurrent delivery for ${topUp.stripePaymentIntentId})`,
			);
			return;
		}
		throw err;
	}

	logger.info(
		`Reversed ${reversal} from end-user wallet ${topUp.walletId} on refund`,
	);
}

async function handlePaymentIntentSucceeded(
	event: Stripe.PaymentIntentSucceededEvent,
) {
	const paymentIntent = event.data.object;
	const { metadata, amount } = paymentIntent;

	// LLM SDK end-user wallet top-ups are handled separately and bill an
	// end-user wallet, not the developer's org credits.
	if (paymentIntent.metadata.kind === "end_user_topup") {
		await handleEndUserTopUpSucceeded(paymentIntent);
		return;
	}

	// Credit top-ups paid through Stripe Checkout are fulfilled by
	// checkout.session.completed (handleCreditTopUpCheckout). Their PaymentIntent
	// carries the same metadata only so the charge is attributable in the Stripe
	// dashboard — crediting it here as well would double-credit the organization.
	if (paymentIntent.metadata.source === "stripe_checkout") {
		return;
	}

	// payment_intent.succeeded also fires for subscription invoice payments;
	// only credit top-up payment intents set baseAmount in metadata.
	if (paymentIntent.metadata.baseAmount === undefined) {
		return;
	}

	const creditAmount = Number(paymentIntent.metadata.baseAmount);
	if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
		logger.error("Invalid baseAmount in payment intent metadata", {
			baseAmount: paymentIntent.metadata.baseAmount,
			paymentIntentId: paymentIntent.id,
		});
		return;
	}

	const result = await resolveOrganizationFromStripeEvent({
		metadata,
		customer: paymentIntent.customer as string,
	});

	if (!result) {
		logger.error("Could not resolve organization from payment intent");
		return;
	}
	const { organizationId, organization } = result;

	const existingTransaction = await db.query.transaction.findFirst({
		where: {
			stripePaymentIntentId: { eq: paymentIntent.id },
			type: { eq: "credit_topup" },
			status: { eq: "completed" },
		},
	});

	if (existingTransaction) {
		logger.info(
			`Skipping duplicate payment_intent.succeeded for organization ${organizationId} (transaction ${existingTransaction.id} already processed)`,
		);
		return;
	}

	const totalAmountInDollars = amount / 100;

	const userEmail = metadata?.userEmail;
	const resolvedUser = userEmail
		? await db.query.user.findFirst({
				where: {
					email: { eq: userEmail },
				},
			})
		: null;

	const { finalCreditAmount, bonusAmount, bonusType } =
		await applyFirstTimeBonus({
			organizationId,
			creditAmount,
			isEmailVerified: resolvedUser?.emailVerified ?? false,
		});

	// Check if this is an auto top-up with an existing pending transaction
	const transactionId = metadata?.transactionId;

	const bonusLabel = getBonusLabel(bonusType);
	// DevPass orgs buy credits as PAYG overflow — name the billing event
	// accordingly so the dashboard history, invoices and admin transaction
	// lists read unambiguously next to plan payments.
	const isDevpassTopup = organization.kind === "devpass";
	const topupNoun = isDevpassTopup ? "DevPass credits top-up" : "Credit top-up";
	const transactionDescription =
		bonusAmount > 0
			? `${topupNoun} via Stripe (+$${bonusAmount.toFixed(2)} ${bonusLabel})`
			: `${topupNoun} via Stripe`;

	if (transactionId) {
		await db
			.update(tables.organization)
			.set({
				credits: sql`${tables.organization.credits} + ${finalCreditAmount}`,
				paymentFailureCount: 0,
				lastPaymentFailureAt: null,
				paymentFailureStartedAt: null,
				lastTopUpAmount: creditAmount.toString(),
			})
			.where(eq(tables.organization.id, organizationId));

		// Reset low-balance email dedup so alerts can fire again on next cycle
		await db
			.delete(tables.followUpEmail)
			.where(
				and(
					eq(tables.followUpEmail.organizationId, organizationId),
					inArray(tables.followUpEmail.emailType, [
						"low_balance_20",
						"low_balance_5",
					]),
				),
			);

		const updatedTransaction = await db
			.update(tables.transaction)
			.set({
				status: "completed",
				stripePaymentIntentId: paymentIntent.id,
				description:
					bonusAmount > 0
						? `${isDevpassTopup ? "DevPass credits auto top-up" : "Auto top-up completed"} via Stripe webhook (+$${bonusAmount.toFixed(2)} ${bonusLabel})`
						: `${isDevpassTopup ? "DevPass credits auto top-up" : "Auto top-up completed"} via Stripe webhook`,
				creditAmount: finalCreditAmount.toString(),
				amount: totalAmountInDollars.toString(),
			})
			.where(eq(tables.transaction.id, transactionId))
			.returning()
			.then((rows) => rows[0]);

		let completedTransactionId: string;

		if (!updatedTransaction) {
			logger.warn(
				`Could not find pending transaction ${transactionId} for organization ${organizationId}, creating new record`,
			);
			const [fallbackTransaction] = await db
				.insert(tables.transaction)
				.values({
					organizationId,
					type: "credit_topup",
					creditAmount: finalCreditAmount.toString(),
					amount: totalAmountInDollars.toString(),
					currency: paymentIntent.currency.toUpperCase(),
					status: "completed",
					stripePaymentIntentId: paymentIntent.id,
					description: transactionDescription,
				})
				.returning();
			completedTransactionId = fallbackTransaction.id;
		} else {
			completedTransactionId = updatedTransaction.id;
		}

		const lineItems = [
			{
				description: `Credit Top-up ($${creditAmount})`,
				amount: totalAmountInDollars,
			},
		];

		if (bonusAmount > 0) {
			const autoBonusLabel =
				bonusLabel.charAt(0).toUpperCase() + bonusLabel.slice(1);
			lineItems.push({
				description: `${autoBonusLabel} (+$${bonusAmount.toFixed(2)})`,
				amount: 0,
			});
		}

		try {
			await generateAndEmailInvoice({
				organizationId: organization.id,
				invoiceNumber: completedTransactionId,
				invoiceDate: new Date(),
				organizationName: organization.name,
				billingEmail: organization.billingEmail ?? "",
				billingCompany: organization.billingCompany,
				billingAddress: organization.billingAddress,
				billingTaxId: organization.billingTaxId,
				billingNotes: organization.billingNotes,
				lineItems,
				currency: paymentIntent.currency.toUpperCase(),
			});
		} catch (e) {
			logger.error(
				"Invoice email failed (auto top-up); suppressing webhook failure",
				e as Error,
			);
		}

		posthog.groupIdentify({
			groupType: "organization",
			groupKey: organizationId,
			properties: {
				name: organization.name,
			},
		});
		posthog.capture({
			distinctId:
				resolvedUser?.id ??
				(await resolvePurchaserDistinctId(organization.billingEmail)),
			event: "credits_purchased",
			groups: {
				organization: organizationId,
			},
			properties: {
				amount: creditAmount,
				totalPaid: totalAmountInDollars,
				source: "payment_intent",
				organization: organizationId,
			},
		});
	} else {
		await recordCreditTopUp({
			organizationId,
			finalCreditAmount,
			bonusAmount,
			creditAmount,
			totalAmountInDollars,
			currency: paymentIntent.currency.toUpperCase(),
			stripePaymentIntentId: paymentIntent.id,
			description: transactionDescription,
			organization,
			source: "payment_intent",
			bonusType,
			purchaserUserId: resolvedUser?.id ?? null,
		});
	}

	await notifyCreditsPurchased({
		email: userEmail ?? organization.billingEmail,
		name: resolvedUser?.name,
		creditAmount,
		bonusAmount,
		grossAmount: totalAmountInDollars,
		currency: paymentIntent.currency.toUpperCase(),
		organizationId,
		organizationName: organization.name,
		source: transactionId ? "auto_topup" : "payment_intent",
	});

	logger.info(
		`Added credits to organization ${organizationId} (paid ${totalAmountInDollars} including fees)`,
	);
}

export async function handlePaymentIntentFailed(
	event: Stripe.PaymentIntentPaymentFailedEvent,
) {
	const paymentIntent = event.data.object;
	const { metadata, amount } = paymentIntent;

	// LLM SDK end-user wallet top-ups are not org credit purchases. A failed one
	// (e.g. a Stripe sandbox decline-test card during development) must not mutate
	// the developer org's billing state — payment-failure rows, failure counts,
	// or dunning emails. Just log it and stop.
	if (metadata?.kind === "end_user_topup") {
		logger.info("End-user top-up payment failed", {
			walletId: metadata.walletId,
			paymentIntentId: paymentIntent.id,
		});
		return;
	}

	const result = await resolveOrganizationFromStripeEvent({
		metadata,
		customer: paymentIntent.customer as string,
	});

	if (!result) {
		logger.error("Could not resolve organization from failed payment intent");
		return;
	}

	const { organizationId, organization } = result;

	// Convert amount from cents to dollars
	const totalAmountInDollars = amount / 100;

	// Get the credit amount from metadata if available
	const creditAmount = metadata?.baseAmount
		? parseFloat(metadata.baseAmount)
		: null;

	// Extract error details from Stripe
	const lastPaymentError = paymentIntent.last_payment_error;
	const errorMessage = lastPaymentError?.message ?? "Unknown error";
	const errorCode = lastPaymentError?.code;
	const declineCode = lastPaymentError?.decline_code;

	// Record payment failure for admin dashboard (idempotent — no-op on duplicate)
	await db
		.insert(tables.paymentFailure)
		.values({
			organizationId,
			userEmail: metadata?.userEmail ?? null,
			amount: totalAmountInDollars.toString(),
			currency: paymentIntent.currency.toUpperCase(),
			declineCode: declineCode ?? null,
			errorCode: errorCode ?? null,
			failureMessage: errorMessage,
			stripePaymentIntentId: paymentIntent.id,
			source: metadata?.autoTopUp === "true" ? "auto_topup" : "manual",
		})
		.onConflictDoNothing();

	// Log warning for payment failure
	logger.warn("Payment intent failed", {
		organizationId,
		organizationName: organization.name,
		amount: totalAmountInDollars,
		currency: paymentIntent.currency.toUpperCase(),
		errorMessage,
		errorCode,
		declineCode,
		stripePaymentIntentId: paymentIntent.id,
	});

	// Only credit top-up payment intents may be recorded as a `credit_topup`
	// transaction. Subscription invoice payments (Pro / DevPass / chat plan) also
	// emit `payment_intent.payment_failed`, but recording them here produced a
	// phantom "Credit top-up failed" row on the customer's billing history (and
	// the credit-purchase paths never create such a charge). Mirror the
	// `baseAmount` guard in handlePaymentIntentSucceeded: actual top-ups always
	// set `baseAmount` (manual + auto) or carry a pending `transactionId`;
	// subscription invoice intents carry neither. Failure tracking above
	// (paymentFailure row + dunning email) still runs for subscription invoices,
	// and dev/chat subscription state is handled in handleInvoicePaymentFailed.
	// Checkout-sourced top-ups are excluded as well: the Stripe-hosted page lets
	// the customer retry a declined card on the same PaymentIntent, so recording a
	// row per failure would spam the billing history, and no transaction exists
	// until checkout.session.completed fulfils the payment.
	const transactionId = metadata?.transactionId;
	const isCreditTopup =
		(metadata?.baseAmount !== undefined || transactionId !== undefined) &&
		metadata?.source !== "stripe_checkout";
	if (isCreditTopup) {
		if (transactionId) {
			// Update existing pending transaction to failed
			const updatedTransaction = await db
				.update(tables.transaction)
				.set({
					status: "failed",
					description: `Auto top-up failed via Stripe webhook: ${errorMessage}`,
				})
				.where(eq(tables.transaction.id, transactionId))
				.returning()
				.then((rows) => rows[0]);

			if (updatedTransaction) {
				logger.info(
					`Updated pending transaction ${transactionId} to failed for organization ${organizationId}`,
				);
			} else {
				logger.warn(
					`Could not find pending transaction ${transactionId} for organization ${organizationId}`,
				);
				// Fallback: create new failed transaction record
				await db.insert(tables.transaction).values({
					organizationId,
					type: "credit_topup",
					creditAmount: creditAmount ? creditAmount.toString() : null,
					amount: totalAmountInDollars.toString(),
					currency: paymentIntent.currency.toUpperCase(),
					status: "failed",
					stripePaymentIntentId: paymentIntent.id,
					description: `Credit top-up failed via Stripe (fallback): ${errorMessage}`,
				});
			}
		} else {
			// Create new failed transaction record (for manual top-ups or payments without transactionId)
			await db.insert(tables.transaction).values({
				organizationId,
				type: "credit_topup",
				creditAmount: creditAmount ? creditAmount.toString() : null,
				amount: totalAmountInDollars.toString(),
				currency: paymentIntent.currency.toUpperCase(),
				status: "failed",
				stripePaymentIntentId: paymentIntent.id,
				description: `Credit top-up failed via Stripe: ${errorMessage}`,
			});
		}
	}

	// Update payment failure tracking with exponential backoff
	// Calculate new failure count and check if we should send an email
	const previousFailureCount = organization.paymentFailureCount ?? 0;
	const previousFailureAt = organization.lastPaymentFailureAt;
	const failureStartedAt = organization.paymentFailureStartedAt ?? new Date();
	const newFailureCount = previousFailureCount + 1;

	// Update organization with new failure count and timestamp
	await db
		.update(tables.organization)
		.set({
			paymentFailureCount: newFailureCount,
			lastPaymentFailureAt: new Date(),
			paymentFailureStartedAt: failureStartedAt,
		})
		.where(eq(tables.organization.id, organizationId));

	// Determine if we should send an email based on exponential backoff
	// Email intervals: 1st failure immediately, then 1h, 2h, 4h, 8h, 16h, 24h (capped)
	let shouldSendEmail = false;
	if (previousFailureCount === 0) {
		// First failure - always send email
		shouldSendEmail = true;
	} else if (previousFailureAt) {
		// Calculate backoff period based on previous failure count
		const baseBackoffHours = 1;
		const maxBackoffHours = 24;
		const backoffHours = Math.min(
			baseBackoffHours * Math.pow(2, previousFailureCount - 1),
			maxBackoffHours,
		);
		const backoffMs = backoffHours * 60 * 60 * 1000;
		const nextEmailTime = new Date(previousFailureAt.getTime() + backoffMs);

		// Send email if we're past the backoff period
		shouldSendEmail = new Date() >= nextEmailTime;
	}

	// Send payment failure email if not in backoff period
	if (shouldSendEmail) {
		try {
			const payInvoiceUrl =
				errorCode === "authentication_required" ||
				declineCode === "authentication_required"
					? await resolveHostedInvoiceUrl(paymentIntent.id)
					: undefined;
			await sendTransactionalEmail({
				to: organization.billingEmail,
				organizationId: organization.id,
				subject: "Payment Failed - Action Required",
				html: generatePaymentFailureEmailHtml(
					{
						id: organizationId,
						name: organization.name,
						kind: organization.kind,
					},
					{
						errorMessage,
						errorCode,
						declineCode,
						amount: totalAmountInDollars,
						currency: paymentIntent.currency.toUpperCase(),
						payInvoiceUrl,
					},
				),
			});

			logger.warn("Payment failure email sent", {
				organizationId,
				billingEmail: organization.billingEmail,
				failureCount: newFailureCount,
			});
		} catch (emailError) {
			logger.error("Failed to send payment failure email", emailError as Error);
		}
	} else {
		logger.warn("Skipping payment failure email (in backoff period)", {
			organizationId,
			failureCount: newFailureCount,
		});
	}
}

// The hosted invoice page is the only place a cardholder can answer the bank's
// authentication request for an off-session renewal, so the dunning email links
// there. Best effort: the email still goes out without it.
async function resolveHostedInvoiceUrl(
	paymentIntentId: string,
): Promise<string | undefined> {
	try {
		const invoiceId = await resolveInvoiceIdForPaymentIntent(paymentIntentId);
		if (!invoiceId) {
			return undefined;
		}
		const invoice = await getStripe().invoices.retrieve(invoiceId);
		return invoice.hosted_invoice_url ?? undefined;
	} catch (error) {
		logger.warn("Could not resolve hosted invoice for failed payment intent", {
			paymentIntentId,
			error: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
}

// Current Stripe API versions no longer expose the invoice link on the Charge or
// PaymentIntent objects, so an event for a subscription invoice payment can't be
// mapped back to its invoice directly. DevPass transactions (`dev_plan_start`
// from setup-mode checkout, and invoice renewals) store the invoice id rather
// than the payment intent, so refunds resolve the paid invoice from the invoice
// payment that this payment intent settled. Filtering the invoice_payments list
// by the payment intent is an exact, unbounded lookup — it works even for
// arbitrarily old invoices.
async function resolveInvoiceIdForPaymentIntent(
	paymentIntentId: string,
): Promise<string | undefined> {
	const payments = await getStripe().invoicePayments.list({
		payment: { type: "payment_intent", payment_intent: paymentIntentId },
		limit: 1,
	});
	const invoice = payments.data[0]?.invoice;
	if (!invoice) {
		return undefined;
	}
	return typeof invoice === "string" ? invoice : (invoice.id ?? undefined);
}

// Human-readable product name for a refunded purchase, used in the internal
// Discord refund notification.
function refundProductLabel(type: string): string {
	if (type === "credit_topup") {
		return "Credits";
	}
	if (type.startsWith("dev_plan")) {
		return "DevPass";
	}
	if (type.startsWith("chat_plan")) {
		return "Lounge";
	}
	return "Subscription";
}

export async function handleChargeRefunded(
	event: Stripe.ChargeRefundedEvent,
	options: { endUserOnly?: boolean } = {},
) {
	const charge = event.data.object;
	const { payment_intent } = charge;

	if (!payment_intent) {
		logger.error("No payment intent in charge.refunded event");
		return;
	}

	// LLM SDK: end-user wallet top-up refund. Reverse the credited amount
	// (clamped to the wallet's current balance) and write a reversal ledger row.
	const walletTopUp = await db.query.walletLedger.findFirst({
		where: {
			stripePaymentIntentId: { eq: payment_intent as string },
			type: { eq: "topup" },
		},
	});
	if (walletTopUp) {
		await handleEndUserTopUpRefunded(walletTopUp);
		return;
	}

	// In test (sandbox) mode only end-user top-up refunds are valid; never touch
	// live org refund state for a non-SDK sandbox charge.
	if (options.endUserOnly) {
		logger.info("Ignoring non-SDK test-mode charge.refunded", {
			paymentIntentId: payment_intent as string,
		});
		return;
	}

	const refundableTypes: (
		| "credit_topup"
		| "dev_plan_start"
		| "dev_plan_renewal"
		| "dev_plan_upgrade"
		| "dev_plan_reset_pass"
		| "chat_plan_start"
		| "chat_plan_renewal"
		| "chat_plan_upgrade"
		| "subscription_start"
	)[] = [
		"credit_topup",
		"dev_plan_start",
		"dev_plan_renewal",
		"dev_plan_upgrade",
		"dev_plan_reset_pass",
		"chat_plan_start",
		"chat_plan_renewal",
		"chat_plan_upgrade",
		"subscription_start",
	];

	// Find the original transaction by stripePaymentIntentId first (covers
	// credit_topup and any row that recorded the payment intent).
	let originalTransaction = await db.query.transaction.findFirst({
		where: {
			stripePaymentIntentId: { eq: payment_intent as string },
			type: { in: refundableTypes },
		},
	});

	// Otherwise fall back to the invoice id: dev_plan_start (initial DevPass
	// setup-mode checkout) and invoice renewals record only the invoice id, not
	// the payment intent. Prefer the invoice link on the charge (present on older
	// API versions); current versions drop it, so resolve it from Stripe by
	// finding which of the customer's invoices this payment intent paid.
	let invoiceId: string | undefined;
	if (!originalTransaction) {
		const chargeInvoice = (
			charge as unknown as { invoice?: string | { id?: string } | null }
		).invoice;
		invoiceId =
			typeof chargeInvoice === "string"
				? chargeInvoice
				: (chargeInvoice?.id ?? undefined);
		if (!invoiceId) {
			invoiceId = await resolveInvoiceIdForPaymentIntent(
				payment_intent as string,
			);
		}
		if (invoiceId) {
			originalTransaction = await db.query.transaction.findFirst({
				where: {
					stripeInvoiceId: { eq: invoiceId },
					type: { in: refundableTypes },
				},
			});
		}
	}

	if (!originalTransaction) {
		logger.error(
			`Original transaction not found for payment intent: ${payment_intent}${
				invoiceId ? ` (invoice: ${invoiceId})` : ""
			}`,
		);
		return;
	}

	// Get organization
	const organization = await db.query.organization.findFirst({
		where: {
			id: { eq: originalTransaction.organizationId },
		},
	});

	if (!organization) {
		logger.error(
			`Organization not found: ${originalTransaction.organizationId}`,
		);
		return;
	}

	// Fetch refunds for this charge since they're not expanded in webhook events
	const refundsResponse = await getStripe().refunds.list({
		charge: charge.id,
		limit: 1,
	});

	const latestRefund = refundsResponse.data[0];
	if (!latestRefund) {
		logger.error(
			`No refund data found for charge ${charge.id} despite charge.refunded event`,
		);
		return;
	}

	// Use the latest refund's amount, not charge.amount_refunded, which is the
	// cumulative total refunded on the charge and over-counts on every refund
	// after the first.
	const refundAmountInDollars = latestRefund.amount / 100;
	const originalAmount = Number.parseFloat(originalTransaction.amount ?? "0");
	const originalCreditAmount = Number.parseFloat(
		originalTransaction.creditAmount ?? "0",
	);

	// Only credit_topup purchases add to organization.credits, so only those
	// refunds should deduct credits back. Dev plan, chat plan, and subscription
	// refunds are recorded for revenue reporting only — those plans use virtual
	// plan credits, and the subscription cancel/end webhooks handle the plan
	// state changes separately.
	const isCreditTopup = originalTransaction.type === "credit_topup";

	// Calculate proportional credit refund
	const refundRatio =
		originalAmount > 0 ? refundAmountInDollars / originalAmount : 0;
	const creditRefundAmount = isCreditTopup
		? originalCreditAmount * refundRatio
		: 0;

	// Dedupe by the Stripe refund id (unique per individual refund). Earlier
	// we keyed on amount, but charge.refunded retries on the same refund carry
	// the same amount as legitimate subsequent partial refunds, so amount is
	// not a reliable key.
	const existingRefund = await db.query.transaction.findFirst({
		where: {
			stripeRefundId: { eq: latestRefund.id },
			type: { eq: "credit_refund" },
		},
	});

	if (existingRefund) {
		logger.info(
			`Refund already processed for transaction ${originalTransaction.id} (refund ${latestRefund.id})`,
		);
		return;
	}

	// Create refund transaction
	await db.insert(tables.transaction).values({
		organizationId: originalTransaction.organizationId,
		type: "credit_refund",
		amount: refundAmountInDollars.toString(),
		creditAmount: (-creditRefundAmount).toString(),
		currency: originalTransaction.currency,
		status: "completed",
		stripePaymentIntentId: payment_intent as string,
		stripeRefundId: latestRefund.id,
		relatedTransactionId: originalTransaction.id,
		refundReason: latestRefund.reason ?? null,
		description: `Credit refund: $${refundAmountInDollars.toFixed(2)} (${(refundRatio * 100).toFixed(1)}% of original purchase)`,
	});

	// Deduct credits from organization (allow negative) — only for credit_topup
	// refunds, since dev plan / subscription purchases don't add to credits.
	if (isCreditTopup && creditRefundAmount !== 0) {
		await db
			.update(tables.organization)
			.set({
				credits: sql`${tables.organization.credits} - ${creditRefundAmount}`,
			})
			.where(eq(tables.organization.id, originalTransaction.organizationId));
	}

	// A full refund of a Reset Pass claws back one unredeemed pass from the
	// tier-bound inventory the purchase granted, clamped at zero when the pass
	// was already redeemed — a refunded purchase must not leave a free pass
	// behind. The tier comes from the PaymentIntent metadata stamped by the
	// purchase route.
	if (originalTransaction.type === "dev_plan_reset_pass" && charge.refunded) {
		const refundedIntent = await getStripe().paymentIntents.retrieve(
			payment_intent as string,
		);
		const tierValue = refundedIntent.metadata?.devPlan;
		const tier =
			tierValue && tierValue in DEV_PLAN_RESET_PASS_PRICES
				? (tierValue as DevPlanTier)
				: null;
		if (!tier) {
			logger.error(
				"Refunded Reset Pass has no valid tier in its payment intent metadata",
				{ paymentIntentId: refundedIntent.id },
			);
		} else {
			const clawback =
				tier === "lite"
					? {
							devPlanResetPassesLite: sql`GREATEST(${tables.organization.devPlanResetPassesLite} - 1, 0)`,
						}
					: tier === "pro"
						? {
								devPlanResetPassesPro: sql`GREATEST(${tables.organization.devPlanResetPassesPro} - 1, 0)`,
							}
						: {
								devPlanResetPassesMax: sql`GREATEST(${tables.organization.devPlanResetPassesMax} - 1, 0)`,
							};
			await db
				.update(tables.organization)
				.set(clawback)
				.where(eq(tables.organization.id, organization.id));
			logger.info(
				`Clawed back one ${tier} Reset Pass after full refund for organization ${organization.id}`,
			);
		}
	}

	// A full refund of a dev/chat plan payment ends the plan — cancel the Stripe
	// subscription so the customer isn't left refunded-but-still-subscribed.
	// Handling it here (rather than only in the self-refund endpoint) covers every
	// refund source: the self-service dashboard, the admin panel, and manual
	// refunds issued straight from the Stripe dashboard. Cancelling emits
	// customer.subscription.deleted, which resets the plan fields and records the
	// *_plan_end transaction. Gated on a full refund so a partial refund doesn't
	// tear down the whole plan. A refunded Reset Pass is a one-off purchase, not
	// a plan payment — it must never cancel the underlying subscription.
	if (charge.refunded) {
		const planSubscriptionId =
			originalTransaction.type.startsWith("dev_plan") &&
			originalTransaction.type !== "dev_plan_reset_pass"
				? organization.devPlanStripeSubscriptionId
				: originalTransaction.type.startsWith("chat_plan")
					? organization.chatPlanStripeSubscriptionId
					: null;
		if (planSubscriptionId) {
			try {
				await getStripe().subscriptions.cancel(planSubscriptionId);
				logger.info(
					`Cancelled subscription ${planSubscriptionId} after full refund of ${originalTransaction.type} for organization ${organization.id}`,
				);
			} catch (error) {
				logger.error(
					`Refund recorded but cancelling subscription ${planSubscriptionId} failed for organization ${organization.id}`,
					error as Error,
				);
			}
		}
	}

	// Notify the internal Discord channel, mirroring the purchase notification.
	// Runs after the transaction insert (which is guarded by the stripeRefundId
	// dedupe check above), so webhook retries won't double-notify.
	if (organization.billingEmail) {
		const refundUser = await db.query.user.findFirst({
			where: { email: { eq: organization.billingEmail } },
		});
		await notifyRefund(
			organization.billingEmail,
			refundUser?.name,
			refundAmountInDollars,
			refundProductLabel(originalTransaction.type),
		);
	}

	// Track in PostHog
	posthog.groupIdentify({
		groupType: "organization",
		groupKey: originalTransaction.organizationId,
		properties: {
			name: organization.name,
		},
	});
	posthog.capture({
		distinctId: "organization",
		event: "credits_refunded",
		groups: {
			organization: originalTransaction.organizationId,
		},
		properties: {
			refundAmount: refundAmountInDollars,
			creditRefundAmount: creditRefundAmount,
			refundRatio: refundRatio,
			originalTransactionId: originalTransaction.id,
			organization: originalTransaction.organizationId,
			reason: latestRefund.reason,
		},
	});

	logger.info(
		`Processed refund for organization ${originalTransaction.organizationId} ` +
			`(${originalTransaction.type}): refunded $${refundAmountInDollars}` +
			(isCreditTopup ? ` (${creditRefundAmount} credits deducted)` : ""),
	);
}

async function handleSetupIntentSucceeded(
	event: Stripe.SetupIntentSucceededEvent,
) {
	const setupIntent = event.data.object;
	const { metadata, payment_method } = setupIntent;
	const organizationId = metadata?.organizationId;

	if (!organizationId || !payment_method) {
		logger.warn(
			`Missing organizationId or payment_method in setupIntent: ${event.id} ${setupIntent.id}`,
			{
				hasOrganizationId: !!organizationId,
				hasPaymentMethod: !!payment_method,
				metadata: setupIntent.metadata,
				paymentMethod: payment_method,
				setupIntentStatus: setupIntent.status,
				customer: setupIntent.customer,
			},
		);
		return;
	}

	let stripeCustomerId;
	try {
		stripeCustomerId = await ensureStripeCustomer(organizationId);
	} catch (error) {
		logger.error(`Error ensuring Stripe customer: ${error} ${organizationId}`);
		return;
	}

	const paymentMethodId =
		typeof payment_method === "string" ? payment_method : payment_method.id;

	// Idempotent: skip if already saved (e.g. by confirm-setup endpoint)
	const alreadySaved = await db.query.paymentMethod.findFirst({
		where: { stripePaymentMethodId: paymentMethodId, organizationId },
	});
	if (alreadySaved) {
		return;
	}

	const paymentMethod =
		await getStripe().paymentMethods.retrieve(paymentMethodId);

	// Setup intents created with a customer come out of confirmation already
	// attached; only PMs from legacy customer-less setup intents still need the
	// manual attach here.
	const attachedCustomerId =
		typeof paymentMethod.customer === "string"
			? paymentMethod.customer
			: (paymentMethod.customer?.id ?? null);

	if (!attachedCustomerId) {
		try {
			await getStripe().paymentMethods.attach(paymentMethodId, {
				customer: stripeCustomerId,
			});
		} catch (error) {
			// A PM consumed by a payment (or detached) before this webhook ran can
			// never be attached — failing the webhook would only make Stripe retry
			// a permanently invalid request for days.
			if (error instanceof Stripe.errors.StripeInvalidRequestError) {
				logger.warn("Skipping unattachable payment method from setup intent", {
					paymentMethodId,
					organizationId,
					stripeMessage: error.message,
				});
				return;
			}
			throw error;
		}
	} else if (attachedCustomerId !== stripeCustomerId) {
		logger.warn("Setup intent payment method is attached to another customer", {
			paymentMethodId,
			organizationId,
			attachedCustomerId,
			expectedCustomerId: stripeCustomerId,
		});
		return;
	}

	// Check for duplicate card by fingerprint
	if (paymentMethod.type === "card" && paymentMethod.card?.fingerprint) {
		const existingMethods = await db.query.paymentMethod.findMany({
			where: { organizationId },
		});

		for (const existing of existingMethods) {
			const stripeMethod = await getStripe().paymentMethods.retrieve(
				existing.stripePaymentMethodId,
			);
			if (stripeMethod.card?.fingerprint === paymentMethod.card.fingerprint) {
				logger.warn(
					`Duplicate card detected for organization ${organizationId}, detaching`,
				);
				await getStripe().paymentMethods.detach(paymentMethodId);
				return;
			}
		}
	}

	const existingPaymentMethods = await db.query.paymentMethod.findMany({
		where: {
			organizationId,
		},
	});

	const isDefault = existingPaymentMethods.length === 0;

	await db.insert(tables.paymentMethod).values({
		stripePaymentMethodId: paymentMethodId,
		organizationId,
		type: paymentMethod.type,
		isDefault,
	});
}
