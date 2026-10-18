import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import {
	findApiKeyByToken,
	findOrganizationById,
	findProjectById,
} from "@/lib/cached-queries.js";
import { rateLimitHeaders } from "@/lib/error-schemas.js";
import { standardErrorResponses } from "@/lib/error-schemas.js";
import { extractApiToken } from "@/lib/extract-api-token.js";
import { assertOrganizationUsable } from "@/lib/organization-access.js";

import type { ServerTypes } from "@/vars.js";

export const key = new OpenAPIHono<ServerTypes>();

const keyResponseSchema = z.object({
	data: z.object({
		label: z.string().openapi({
			description: "Description of the API key used for the request.",
		}),
		usage: z.string().openapi({
			description: "Total usage in USD accrued by this API key.",
		}),
		limit: z.string().nullable().openapi({
			description: "Usage limit in USD set on this API key, if any.",
		}),
	}),
});

const getKey = createRoute({
	operationId: "v1_key_retrieve",
	summary: "Retrieve key status",
	description:
		"Returns usage information for the API key used to authenticate the request. Lets clients that only hold an API key surface usage against the key's limit without a dashboard session. Deliberately excludes billing details and the key token itself.",
	method: "get",
	path: "/",
	security: [{ bearerAuth: [] }],
	request: {},
	responses: {
		200: {
			headers: rateLimitHeaders,
			content: {
				"application/json": {
					schema: keyResponseSchema,
				},
			},
			description: "Status of the API key.",
		},
		...standardErrorResponses(),
	},
});

key.openapi(getKey, async (c) => {
	const token = extractApiToken(c);
	const apiKey = await findApiKeyByToken(token);

	if (!apiKey) {
		throw new HTTPException(401, {
			message:
				"Unauthorized: Invalid Vichar API token. The token could not be found. Go to the Vichar 'API Keys' page to generate a new token.",
		});
	}

	if (apiKey.status !== "active") {
		throw new HTTPException(401, {
			message:
				"Unauthorized: This Vichar API token is not active (it may be disabled or deleted). Go to the Vichar 'API Keys' page to generate a new token.",
		});
	}

	// Embeddable-SDK principals (publishable keys, end-user sessions) must not
	// read the aggregate key's metadata.
	if (apiKey.keyType !== "user" || apiKey.endUserSession) {
		throw new HTTPException(403, {
			message: "This endpoint is only available for regular API keys.",
		});
	}

	const project = await findProjectById(apiKey.projectId);
	if (!project) {
		throw new HTTPException(500, {
			message: "Could not find project",
		});
	}

	if (project.status === "deleted") {
		throw new HTTPException(410, {
			message: "Project has been archived and is no longer accessible",
		});
	}

	const organization = await findOrganizationById(project.organizationId);
	if (!organization) {
		throw new HTTPException(500, {
			message: "Could not find organization",
		});
	}

	assertOrganizationUsable(organization);

	// Per-key and per-member usage limits are deliberately NOT enforced here:
	// a client most needs to read remaining quota exactly when the key is
	// over its cap.

	return c.json(
		{
			data: {
				label: apiKey.description,
				usage: apiKey.usage,
				limit: apiKey.usageLimit,
			},
		},
		200,
	);
});
