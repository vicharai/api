import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, tables } from "@llmgateway/db";

const dodoMock = vi.hoisted(() => ({
	customers: {
		create: vi.fn(),
		customerPortal: { create: vi.fn() },
	},
	checkoutSessions: { create: vi.fn() },
	subscriptions: { update: vi.fn() },
}));

vi.mock("dodopayments", () => ({
	default: function MockDodo() {
		return dodoMock;
	},
}));

const ORG_ID = "test-org-id";

const PASSWORD_HASH =
	"c11ef27a7f9264be08db228ebb650888:a4d985a9c6bd98608237fd507534424950aa7fc255930d972242b81cbe78594f8568feb0d067e95ddf7be242ad3e9d013f695f4414fce68bfff091079f1dc460";

async function signInAs(email: string) {
	const auth = await app.request("/auth/sign-in/email", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email,
			password: "admin@example.com1A",
		}),
	});
	expect(auth.status).toBe(200);
	return auth.headers.get("set-cookie")!;
}

describe("Dodo credit top-up checkout", () => {
	let cookie: string;

	beforeEach(async () => {
		cookie = await createTestUser();
		vi.stubEnv("DODO_PAYMENTS_API_KEY", "dodo_test_key");
		vi.stubEnv("DODO_PAYMENTS_ENVIRONMENT", "test_mode");
		vi.stubEnv("DODO_CREDITS_PRODUCT_ID", "pdt_credits_1");
		vi.stubEnv("DODO_AUTO_TOPUP_PRODUCT_ID", "pdt_mandate_1");

		await db.insert(tables.organization).values({
			id: ORG_ID,
			name: "Test Organization",
			billingEmail: "admin@example.com",
			dodoCustomerId: "cus_dodo_1",
		});
		await db.insert(tables.userOrganization).values({
			userId: "test-user-id",
			organizationId: ORG_ID,
			role: "owner",
		});

		dodoMock.checkoutSessions.create.mockReset();
		dodoMock.checkoutSessions.create.mockResolvedValue({
			session_id: "chk_1",
			checkout_url: "https://checkout.dodo.test/chk_1",
		});
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await deleteAll();
	});

	const post = (body: object, as: string = cookie) =>
		app.request("/payments/top-up/checkout", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: as,
			},
			body: JSON.stringify(body),
		});

	it("rejects an out-of-range amount", async () => {
		const res = await post({ organizationId: ORG_ID, amount: 1 });
		expect(res.status).toBe(400);
	});

	it("rejects a non-admin member", async () => {
		await db.insert(tables.user).values({
			id: "member-user-id",
			name: "Member User",
			email: "member@example.com",
			emailVerified: true,
		});
		await db.insert(tables.account).values({
			id: "member-account-id",
			providerId: "credential",
			accountId: "member-account-id",
			userId: "member-user-id",
			password: PASSWORD_HASH,
		});
		await db.insert(tables.userOrganization).values({
			userId: "member-user-id",
			organizationId: ORG_ID,
			role: "developer",
		});
		const memberCookie = await signInAs("member@example.com");

		const res = await post(
			{ organizationId: ORG_ID, amount: 25 },
			memberCookie,
		);
		expect(res.status).toBe(403);
	});

	it("creates a pending transaction with fee amounts and passes cents to Dodo", async () => {
		const res = await post({ organizationId: ORG_ID, amount: 25 });
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.checkoutUrl).toBe("https://checkout.dodo.test/chk_1");

		const txns = await db.query.transaction.findMany({
			where: { organizationId: { eq: ORG_ID } },
		});
		expect(txns).toHaveLength(1);
		expect(txns[0].status).toBe("pending");
		expect(txns[0].type).toBe("credit_topup");
		expect(Number(txns[0].creditAmount)).toBe(25);
		expect(Number(txns[0].amount)).toBeCloseTo(26.25);
		expect(txns[0].dodoCheckoutSessionId).toBe("chk_1");

		const call = dodoMock.checkoutSessions.create.mock.calls[0][0];
		expect(call.product_cart).toEqual([
			{
				product_id: "pdt_credits_1",
				quantity: 1,
				amount: 2625,
			},
		]);
		expect(call.billing_currency).toBe("USD");
		expect(call.metadata).toMatchObject({
			organizationId: ORG_ID,
			transactionId: txns[0].id,
			purpose: "credit_topup",
		});
	});
});
