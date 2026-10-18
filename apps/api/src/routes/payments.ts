import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import {
	ensureDodoCustomer,
	getAutoTopUpProductId,
	getCreditsProductId,
	getDodo,
} from "@/billing/dodo.js";
import { assertOrganizationNotHighRisk } from "@/lib/account-risk.js";
import { getBillingOrganization } from "@/lib/billing-organization.js";
import { assertCreditPurchaseAllowed } from "@/lib/credit-purchase-guard.js";
import {
	assertTopUpVelocityAllowed,
	getTopUpVelocityAllowance,
	releaseTopUpReservation,
} from "@/lib/topup-velocity.js";

import { db, eq, getPlatformConfig, tables } from "@llmgateway/db";
import {
	calculateFees,
	getCreditTopUpLimits,
	getMaxCreditTopUpAmount,
} from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";

export const payments = new OpenAPIHono<ServerTypes>();

const UI_URL = () => process.env.UI_URL ?? "http://localhost:3002";

// Bounded by the configured top-up limits in the handler.
const creditTopUpAmountSchema = z.number().int().min(1);

const getTopUpLimit = createRoute({
	method: "get",
	path: "/top-up-limit",
	request: {
		query: z.object({
			organizationId: z.string().optional(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						remainingGrossAmount: z.number().nullable(),
						maxCheckoutAmount: z.number(),
					}),
				},
			},
			description: "Current credit top-up limits",
		},
	},
});

payments.openapi(getTopUpLimit, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { organizationId } = c.req.valid("query");
	const userOrganization = await getBillingOrganization(
		user.id,
		organizationId,
	);

	const platformConfig = await getPlatformConfig();
	const allowance = await getTopUpVelocityAllowance(
		userOrganization.organization,
		platformConfig,
	);
	const remainingGrossAmount = Number.isFinite(allowance.capUsd)
		? allowance.remainingUsd
		: null;

	return c.json({
		remainingGrossAmount,
		maxCheckoutAmount: getMaxCreditTopUpAmount(
			remainingGrossAmount ?? Number.POSITIVE_INFINITY,
			platformConfig,
		),
	});
});

const createTopUpCheckout = createRoute({
	method: "post",
	path: "/top-up/checkout",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						organizationId: z.string(),
						amount: creditTopUpAmountSchema,
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						checkoutUrl: z.string(),
					}),
				},
			},
			description: "Hosted Dodo checkout session for a credit top-up",
		},
	},
});

payments.openapi(createTopUpCheckout, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { organizationId, amount } = c.req.valid("json");
	const platformConfig = await getPlatformConfig();
	const { min, max } = getCreditTopUpLimits(platformConfig);
	if (amount < min) {
		throw new HTTPException(400, {
			message: `Minimum top-up amount is $${min}.`,
		});
	}
	if (amount > max) {
		throw new HTTPException(400, {
			message: `Maximum top-up amount is $${max}.`,
		});
	}

	const userOrganization = await getBillingOrganization(
		user.id,
		organizationId,
	);
	const organization = userOrganization.organization;
	if (organization.kind !== "default") {
		throw new HTTPException(403, {
			message: "Credits can only be purchased on a default organization",
		});
	}

	await assertOrganizationNotHighRisk(organization.id);
	await assertCreditPurchaseAllowed(organization.id);

	const feeBreakdown = calculateFees({ amount }, platformConfig);
	await assertTopUpVelocityAllowed(organization, feeBreakdown.totalAmount, {
		user: { email: user.email, name: user.name },
		config: platformConfig,
	});

	const [transaction] = await db
		.insert(tables.transaction)
		.values({
			organizationId: organization.id,
			type: "credit_topup",
			creditAmount: feeBreakdown.baseAmount.toString(),
			amount: feeBreakdown.totalAmount.toString(),
			currency: "USD",
			status: "pending",
			description: "Credit top-up",
		})
		.returning();

	const customerId = await ensureDodoCustomer(organization);

	const session = await getDodo().checkoutSessions.create({
		product_cart: [
			{
				product_id: getCreditsProductId(),
				quantity: 1,
				amount: Math.round(feeBreakdown.totalAmount * 100),
			},
		],
		customer: { customer_id: customerId },
		billing_currency: "USD",
		metadata: {
			organizationId: organization.id,
			transactionId: transaction.id,
			purpose: "credit_topup",
		},
		return_url: `${UI_URL()}/dashboard/${organization.id}/org/billing?success=1`,
	});

	await db
		.update(tables.transaction)
		.set({ dodoCheckoutSessionId: session.session_id })
		.where(eq(tables.transaction.id, transaction.id));

	if (!session.checkout_url) {
		throw new HTTPException(500, {
			message: "Checkout session did not return a URL",
		});
	}
	return c.json({ checkoutUrl: session.checkout_url });
});

const createAutoTopUpMandate = createRoute({
	method: "post",
	path: "/auto-top-up/mandate",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						organizationId: z.string(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						checkoutUrl: z.string(),
					}),
				},
			},
			description:
				"Hosted Dodo mandate-only checkout that stores a payment method for auto top-ups",
		},
	},
});

payments.openapi(createAutoTopUpMandate, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { organizationId } = c.req.valid("json");
	const userOrganization = await getBillingOrganization(
		user.id,
		organizationId,
	);
	const organization = userOrganization.organization;
	if (organization.kind !== "default") {
		throw new HTTPException(403, {
			message: "Auto top-up is only available on a default organization",
		});
	}

	await assertOrganizationNotHighRisk(organization.id);
	await assertCreditPurchaseAllowed(organization.id);

	const customerId = await ensureDodoCustomer(organization);

	const session = await getDodo().checkoutSessions.create({
		product_cart: [
			{
				product_id: getAutoTopUpProductId(),
				quantity: 1,
			},
		],
		customer: { customer_id: customerId },
		billing_currency: "USD",
		metadata: {
			organizationId: organization.id,
			purpose: "auto_top_up_mandate",
		},
		subscription_data: { on_demand: { mandate_only: true } },
		return_url: `${UI_URL()}/dashboard/${organization.id}/org/billing?mandate=1`,
	});

	if (!session.checkout_url) {
		throw new HTTPException(500, {
			message: "Checkout session did not return a URL",
		});
	}
	return c.json({ checkoutUrl: session.checkout_url });
});

const deleteAutoTopUpMandate = createRoute({
	method: "delete",
	path: "/auto-top-up/mandate",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						organizationId: z.string(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ disabled: z.boolean() }),
				},
			},
			description: "Cancel the auto top-up mandate and disable auto top-up",
		},
	},
});

payments.openapi(deleteAutoTopUpMandate, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { organizationId } = c.req.valid("json");
	const userOrganization = await getBillingOrganization(
		user.id,
		organizationId,
	);
	const organization = userOrganization.organization;

	if (organization.dodoAutoTopUpSubscriptionId) {
		await getDodo().subscriptions.update(
			organization.dodoAutoTopUpSubscriptionId,
			{ status: "cancelled" },
		);
	}

	await db
		.update(tables.organization)
		.set({
			dodoAutoTopUpSubscriptionId: null,
			autoTopUpEnabled: false,
		})
		.where(eq(tables.organization.id, organization.id));

	return c.json({ disabled: true });
});

const createBillingPortal = createRoute({
	method: "post",
	path: "/portal",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						organizationId: z.string(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						portalUrl: z.string(),
					}),
				},
			},
			description:
				"Dodo customer portal session for payment methods and invoices",
		},
	},
});

payments.openapi(createBillingPortal, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { organizationId } = c.req.valid("json");
	const userOrganization = await getBillingOrganization(
		user.id,
		organizationId,
	);
	const customerId = await ensureDodoCustomer(userOrganization.organization);

	const session = await getDodo().customers.customerPortal.create(customerId, {
		return_url: `${UI_URL()}/dashboard/${userOrganization.organization.id}/org/billing`,
	});

	return c.json({ portalUrl: session.link });
});

const calculateFeesRoute = createRoute({
	method: "post",
	path: "/calculate-fees",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						amount: z.number(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						baseAmount: z.number(),
						platformFee: z.number(),
						totalAmount: z.number(),
					}),
				},
			},
			description: "Fee breakdown for a credit top-up amount",
		},
	},
});

payments.openapi(calculateFeesRoute, async (c) => {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	const { amount } = c.req.valid("json");
	return c.json(calculateFees({ amount }, await getPlatformConfig()));
});

export { releaseTopUpReservation };
