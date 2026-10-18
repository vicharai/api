import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { checkRateLimit } from "@/auth/config.js";
import { getBillingOrganization } from "@/lib/billing-organization.js";
import { redeemPromoCode } from "@/lib/promo-codes.js";

import type { ServerTypes } from "@/vars.js";

export const promoCodes = new OpenAPIHono<ServerTypes>();

export const PROMO_REDEEM_RATE_LIMIT = {
	keyPrefix: "promo_redeem",
	windowSizeMs: 10 * 60 * 1000,
	maxRequests: 10,
};

const redeemRoute = createRoute({
	operationId: "redeem_promo_code",
	method: "post",
	path: "/{orgId}/promo-codes/redeem",
	request: {
		params: z.object({ orgId: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({ code: z.string().trim().min(1).max(64) }),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ amount: z.number(), balance: z.number() }),
				},
			},
			description: "Credits added to the organization.",
		},
		403: { description: "Caller cannot manage billing for this org." },
		404: { description: "Unknown or inactive code." },
		409: { description: "Code expired, exhausted or already redeemed." },
		429: { description: "Too many attempts." },
	},
});

promoCodes.openapi(redeemRoute, async (c) => {
	const user = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { code } = c.req.valid("json");

	const { organization } = await getBillingOrganization(user.id, orgId);
	if (
		organization.kind !== "default" ||
		organization.riskFlagged ||
		organization.status === "inactive"
	) {
		throw new HTTPException(403, {
			message: "This organization cannot redeem promo codes",
		});
	}

	const limit = await checkRateLimit(user.id, PROMO_REDEEM_RATE_LIMIT);
	if (!limit.allowed) {
		throw new HTTPException(429, {
			message: "Too many promo code attempts. Try again later.",
		});
	}

	const result = await redeemPromoCode({
		code,
		organizationId: orgId,
		userId: user.id,
	});
	return c.json(result, 200);
});
