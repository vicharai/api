import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, eq, tables } from "@llmgateway/db";

const dodoMock = vi.hoisted(() => ({
	webhooks: { unwrap: vi.fn() },
}));

vi.mock("dodopayments", () => ({
	default: function MockDodo() {
		return dodoMock;
	},
}));

const ORG_ID = "test-org-id";

const post = (body = "{}") =>
	app.request("/webhooks/dodo", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"webhook-id": "wh_1",
			"webhook-signature": "sig",
			"webhook-timestamp": "1",
		},
		body,
	});

function paymentSucceededEvent(overrides: Record<string, unknown> = {}) {
	return {
		type: "payment.succeeded",
		data: {
			payment_id: "pay_1",
			currency: "USD",
			total_amount: 2625,
			tax: 0,
			metadata: {
				organizationId: ORG_ID,
				transactionId: "txn-1",
				purpose: "credit_topup",
			},
			...overrides,
		},
	};
}

async function seedPendingTransaction(overrides: Record<string, unknown> = {}) {
	await db.insert(tables.transaction).values({
		id: "txn-1",
		organizationId: ORG_ID,
		type: "credit_topup",
		creditAmount: "25",
		amount: "26.25",
		currency: "USD",
		status: "pending",
		description: "Credit top-up",
		...overrides,
	});
}

async function getOrg() {
	return await db.query.organization.findFirst({
		where: { id: { eq: ORG_ID } },
	});
}

describe("Dodo webhooks", () => {
	beforeEach(async () => {
		await createTestUser();
		vi.stubEnv("DODO_PAYMENTS_API_KEY", "dodo_test_key");
		vi.stubEnv("DODO_PAYMENTS_WEBHOOK_KEY", "whsk_test");

		await db.insert(tables.organization).values({
			id: ORG_ID,
			name: "Test Organization",
			billingEmail: "admin@example.com",
			credits: "0",
			dodoCustomerId: "cus_dodo_1",
		});
		await db.insert(tables.userOrganization).values({
			userId: "test-user-id",
			organizationId: ORG_ID,
			role: "owner",
		});

		dodoMock.webhooks.unwrap.mockReset();
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await deleteAll();
	});

	it("rejects an invalid signature with 401", async () => {
		dodoMock.webhooks.unwrap.mockImplementation(() => {
			throw new Error("invalid signature");
		});
		const res = await post();
		expect(res.status).toBe(401);
	});

	it("credits exactly once on duplicate payment.succeeded", async () => {
		await seedPendingTransaction();
		const event = paymentSucceededEvent();
		dodoMock.webhooks.unwrap.mockReturnValue(event);

		for (let i = 0; i < 2; i++) {
			const res = await post();
			expect(res.status).toBe(200);
		}
		expect(Number((await getOrg())?.credits)).toBe(25);
		const txn = await db.query.transaction.findFirst({
			where: { id: { eq: "txn-1" } },
		});
		expect(txn?.status).toBe("completed");
		expect(txn?.dodoPaymentId).toBe("pay_1");
	});

	it("credits exactly once on concurrent duplicate delivery", async () => {
		await seedPendingTransaction();
		dodoMock.webhooks.unwrap.mockReturnValue(paymentSucceededEvent());

		const results = await Promise.all([post(), post()]);
		expect(results.map((r) => r.status)).toEqual([200, 200]);
		expect(Number((await getOrg())?.credits)).toBe(25);
	});

	it("refuses to credit on amount mismatch and fails the transaction", async () => {
		await seedPendingTransaction();
		dodoMock.webhooks.unwrap.mockReturnValue(
			paymentSucceededEvent({ total_amount: 9999 }),
		);

		const res = await post();
		expect(res.status).toBe(200);
		expect(Number((await getOrg())?.credits)).toBe(0);
		const txn = await db.query.transaction.findFirst({
			where: { id: { eq: "txn-1" } },
		});
		expect(txn?.status).toBe("failed");
	});

	it("does not credit when metadata points at another org", async () => {
		await seedPendingTransaction();
		dodoMock.webhooks.unwrap.mockReturnValue(
			paymentSucceededEvent({
				metadata: {
					organizationId: "other-org-id",
					transactionId: "txn-1",
					purpose: "credit_topup",
				},
			}),
		);

		const res = await post();
		expect(res.status).toBe(200);
		expect(Number((await getOrg())?.credits)).toBe(0);
		const txn = await db.query.transaction.findFirst({
			where: { id: { eq: "txn-1" } },
		});
		expect(txn?.status).toBe("pending");
	});

	it("deducts credits once on refund.succeeded", async () => {
		await db
			.update(tables.organization)
			.set({ credits: "100" })
			.where(eq(tables.organization.id, ORG_ID));
		await db.insert(tables.transaction).values({
			id: "refund-txn-1",
			organizationId: ORG_ID,
			type: "credit_refund",
			creditAmount: "-25",
			amount: "-26.25",
			currency: "USD",
			status: "pending",
			dodoRefundId: "ref_1",
			relatedTransactionId: "txn-1",
			description: "Refund",
		});
		dodoMock.webhooks.unwrap.mockReturnValue({
			type: "refund.succeeded",
			data: { refund_id: "ref_1", payment_id: "pay_1" },
		});

		for (let i = 0; i < 2; i++) {
			const res = await post();
			expect(res.status).toBe(200);
		}
		expect(Number((await getOrg())?.credits)).toBe(75);
		const txn = await db.query.transaction.findFirst({
			where: { id: { eq: "refund-txn-1" } },
		});
		expect(txn?.status).toBe("completed");
	});

	it("stores the mandate on subscription.active", async () => {
		dodoMock.webhooks.unwrap.mockReturnValue({
			type: "subscription.active",
			data: {
				subscription_id: "sub_mandate_1",
				customer: { customer_id: "cus_dodo_1" },
				metadata: {
					organizationId: ORG_ID,
					purpose: "auto_top_up_mandate",
				},
			},
		});

		const res = await post();
		expect(res.status).toBe(200);
		expect((await getOrg())?.dodoAutoTopUpSubscriptionId).toBe("sub_mandate_1");
	});

	it("clears the mandate and disables auto top-up on subscription.cancelled", async () => {
		await db
			.update(tables.organization)
			.set({
				autoTopUpEnabled: true,
				dodoAutoTopUpSubscriptionId: "sub_mandate_1",
			})
			.where(eq(tables.organization.id, ORG_ID));
		dodoMock.webhooks.unwrap.mockReturnValue({
			type: "subscription.cancelled",
			data: {
				subscription_id: "sub_mandate_1",
				customer: { customer_id: "cus_dodo_1" },
				metadata: {},
			},
		});

		const res = await post();
		expect(res.status).toBe(200);
		const org = await getOrg();
		expect(org?.dodoAutoTopUpSubscriptionId).toBeNull();
		expect(org?.autoTopUpEnabled).toBe(false);
	});

	it("flags the organization on dispute.opened", async () => {
		await db
			.update(tables.organization)
			.set({ autoTopUpEnabled: true })
			.where(eq(tables.organization.id, ORG_ID));
		await db.insert(tables.transaction).values({
			id: "txn-2",
			organizationId: ORG_ID,
			type: "credit_topup",
			creditAmount: "25",
			amount: "26.25",
			status: "completed",
			dodoPaymentId: "pay_disputed",
		});
		dodoMock.webhooks.unwrap.mockReturnValue({
			type: "dispute.opened",
			data: { dispute_id: "disp_1", payment_id: "pay_disputed" },
		});

		const res = await post();
		expect(res.status).toBe(200);
		const org = await getOrg();
		expect(org?.riskFlagged).toBe(true);
		expect(org?.autoTopUpEnabled).toBe(false);
	});
});
