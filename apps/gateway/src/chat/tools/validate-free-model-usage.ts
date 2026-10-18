// Helper function to validate free model usage
import { HTTPException } from "hono/http-exception";

import { findUserFromOrganization } from "@/lib/cached-queries.js";
import {
	FREE_TIER_MAX_INPUT_TOKENS,
	FREE_TIER_MAX_OUTPUT_TOKENS,
	FREE_TIER_TOP_UP_MESSAGE,
} from "@/lib/free-tier.js";
import { checkFreeModelRateLimit } from "@/lib/rate-limit.js";

import { logger } from "@llmgateway/logger";

import type { ServerTypes } from "@/vars.js";
import type { ModelDefinition } from "@llmgateway/models";
import type { Context } from "hono";

export async function validateFreeModelUsage(
	c: Context<ServerTypes>,
	organizationId: string,
	requestedModel: string,
	modelInfo: ModelDefinition,
	options?: {
		skipEmailVerification?: boolean;
		maxTokens?: number;
		estimatedPromptTokens?: number;
	},
) {
	const result = await findUserFromOrganization(organizationId);
	if (!result?.user) {
		logger.error("User not found", { organizationId });
		throw new HTTPException(500, {
			message: "User not found",
		});
	}
	const user = result.user;
	if (!options?.skipEmailVerification && !user.emailVerified) {
		throw new HTTPException(403, {
			message:
				"Email verification required to use free models. Please verify your email address.",
		});
	}

	// Free-tier size caps: 32k prompt tokens, 4k output tokens.
	if (
		options?.estimatedPromptTokens !== undefined &&
		options.estimatedPromptTokens > FREE_TIER_MAX_INPUT_TOKENS
	) {
		throw new HTTPException(400, {
			message: `Free tier prompts are limited to ${FREE_TIER_MAX_INPUT_TOKENS.toLocaleString()} tokens. ${FREE_TIER_TOP_UP_MESSAGE}`,
		});
	}
	if (
		options?.maxTokens !== undefined &&
		options.maxTokens > FREE_TIER_MAX_OUTPUT_TOKENS
	) {
		throw new HTTPException(400, {
			message: `Free tier responses are limited to ${FREE_TIER_MAX_OUTPUT_TOKENS.toLocaleString()} tokens. ${FREE_TIER_TOP_UP_MESSAGE}`,
		});
	}

	// Check rate limits for free models
	const rateLimitResult = await checkFreeModelRateLimit(
		organizationId,
		requestedModel,
		modelInfo,
	);

	// Always set limit and remaining headers. `RateLimit-Policy` advertises
	// both windows since the scalar headers can only carry one value.
	c.header("RateLimit-Policy", "10;w=60, 100;w=86400");
	c.header("RateLimit-Limit", rateLimitResult.limit.toString());
	c.header("RateLimit-Remaining", rateLimitResult.remaining.toString());
	c.header("X-RateLimit-Limit", rateLimitResult.limit.toString());
	c.header("X-RateLimit-Remaining", rateLimitResult.remaining.toString());

	if (!rateLimitResult.allowed) {
		// Only set retry and reset headers when rate limited
		const retryAfter = rateLimitResult.retryAfter;
		if (retryAfter) {
			c.header("Retry-After", retryAfter.toString());
			c.header("RateLimit-Reset", retryAfter.toString());
			const resetTime = Math.floor(Date.now() / 1000) + retryAfter;
			c.header("X-RateLimit-Reset", resetTime.toString());
		}

		const scope = rateLimitResult.daily
			? "100 requests per day"
			: "10 requests per minute";
		throw new HTTPException(429, {
			message: `Free tier rate limit reached (${scope}). ${FREE_TIER_TOP_UP_MESSAGE}`,
		});
	}
}
