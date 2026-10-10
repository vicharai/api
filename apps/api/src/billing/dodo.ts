import DodoPayments from "dodopayments";
import { HTTPException } from "hono/http-exception";

import { db, eq, tables } from "@llmgateway/db";

const BILLING_NOT_CONFIGURED = "Billing is not configured";

let client: DodoPayments | null = null;

/**
 * Lazily build the Dodo client so the API boots without credentials. Callers
 * must go through `getDodo` — billing endpoints return 503 while unset.
 */
export function getDodo(): DodoPayments {
	if (!client) {
		const bearerToken = process.env.DODO_PAYMENTS_API_KEY;
		if (!bearerToken) {
			throw new HTTPException(503, { message: BILLING_NOT_CONFIGURED });
		}
		client = new DodoPayments({
			bearerToken,
			webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
			environment:
				process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
					? "live_mode"
					: "test_mode",
		});
	}
	return client;
}

export function getCreditsProductId(): string {
	const id = process.env.DODO_CREDITS_PRODUCT_ID;
	if (!id) {
		throw new HTTPException(503, { message: BILLING_NOT_CONFIGURED });
	}
	return id;
}

export function getAutoTopUpProductId(): string {
	const id = process.env.DODO_AUTO_TOPUP_PRODUCT_ID;
	if (!id) {
		throw new HTTPException(503, { message: BILLING_NOT_CONFIGURED });
	}
	return id;
}

/** Reset the cached client (tests). */
export function _resetDodoClientForTests(): void {
	client = null;
}

/**
 * Create the Dodo customer once and persist it on the org; reuse thereafter.
 */
export async function ensureDodoCustomer(org: {
	id: string;
	name: string;
	billingEmail: string;
	dodoCustomerId: string | null;
}): Promise<string> {
	if (org.dodoCustomerId) {
		return org.dodoCustomerId;
	}
	const customer = await getDodo().customers.create({
		email: org.billingEmail,
		name: org.name,
	});
	await db
		.update(tables.organization)
		.set({ dodoCustomerId: customer.customer_id })
		.where(eq(tables.organization.id, org.id));
	return customer.customer_id;
}
