import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

import { getPlatformConfig } from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

/**
 * Public, unauthenticated configuration the dashboard and the embeddable SDK
 * read at runtime: the non-secret billing and company settings from the
 * platform config.
 */
export const publicConfig = new OpenAPIHono<ServerTypes>();

const publicConfigSchema = z.object({
	billing: z.object({
		topUpMin: z.number(),
		topUpMax: z.number(),
		topUpPresets: z.array(z.number()),
		platformFeePercent: z.number(),
		autoTopUpDefaultThreshold: z.number(),
		autoTopUpDefaultAmount: z.number(),
	}),
	company: z.object({
		name: z.string(),
		supportEmail: z.string(),
	}),
});

const getConfig = createRoute({
	method: "get",
	path: "/",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: publicConfigSchema,
				},
			},
			description: "Public runtime configuration.",
		},
	},
});

publicConfig.openapi(getConfig, async (c) => {
	const config = await getPlatformConfig();
	return c.json(
		{
			billing: {
				topUpMin: config["billing.topUpMinAmount"],
				topUpMax: config["billing.topUpMaxAmount"],
				topUpPresets: config["billing.topUpPresets"],
				platformFeePercent: config["billing.platformFeePercent"],
				autoTopUpDefaultThreshold: config["billing.autoTopUpDefaultThreshold"],
				autoTopUpDefaultAmount: config["billing.autoTopUpDefaultAmount"],
			},
			company: {
				name: config["company.name"],
				supportEmail: config["company.supportEmail"],
			},
		},
		200,
	);
});

export default publicConfig;
