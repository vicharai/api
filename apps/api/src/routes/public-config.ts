import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

import type { ServerTypes } from "@/vars.js";

/**
 * Public, unauthenticated configuration for the embeddable SDK. Lets the browser
 * client configuration values the dashboard needs at runtime.
 * developers don't have to hardcode it.
 */
export const publicConfig = new OpenAPIHono<ServerTypes>();

const getConfig = createRoute({
	method: "get",
	path: "/",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({}),
				},
			},
			description: "Public SDK configuration.",
		},
	},
});

publicConfig.openapi(getConfig, async (c) => {
	return c.json({});
});

export default publicConfig;
