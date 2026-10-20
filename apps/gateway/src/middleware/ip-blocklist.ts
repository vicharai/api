import { isInternalApiOrigin } from "@/lib/api-origin.js";
import { getClientIpFromRequest } from "@/lib/client-ip.js";
import {
	buildAnthropicErrorBody,
	buildOpenAIErrorBody,
} from "@/lib/error-response.js";
import { getRequestPlatformConfig } from "@/lib/request-platform-config.js";

import { isIpBlocked } from "@llmgateway/shared/ip-rules";

import type { ServerTypes } from "@/vars.js";
import type { MiddlewareHandler } from "hono";

export const IP_BLOCKED_MESSAGE =
	"Requests from your network have been blocked. Contact support if you think this is a mistake.";

function isApiPath(path: string): boolean {
	return path.startsWith("/v1/") || path === "/mcp" || path.startsWith("/mcp/");
}

/**
 * Admin IP blocklist (`abuse.blockedIps`). Reads only the cached platform
 * config, so it adds no database round trip to the request.
 */
export const ipBlocklistMiddleware: MiddlewareHandler<ServerTypes> = async (
	c,
	next,
) => {
	if (!isApiPath(c.req.path) || isInternalApiOrigin(c)) {
		return await next();
	}

	const config = await getRequestPlatformConfig(c);
	if (!isIpBlocked(getClientIpFromRequest(c), config["abuse.blockedIps"])) {
		return await next();
	}

	if (c.req.path.startsWith("/v1/messages")) {
		return c.json(
			buildAnthropicErrorBody({
				message: IP_BLOCKED_MESSAGE,
				status: 403,
				type: "permission_error",
			}),
			403,
		);
	}
	return c.json(
		buildOpenAIErrorBody({
			message: IP_BLOCKED_MESSAGE,
			status: 403,
			type: "access_blocked",
			code: "access_blocked",
		}),
		403,
	);
};
