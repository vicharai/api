import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import { getDodo } from "@/billing/dodo.js";
import { computeReferralBonus } from "@/lib/referral-bonus.js";
import { notifyCreditsPurchased } from "@/utils/discord.js";
import {
	generatePaymentFailureEmailHtml,
	sendTransactionalEmail,
} from "@/utils/email.js";
import { generateAndEmailInvoice } from "@/utils/invoice.js";

import { and, db, eq, inArray, sql, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

import type { ServerTypes } from "@/vars.js";
import type { UnwrapWebhookEvent } from "dodopayments/resources/webhooks";

export const dodoWebhooks = new OpenAPIHono<ServerTypes>();

const AUTO_TOPUP_MAX_FAILURES = 3;

async function applyReferralBonus({
	organizationId,
	creditAmount,
	isEmailVerified,
}: {
	organizationId: string;
	creditAmount: number;
	isEmailVerified: boolean;
}): Promise<{ finalCreditAmount: number; bonusAmount: number }> {
	if (!isEmailVerified) {
		return { finalCreditAmount: creditAmount, bonusAmount: 0 };
	}

	const previousPurchases = await db.query.transaction.findMany({
		where: {
			organizationId: { eq: organizationId },
			type: { eq: "credit_topup" },
			status: { eq: "completed" },
		},
		orderBy: { createdAt: "asc" },
		limit: 1,
	});
	if (previousPurchases.length > 0) {
		return { finalCreditAmount: creditAmount, bonusAmount: 0 };
	}

	const bonusAmount = await computeReferralBonus(organizationId, creditAmount);
	if (bonusAmount > 0) {
		logger.info(
			`Applied referral signup bonus of $${bonusAmount} to organization ${organizationId}`,
		);
		return { finalCreditAmount: creditAmount + bonusAmount, bonusAmount };
	}
	return { finalCreditAmount: creditAmount, bonusAmount: 0 };
}

async function orgBillingEmail(org: {
	id: string;
	billingEmail: string | null;
}): Promise<string | null> {
	if (org.billingEmail) {
		return org.billingEmail;
	}
	const owner = await db.query.userOrganization.findFirst({
		where: {
			organizationId: { eq: org.id },
			role: { eq: "owner" },
		},
		with: { user: true },
	});
	return owner?.user?.email ?? null;
}

/**
 * Complete a pending credit_topup transaction and credit the org, guarded by
 * a conditional status flip so duplicate webhook deliveries are no-ops.
 */
async function handlePaymentSucceeded(
	payment: Extract<UnwrapWebhookEvent, { type: "payment.succeeded" }>["data"],
): Promise<void> {
	const metadata = payment.metadata;
	const purpose = metadata?.purpose;
	if (purpose !== "credit_topup" && purpose !== "auto_top_up") {
		logger.info("Ignoring payment.succeeded with unknown purpose", {
			purpose,
		});
		return;
	}

	const transactionId = metadata?.transactionId as string | undefined;
	const organizationId = metadata?.organizationId as string | undefined;
	if (!transactionId || !organizationId) {
		logger.warn("payment.succeeded missing metadata, skipping", {
			paymentId: payment.payment_id,
		});
		return;
	}

	const transaction = await db.query.transaction.findFirst({
		where: {
			id: { eq: transactionId },
			organizationId: { eq: organizationId },
		},
	});
	if (!transaction) {
		logger.warn("payment.succeeded for unknown transaction, skipping", {
			transactionId,
			organizationId,
			paymentId: payment.payment_id,
		});
		return;
	}
	if (transaction.status === "completed") {
		logger.info("Duplicate payment.succeeded, already credited", {
			transactionId,
		});
		return;
	}

	if (payment.currency !== "USD") {
		logger.error("payment.succeeded in unexpected currency", {
			transactionId,
			currency: payment.currency,
		});
		await db
			.update(tables.transaction)
			.set({ status: "failed", dodoPaymentId: payment.payment_id })
			.where(eq(tables.transaction.id, transactionId));
		return;
	}

	// total_amount includes tax; the pre-tax amount must equal the gross we
	// stored on the transaction.
	const paidCents = (payment.total_amount ?? 0) - (payment.tax ?? 0);
	const expectedCents = Math.round(Number(transaction.amount) * 100);
	if (paidCents !== expectedCents) {
		logger.error("payment.succeeded amount mismatch, refusing to credit", {
			transactionId,
			paidCents,
			expectedCents,
			paymentId: payment.payment_id,
		});
		await db
			.update(tables.transaction)
			.set({ status: "failed", dodoPaymentId: payment.payment_id })
			.where(eq(tables.transaction.id, transactionId));
		return;
	}

	const organization = await db.query.organization.findFirst({
		where: { id: { eq: organizationId } },
	});
	if (!organization) {
		logger.error("payment.succeeded for missing organization", {
			organizationId,
		});
		return;
	}
	if (
		organization.dodoCustomerId &&
		payment.customer?.customer_id &&
		organization.dodoCustomerId !== payment.customer.customer_id
	) {
		logger.error("payment.succeeded customer mismatch, refusing to credit", {
			transactionId,
			organizationId,
			paymentId: payment.payment_id,
		});
		return;
	}

	const orgUser = await db.query.userOrganization.findFirst({
		where: { organizationId: { eq: organizationId } },
		with: { user: true },
	});

	const creditAmount = Number(transaction.creditAmount);
	const { finalCreditAmount, bonusAmount } = await applyReferralBonus({
		organizationId,
		creditAmount,
		isEmailVerified: orgUser?.user?.emailVerified ?? false,
	});

	await db.transaction(async (tx) => {
		const [completed] = await tx
			.update(tables.transaction)
			.set({
				status: "completed",
				dodoPaymentId: payment.payment_id,
				creditAmount: finalCreditAmount.toString(),
			})
			.where(
				and(
					eq(tables.transaction.id, transactionId),
					eq(tables.transaction.status, "pending"),
				),
			)
			.returning();
		if (!completed) {
			return;
		}
		await tx
			.update(tables.organization)
			.set({
				credits: sql`${tables.organization.credits} + ${finalCreditAmount}`,
				paymentFailureCount: 0,
				lastPaymentFailureAt: null,
				paymentFailureStartedAt: null,
				lastTopUpAmount: creditAmount.toString(),
				autoTopUpFailureCount: 0,
				autoTopUpLastFailureAt: null,
			})
			.where(eq(tables.organization.id, organizationId));

		// Reset low-balance email dedup so alerts can fire again on next cycle
		await tx
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
	});

	if (bonusAmount > 0) {
		await db
			.update(tables.transaction)
			.set({
				description: `Credit top-up (+$${bonusAmount.toFixed(2)} referral bonus)`,
			})
			.where(eq(tables.transaction.id, transactionId));
	}

	try {
		await notifyCreditsPurchased({
			email: orgUser?.user?.email ?? organization.billingEmail,
			name: orgUser?.user?.name,
			creditAmount,
			bonusAmount,
			grossAmount: Number(transaction.amount),
			currency: "USD",
			organizationId,
			organizationName: organization.name,
			source: purpose === "auto_top_up" ? "auto_top_up" : "dodo_checkout",
		});
	} catch (e) {
		logger.error("Credits-purchased notification failed", e as Error);
	}

	try {
		await generateAndEmailInvoice({
			organizationId,
			invoiceNumber: transactionId,
			invoiceDate: new Date(),
			organizationName: organization.name,
			billingEmail: organization.billingEmail ?? "",
			billingCompany: organization.billingCompany,
			billingAddress: organization.billingAddress,
			billingTaxId: organization.billingTaxId,
			billingNotes: organization.billingNotes,
			lineItems: [
				{
					description: `Credit Top-up ($${creditAmount})`,
					amount: Number(transaction.amount),
				},
				...(bonusAmount > 0
					? [
							{
								description: `Referral bonus (+$${bonusAmount.toFixed(2)})`,
								amount: 0,
							},
						]
					: []),
			],
			currency: "USD",
		});
	} catch (e) {
		logger.error(
			"Invoice email failed (credit top-up); suppressing webhook failure",
			e as Error,
		);
	}

	logger.info(
		`Credited ${finalCreditAmount} USD to organization ${organizationId} for transaction ${transactionId}`,
	);
}

async function handlePaymentFailed(
	payment: Extract<UnwrapWebhookEvent, { type: "payment.failed" }>["data"],
): Promise<void> {
	const metadata = payment.metadata;
	const transactionId = metadata?.transactionId as string | undefined;
	const organizationId = metadata?.organizationId as string | undefined;

	if (transactionId) {
		await db
			.update(tables.transaction)
			.set({
				status: "failed",
				dodoPaymentId: payment.payment_id,
				description: "Payment failed",
			})
			.where(
				and(
					eq(tables.transaction.id, transactionId),
					eq(tables.transaction.status, "pending"),
				),
			);
	}

	if (metadata?.purpose === "auto_top_up" && organizationId) {
		const org = await db.query.organization.findFirst({
			where: { id: { eq: organizationId } },
		});
		if (!org) {
			return;
		}
		const failures = (org.autoTopUpFailureCount ?? 0) + 1;
		await db
			.update(tables.organization)
			.set({
				autoTopUpFailureCount: failures,
				autoTopUpLastFailureAt: new Date(),
				...(failures >= AUTO_TOPUP_MAX_FAILURES
					? { autoTopUpEnabled: false }
					: {}),
			})
			.where(eq(tables.organization.id, organizationId));
		try {
			const recipient = await orgBillingEmail(org);
			if (recipient) {
				const disabled = failures >= AUTO_TOPUP_MAX_FAILURES;
				await sendTransactionalEmail({
					to: recipient,
					subject: disabled
						? "Auto top-up disabled - update your payment method"
						: "Auto top-up payment failed",
					html: generatePaymentFailureEmailHtml(org, {
						errorMessage:
							"Your auto top-up charge could not be completed." +
							(disabled
								? " Auto top-up has been disabled after repeated failures."
								: ""),
						amount: payment.total_amount
							? payment.total_amount / 100
							: undefined,
						currency: payment.currency ?? "USD",
					}),
					organizationId,
				});
			}
		} catch (e) {
			logger.error("Auto top-up failure email failed", e as Error);
		}

		if (failures >= AUTO_TOPUP_MAX_FAILURES) {
			logger.warn(
				`Disabled auto top-up for organization ${organizationId} after ${failures} consecutive failures`,
			);
		}
	}
}

async function handleSubscriptionEvent(
	event: Extract<
		UnwrapWebhookEvent,
		| { type: "subscription.active" }
		| { type: "subscription.cancelled" }
		| { type: "subscription.failed" }
		| { type: "subscription.expired" }
	>,
): Promise<void> {
	const data = event.data;
	const organizationId = data.metadata?.organizationId as string | undefined;

	if (event.type === "subscription.active") {
		if (data.metadata?.purpose !== "auto_top_up_mandate" || !organizationId) {
			logger.info("Ignoring subscription.active without mandate purpose");
			return;
		}
		const org = await db.query.organization.findFirst({
			where: { id: { eq: organizationId } },
		});
		if (!org || org.dodoCustomerId !== data.customer.customer_id) {
			logger.warn("subscription.active for unknown org/customer, skipping", {
				organizationId,
				customerId: data.customer.customer_id,
			});
			return;
		}
		await db
			.update(tables.organization)
			.set({
				dodoAutoTopUpSubscriptionId: data.subscription_id,
				autoTopUpFailureCount: 0,
				autoTopUpLastFailureAt: null,
			})
			.where(eq(tables.organization.id, organizationId));
		return;
	}

	// Cancelled/failed/expired: only clear the stored mandate when the event
	// belongs to it.
	const org = await db.query.organization.findFirst({
		where: { dodoAutoTopUpSubscriptionId: { eq: data.subscription_id } },
	});
	if (!org) {
		return;
	}
	await db
		.update(tables.organization)
		.set({
			dodoAutoTopUpSubscriptionId: null,
			autoTopUpEnabled: false,
		})
		.where(eq(tables.organization.id, org.id));
}

async function handleRefundEvent(
	event: Extract<
		UnwrapWebhookEvent,
		{ type: "refund.succeeded" } | { type: "refund.failed" }
	>,
): Promise<void> {
	const data = event.data;
	const refundId = data.refund_id;

	const transaction = await db.query.transaction.findFirst({
		where: { dodoRefundId: { eq: refundId } },
	});
	if (!transaction) {
		logger.warn(`${event.type} for unknown refund, skipping`, { refundId });
		return;
	}

	if (event.type === "refund.failed") {
		await db
			.update(tables.transaction)
			.set({ status: "failed" })
			.where(eq(tables.transaction.id, transaction.id));
		return;
	}

	// Guarded status flip keeps duplicate deliveries from double-deducting.
	const deduct = await db.transaction(async (tx) => {
		const [completed] = await tx
			.update(tables.transaction)
			.set({ status: "completed" })
			.where(
				and(
					eq(tables.transaction.id, transaction.id),
					eq(tables.transaction.status, "pending"),
				),
			)
			.returning();
		if (!completed) {
			return null;
		}
		const creditAmount = Math.abs(Number(completed.creditAmount));
		if (creditAmount > 0) {
			await tx
				.update(tables.organization)
				.set({
					credits: sql`${tables.organization.credits} - ${creditAmount}`,
				})
				.where(eq(tables.organization.id, completed.organizationId));
		}
		return completed;
	});

	if (deduct) {
		logger.info(
			`Deducted ${deduct.creditAmount} credits from organization ${deduct.organizationId} for refund ${refundId}`,
		);
		try {
			const refundOrg = await db.query.organization.findFirst({
				where: { id: { eq: deduct.organizationId } },
			});
			const recipient = refundOrg ? await orgBillingEmail(refundOrg) : null;
			if (recipient && refundOrg) {
				await sendTransactionalEmail({
					to: recipient,
					subject: "Your Vichar refund was processed",
					text: `Hi there,

Your refund of $${Math.abs(Number(deduct.amount)).toFixed(2)} for ${refundOrg.name} has been processed. The corresponding credits (${Math.abs(Number(deduct.creditAmount)).toFixed(2)}) have been removed from your balance.

The refund will appear on your original payment method within a few business days.

Best,
The Vichar Team`,
					organizationId: deduct.organizationId,
				});
			}
		} catch (e) {
			logger.error("Refund processed email failed", e as Error);
		}
	}
}

async function handleDisputeEvent(
	event: Extract<
		UnwrapWebhookEvent,
		{ type: "dispute.opened" } | { type: "dispute.lost" }
	>,
): Promise<void> {
	const data = event.data;
	// Disputes carry no metadata; map back to the org through the payment's
	// transaction row.
	const disputedTxn = await db.query.transaction.findFirst({
		where: { dodoPaymentId: { eq: data.payment_id } },
	});
	const organizationId = disputedTxn?.organizationId ?? null;

	if (event.type === "dispute.opened") {
		const org = organizationId
			? await db.query.organization.findFirst({
					where: { id: { eq: organizationId } },
				})
			: null;
		if (!org) {
			logger.warn("dispute.opened could not be mapped to an org", {
				data,
			});
			return;
		}
		await db
			.update(tables.organization)
			.set({ autoTopUpEnabled: false, riskFlagged: true })
			.where(eq(tables.organization.id, org.id));
		logger.warn(
			`Risk-flagged organization ${org.id} after dispute ${data.dispute_id}`,
		);
		return;
	}

	// dispute.lost: deduct the disputed credits if the top-up was not already
	// refunded.
	if (!organizationId) {
		return;
	}
	const disputed = await db.query.transaction.findFirst({
		where: {
			organizationId: { eq: organizationId },
			dodoPaymentId: { eq: data.payment_id },
			type: { eq: "credit_topup" },
			status: { eq: "completed" },
		},
	});
	if (disputed) {
		await db
			.update(tables.organization)
			.set({
				credits: sql`${tables.organization.credits} - ${Number(disputed.creditAmount)}`,
			})
			.where(eq(tables.organization.id, organizationId));
	}
}

dodoWebhooks.post("/", async (c) => {
	const rawBody = await c.req.raw.text();

	let event: UnwrapWebhookEvent;
	try {
		event = getDodo().webhooks.unwrap(rawBody, {
			headers: {
				"webhook-id": c.req.header("webhook-id") ?? "",
				"webhook-signature": c.req.header("webhook-signature") ?? "",
				"webhook-timestamp": c.req.header("webhook-timestamp") ?? "",
			},
		});
	} catch {
		// A 503 (unconfigured key) and bad signatures both surface here; only
		// signature failures should be a 401, so check the key exists first.
		if (!process.env.DODO_PAYMENTS_WEBHOOK_KEY) {
			throw new HTTPException(503, {
				message: "Billing is not configured",
			});
		}
		throw new HTTPException(401, { message: "Invalid webhook signature" });
	}

	logger.info("Dodo webhook received", { eventType: event.type });

	switch (event.type) {
		case "payment.succeeded":
			await handlePaymentSucceeded(event.data);
			break;
		case "payment.failed":
			await handlePaymentFailed(event.data);
			break;
		case "subscription.active":
		case "subscription.cancelled":
		case "subscription.failed":
		case "subscription.expired":
			await handleSubscriptionEvent(event);
			break;
		case "refund.succeeded":
		case "refund.failed":
			await handleRefundEvent(event);
			break;
		case "dispute.opened":
		case "dispute.lost":
			await handleDisputeEvent(event);
			break;
		default:
			logger.info(
				`Ignoring Dodo event type ${(event as { type: string }).type}`,
			);
	}

	return c.json({ received: true });
});
