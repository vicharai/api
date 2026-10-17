import { isInternalApiOrigin } from "@/lib/api-origin.js";
import { isInferenceRequest } from "@/lib/backpressure.js";
import { getGatewayMaintenance } from "@/lib/cached-queries.js";
import {
	buildAnthropicErrorBody,
	buildOpenAIErrorBody,
} from "@/lib/error-response.js";

import { DEFAULT_MAINTENANCE_MESSAGE } from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";
import type { MiddlewareHandler } from "hono";

const RETRY_AFTER_SECONDS = "60";

/**
 * Admin maintenance mode: every inference endpoint answers 503 with
 * `error.type: "maintenance"` while it is on. Metadata endpoints keep working.
 */
export const maintenanceMiddleware: MiddlewareHandler<ServerTypes> = async (
	c,
	next,
) => {
	if (!isInferenceRequest(c) || isInternalApiOrigin(c)) {
		return await next();
	}

	const maintenance = await getGatewayMaintenance();
	if (!maintenance.enabled) {
		return await next();
	}

	const message = maintenance.message ?? DEFAULT_MAINTENANCE_MESSAGE;
	c.header("Retry-After", RETRY_AFTER_SECONDS);
	if (c.req.path.startsWith("/v1/messages")) {
		return c.json(
			buildAnthropicErrorBody({ message, status: 503, type: "maintenance" }),
			503,
		);
	}
	return c.json(
		buildOpenAIErrorBody({
			message,
			status: 503,
			type: "maintenance",
			code: "maintenance",
		}),
		503,
	);
};
