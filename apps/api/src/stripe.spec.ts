import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

import {
	handleChargeRefunded,
	handlePaymentIntentFailed,
	stripeRoutes,
} from "./stripe.js";
import { deleteAll } from "./testing.js";

import type * as PaymentsModule from "./routes/payments.js";
import type * as EmailModule from "./utils/email.js";

const stripeMock = vi.hoisted(() => ({
	refunds: { list: vi.fn() },
	invoices: { list: vi.fn(), retrieve: vi.fn() },
	invoicePayments: { list: vi.fn() },
	subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
	paymentIntents: { retrieve: vi.fn() },
	paymentMethods: { retrieve: vi.fn() },
	webhooks: { constructEvent: vi.fn() },
}));

vi.mock("./routes/payments.js", async (importOriginal) => {
	const original = await importOriginal<typeof PaymentsModule>();
	return {
		...original,
		getStripe: () => stripeMock,
	};
});

vi.mock("./utils/email.js", async (importOriginal) => {
	const original = await importOriginal<typeof EmailModule>();
	return {
		...original,
		sendTransactionalEmail: vi.fn(),
	};
});

vi.mock("./posthog.js", () => ({
	posthog: {
		capture: vi.fn(),
		groupIdentify: vi.fn(),
	},
}));

const { sendTransactionalEmail } = await import("./utils/email.js");
const sendEmailMock = vi.mocked(sendTransactionalEmail);

const ORG_ID = "test-org-feedback";
const SUB_ID = "sub_test_feedback_001";

async function seedDevPlanOrg(opts?: {
	devPlanCancelled?: boolean;
	kind?: "default" | "devpass" | "chat";
}) {
	await db.insert(tables.organization).values({
		id: ORG_ID,
		name: "Acme Co",
		billingEmail: "billing@acme.test",
		kind: opts?.kind ?? "default",
		devPlan: "pro",
		devPlanCreditsLimit: "100",
		devPlanCreditsUsed: "0",
		devPlanStripeSubscriptionId: SUB_ID,
		devPlanCancelled: opts?.devPlanCancelled ?? false,
	});
}

function makeFailedPaymentIntentEvent(overrides: {
	amount: number;
	metadata: Record<string, string>;
	id?: string;
	error?: { message: string; code?: string; decline_code?: string };
}): Stripe.PaymentIntentPaymentFailedEvent {
	return {
		id: "evt_test_pi_failed",
		type: "payment_intent.payment_failed",
		data: {
			object: {
				id: overrides.id ?? "pi_test_failed_001",
				customer: "cus_test_pi_failed",
				amount: overrides.amount,
				currency: "usd",
				metadata: overrides.metadata,
				last_payment_error: overrides.error ?? {
					message: "Your card was declined.",
					code: "card_declined",
					decline_code: "generic_decline",
				},
			},
		},
	} as unknown as Stripe.PaymentIntentPaymentFailedEvent;
}

describe("handlePaymentIntentFailed — dunning email links", () => {
	beforeEach(async () => {
		await deleteAll();
		sendEmailMock.mockClear();
		stripeMock.invoicePayments.list.mockReset();
		stripeMock.invoices.retrieve.mockReset();
		vi.stubEnv("CODE_URL", "https://code.test");
		vi.stubEnv("UI_URL", "https://ui.test");
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await deleteAll();
	});

	function sentHtml(): string {
		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		return sendEmailMock.mock.calls[0][0].html ?? "";
	}

	test("sends DevPass customers to the DevPass billing page", async () => {
		await seedDevPlanOrg({ kind: "devpass" });

		await handlePaymentIntentFailed(
			makeFailedPaymentIntentEvent({
				amount: 7900,
				metadata: { organizationId: ORG_ID },
			}),
		);

		const html = sentHtml();
		expect(html).toContain('href="https://code.test/dashboard/billing"');
		expect(html).toContain("Update Payment Method");
		expect(html).not.toContain("settings/org/billing");
		expect(stripeMock.invoicePayments.list).not.toHaveBeenCalled();
	});

	test("sends team organizations to their own billing page", async () => {
		await seedDevPlanOrg({ kind: "default" });

		await handlePaymentIntentFailed(
			makeFailedPaymentIntentEvent({
				amount: 5000,
				metadata: { organizationId: ORG_ID },
			}),
		);

		expect(sentHtml()).toContain(
			`href="https://ui.test/dashboard/${ORG_ID}/org/billing"`,
		);
	});

	test("links the hosted invoice when the bank requires authentication", async () => {
		await seedDevPlanOrg({ kind: "devpass" });
		stripeMock.invoicePayments.list.mockResolvedValue({
			data: [{ invoice: "in_test_renewal" }],
		});
		stripeMock.invoices.retrieve.mockResolvedValue({
			id: "in_test_renewal",
			hosted_invoice_url: "https://invoice.stripe.com/i/test_renewal",
		});

		await handlePaymentIntentFailed(
			makeFailedPaymentIntentEvent({
				amount: 7900,
				metadata: { organizationId: ORG_ID },
				error: {
					message:
						"Your card was declined. This transaction requires authentication.",
					code: "authentication_required",
				},
			}),
		);

		const html = sentHtml();
		expect(html).toContain('href="https://invoice.stripe.com/i/test_renewal"');
		expect(html).toContain("Complete Payment");
		expect(html).toContain("https://code.test/dashboard/billing");
		expect(html).toContain("asked to verify this payment");
		expect(stripeMock.invoices.retrieve).toHaveBeenCalledWith(
			"in_test_renewal",
		);
	});

	test("still emails when the hosted invoice cannot be resolved", async () => {
		await seedDevPlanOrg({ kind: "devpass" });
		stripeMock.invoicePayments.list.mockRejectedValue(
			new Error("stripe unavailable"),
		);

		await handlePaymentIntentFailed(
			makeFailedPaymentIntentEvent({
				amount: 7900,
				metadata: { organizationId: ORG_ID },
				error: {
					message: "Your card was declined.",
					code: "authentication_required",
				},
			}),
		);

		const html = sentHtml();
		expect(html).toContain('href="https://code.test/dashboard/billing"');
		expect(html).not.toContain("invoice.stripe.com");
	});
});

describe("handlePaymentIntentFailed — subscription invoice vs credit top-up", () => {
	beforeEach(async () => {
		await deleteAll();
		sendEmailMock.mockClear();
	});

	afterEach(async () => {
		await db.delete(tables.transaction);
		await deleteAll();
	});

	test("does not record a credit_topup for a failed subscription invoice payment", async () => {
		await seedDevPlanOrg();

		await handlePaymentIntentFailed(
			makeFailedPaymentIntentEvent({
				amount: 7900,
				metadata: {
					organizationId: ORG_ID,
					subscriptionType: "dev_plan",
				},
			}),
		);

		const txns = await db.query.transaction.findMany({
			where: { organizationId: { eq: ORG_ID } },
		});
		expect(txns).toHaveLength(0);

		// Subscription-failure tracking still runs (count bumped, dunning email).
		const org = await db.query.organization.findFirst({
			where: { id: { eq: ORG_ID } },
		});
		expect(org?.paymentFailureCount).toBe(1);
		expect(sendEmailMock).toHaveBeenCalledTimes(1);
	});

	test("records a credit_topup for a failed manual credit purchase", async () => {
		await seedDevPlanOrg();

		await handlePaymentIntentFailed(
			makeFailedPaymentIntentEvent({
				amount: 5150,
				metadata: {
					organizationId: ORG_ID,
					baseAmount: "50",
				},
			}),
		);

		const txns = await db.query.transaction.findMany({
			where: { organizationId: { eq: ORG_ID } },
		});
		expect(txns).toHaveLength(1);
		expect(txns[0].type).toBe("credit_topup");
		expect(txns[0].status).toBe("failed");
		expect(txns[0].creditAmount).toBe("50");
	});
});

function makeChargeRefundedEvent(overrides: {
	paymentIntentId: string;
	customer: string;
	refunded?: boolean;
}): Stripe.ChargeRefundedEvent {
	return {
		id: "evt_test_charge_refunded",
		type: "charge.refunded",
		data: {
			object: {
				id: "ch_test_refund_001",
				payment_intent: overrides.paymentIntentId,
				customer: overrides.customer,
				// true when the charge is fully refunded; false for a partial refund.
				refunded: overrides.refunded ?? false,
				// Current Stripe API versions omit the invoice link on the charge.
				invoice: null,
			},
		},
	} as unknown as Stripe.ChargeRefundedEvent;
}

describe("handleChargeRefunded — dev plan refund tracking", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await deleteAll();
	});

	afterEach(async () => {
		await db.delete(tables.transaction);
		await deleteAll();
	});

	test("records a refund for a dev_plan_start that stored only the invoice id", async () => {
		// The DevPass setup-mode checkout records dev_plan_start with the invoice id
		// but no payment intent, and current Stripe API versions no longer expose the
		// invoice link on the refunded charge. The handler must resolve the invoice
		// from the customer's invoices and still record the refund.
		await db.insert(tables.organization).values({
			id: ORG_ID,
			name: "Acme Co",
			billingEmail: "billing@acme.test",
			stripeCustomerId: "cus_devpass_refund",
			devPlan: "pro",
			devPlanCreditsLimit: "237",
			devPlanStripeSubscriptionId: SUB_ID,
		});
		const [original] = await db
			.insert(tables.transaction)
			.values({
				organizationId: ORG_ID,
				type: "dev_plan_start",
				amount: "79",
				creditAmount: "237",
				currency: "USD",
				status: "completed",
				stripeInvoiceId: "in_devpass_refund",
				description: "Dev Plan PRO started via Stripe Checkout",
			})
			.returning();

		// No payment-intent match; resolve the invoice by scanning the customer's
		// invoices for the one this payment intent paid.
		stripeMock.invoicePayments.list.mockResolvedValue({
			data: [{ invoice: "in_devpass_refund" }],
		});
		stripeMock.refunds.list.mockResolvedValue({
			data: [{ id: "re_devpass_refund", amount: 7900, reason: null }],
		});

		await handleChargeRefunded(
			makeChargeRefundedEvent({
				paymentIntentId: "pi_devpass_refund",
				customer: "cus_devpass_refund",
			}),
		);

		const refund = await db.query.transaction.findFirst({
			where: { stripeRefundId: { eq: "re_devpass_refund" } },
		});
		expect(refund?.type).toBe("credit_refund");
		expect(refund?.amount).toBe("79");
		expect(refund?.relatedTransactionId).toBe(original.id);

		// A dev plan refund is recorded for reporting only; it must not deduct from
		// the org's pay-as-you-go credit balance.
		const org = await db.query.organization.findFirst({
			where: { id: { eq: ORG_ID } },
		});
		expect(org?.credits).toBe("0");
	});

	test("cancels the subscription on a full dev plan refund", async () => {
		await db.insert(tables.organization).values({
			id: ORG_ID,
			name: "Acme Co",
			billingEmail: "billing@acme.test",
			stripeCustomerId: "cus_devpass_refund",
			devPlan: "pro",
			devPlanCreditsLimit: "237",
			devPlanStripeSubscriptionId: SUB_ID,
		});
		await db.insert(tables.transaction).values({
			organizationId: ORG_ID,
			type: "dev_plan_start",
			amount: "79",
			currency: "USD",
			status: "completed",
			stripeInvoiceId: "in_devpass_refund",
		});

		stripeMock.invoicePayments.list.mockResolvedValue({
			data: [{ invoice: "in_devpass_refund" }],
		});
		stripeMock.refunds.list.mockResolvedValue({
			data: [{ id: "re_devpass_refund", amount: 7900, reason: null }],
		});

		await handleChargeRefunded(
			makeChargeRefundedEvent({
				paymentIntentId: "pi_devpass_refund",
				customer: "cus_devpass_refund",
				refunded: true,
			}),
		);

		expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith(SUB_ID);
	});

	test("does not cancel the subscription on a partial dev plan refund", async () => {
		await db.insert(tables.organization).values({
			id: ORG_ID,
			name: "Acme Co",
			billingEmail: "billing@acme.test",
			stripeCustomerId: "cus_devpass_refund",
			devPlan: "pro",
			devPlanCreditsLimit: "237",
			devPlanStripeSubscriptionId: SUB_ID,
		});
		await db.insert(tables.transaction).values({
			organizationId: ORG_ID,
			type: "dev_plan_start",
			amount: "79",
			currency: "USD",
			status: "completed",
			stripeInvoiceId: "in_devpass_refund",
		});

		stripeMock.invoicePayments.list.mockResolvedValue({
			data: [{ invoice: "in_devpass_refund" }],
		});
		stripeMock.refunds.list.mockResolvedValue({
			data: [{ id: "re_devpass_partial", amount: 1000, reason: null }],
		});

		await handleChargeRefunded(
			makeChargeRefundedEvent({
				paymentIntentId: "pi_devpass_refund",
				customer: "cus_devpass_refund",
				refunded: false,
			}),
		);

		expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
	});

	test("does not double-record when the same refund is delivered twice", async () => {
		await db.insert(tables.organization).values({
			id: ORG_ID,
			name: "Acme Co",
			billingEmail: "billing@acme.test",
			stripeCustomerId: "cus_devpass_refund",
			devPlan: "pro",
			devPlanCreditsLimit: "237",
			devPlanStripeSubscriptionId: SUB_ID,
		});
		await db.insert(tables.transaction).values({
			organizationId: ORG_ID,
			type: "dev_plan_start",
			amount: "79",
			currency: "USD",
			status: "completed",
			stripeInvoiceId: "in_devpass_refund",
		});

		stripeMock.invoicePayments.list.mockResolvedValue({
			data: [{ invoice: "in_devpass_refund" }],
		});
		stripeMock.refunds.list.mockResolvedValue({
			data: [{ id: "re_devpass_refund", amount: 7900, reason: null }],
		});

		const event = makeChargeRefundedEvent({
			paymentIntentId: "pi_devpass_refund",
			customer: "cus_devpass_refund",
		});
		await handleChargeRefunded(event);
		await handleChargeRefunded(event);

		const refunds = await db.query.transaction.findMany({
			where: { stripeRefundId: { eq: "re_devpass_refund" } },
		});
		expect(refunds).toHaveLength(1);
	});

	test("records a refund for a chat_plan_start that stored only the invoice id", async () => {
		// Chat plan checkout records chat_plan_start with the invoice id but no
		// payment intent, exactly like DevPass. The handler must resolve the invoice
		// and record the refund instead of logging "Original transaction not found".
		await db.insert(tables.organization).values({
			id: ORG_ID,
			name: "Acme Co",
			billingEmail: "billing@acme.test",
			stripeCustomerId: "cus_chat_refund",
			chatPlan: "pro",
			chatPlanCreditsLimit: "100",
			chatPlanStripeSubscriptionId: SUB_ID,
		});
		const [original] = await db
			.insert(tables.transaction)
			.values({
				organizationId: ORG_ID,
				type: "chat_plan_start",
				amount: "20",
				creditAmount: "100",
				currency: "USD",
				status: "completed",
				stripeInvoiceId: "in_chat_refund",
				description: "Chat Plan PRO started via Stripe Checkout",
			})
			.returning();

		stripeMock.invoicePayments.list.mockResolvedValue({
			data: [{ invoice: "in_chat_refund" }],
		});
		stripeMock.refunds.list.mockResolvedValue({
			data: [{ id: "re_chat_refund", amount: 2000, reason: null }],
		});

		await handleChargeRefunded(
			makeChargeRefundedEvent({
				paymentIntentId: "pi_chat_refund",
				customer: "cus_chat_refund",
			}),
		);

		const refund = await db.query.transaction.findFirst({
			where: { stripeRefundId: { eq: "re_chat_refund" } },
		});
		expect(refund?.type).toBe("credit_refund");
		expect(refund?.amount).toBe("20");
		expect(refund?.relatedTransactionId).toBe(original.id);

		// Chat plans use virtual plan credits, so the refund must not deduct from the
		// org's pay-as-you-go credit balance.
		const org = await db.query.organization.findFirst({
			where: { id: { eq: ORG_ID } },
		});
		expect(org?.credits).toBe("0");
	});

	test("records a refund for a chat_plan_upgrade paid mid-cycle charge", async () => {
		// A mid-cycle chat plan upgrade is recorded by the invoice.payment_succeeded
		// webhook with the proration invoice's payment intent and invoice id, so a
		// refund of that charge resolves directly by payment intent.
		await db.insert(tables.organization).values({
			id: ORG_ID,
			name: "Acme Co",
			billingEmail: "billing@acme.test",
			stripeCustomerId: "cus_chat_upgrade_refund",
			chatPlan: "pro",
			chatPlanCreditsLimit: "100",
			chatPlanStripeSubscriptionId: SUB_ID,
		});
		const [original] = await db
			.insert(tables.transaction)
			.values({
				organizationId: ORG_ID,
				type: "chat_plan_upgrade",
				amount: "10",
				currency: "USD",
				status: "completed",
				stripeInvoiceId: "in_chat_upgrade",
				stripePaymentIntentId: "pi_chat_upgrade",
				description: "Chat Plan PRO upgrade",
			})
			.returning();

		stripeMock.refunds.list.mockResolvedValue({
			data: [{ id: "re_chat_upgrade", amount: 1000, reason: null }],
		});

		await handleChargeRefunded(
			makeChargeRefundedEvent({
				paymentIntentId: "pi_chat_upgrade",
				customer: "cus_chat_upgrade_refund",
			}),
		);

		const refund = await db.query.transaction.findFirst({
			where: { stripeRefundId: { eq: "re_chat_upgrade" } },
		});
		expect(refund?.type).toBe("credit_refund");
		expect(refund?.amount).toBe("10");
		expect(refund?.relatedTransactionId).toBe(original.id);

		const org = await db.query.organization.findFirst({
			where: { id: { eq: ORG_ID } },
		});
		expect(org?.credits).toBe("0");
	});
});

describe("webhook route — invalid signature", () => {
	const realStripe = new Stripe("sk_test_dummy");

	afterEach(() => {
		stripeMock.webhooks.constructEvent.mockReset();
	});

	test("logs a warning and returns 400 for a bogus signature", async () => {
		const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
		process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
		// Defer to the real Stripe SDK so an actual
		// StripeSignatureVerificationError is thrown, exercising the handler's
		// instanceof branch rather than a hand-rolled error.
		stripeMock.webhooks.constructEvent.mockImplementation(
			(body: string, sig: string, secret: string) =>
				realStripe.webhooks.constructEvent(body, sig, secret),
		);
		const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

		try {
			const res = await stripeRoutes.request("/webhook", {
				method: "POST",
				headers: { "stripe-signature": "fake_signature" },
				body: JSON.stringify({ type: "checkout.session.completed" }),
			});

			expect(res.status).toBe(400);
			expect(await res.text()).toContain("Invalid signature");
			expect(warnSpy).toHaveBeenCalledWith(
				"Ignoring Stripe webhook with invalid signature",
				expect.objectContaining({ message: expect.any(String) }),
			);
		} finally {
			warnSpy.mockRestore();
			if (previousSecret === undefined) {
				delete process.env.STRIPE_WEBHOOK_SECRET;
			} else {
				process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
			}
		}
	});
});
