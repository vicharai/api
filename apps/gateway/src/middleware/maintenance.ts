import { createMiddleware } from "hono/factory";

import { getGatewayMaintenance } from "@/lib/cached-queries.js";
import { renderGatewayError } from "@/lib/error-response.js";

import { logger, toError } from "@llmgateway/logger";
import { DEFAULT_MAINTENANCE_MESSAGE } from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";

const GATED_PATH = /^\/(v\d+\/|mcp(\/|$))/;

function isGated(method: string, path: string): boolean {
	return (
		GATED_PATH.test(path) &&
		!(method === "GET" && path.startsWith("/v1/models"))
	);
}

/**
 * Admin maintenance switch: API traffic gets a 503 while model discovery keeps
 * working. Reads the Redis-cached setting; a settings read failure fails open.
 */
export const maintenanceMiddleware = createMiddleware<ServerTypes>(
	async (c, next) => {
		if (!isGated(c.req.method, c.req.path)) {
			return await next();
		}
		let maintenance;
		try {
			maintenance = await getGatewayMaintenance();
		} catch (error) {
			logger.error("Gateway maintenance setting unavailable", toError(error));
			return await next();
		}
		if (!maintenance.enabled) {
			return await next();
		}
		c.header("Retry-After", "60");
		return renderGatewayError(
			c,
			503,
			maintenance.message || DEFAULT_MAINTENANCE_MESSAGE,
		);
	},
);
