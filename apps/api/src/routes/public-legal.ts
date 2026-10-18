import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

import {
	getDefaultLegalMarkdown,
	getLegalOverride,
	LEGAL_PAGES,
} from "@/lib/legal-content.js";

import type { ServerTypes } from "@/vars.js";

/** Public, unauthenticated legal pages rendered by the dashboard. */
export const publicLegal = new OpenAPIHono<ServerTypes>();

const getLegalPage = createRoute({
	operationId: "get_public_legal_page",
	method: "get",
	path: "/{page}",
	request: { params: z.object({ page: z.enum(LEGAL_PAGES) }) },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z
						.object({
							page: z.enum(LEGAL_PAGES),
							// null when there is no override and this deployment does
							// not ship the bundled markdown; render the local copy.
							markdown: z.string().nullable(),
							updatedAt: z.string().nullable(),
						})
						.openapi({}),
				},
			},
			description: "The admin-edited legal page, else the bundled default.",
		},
	},
});

publicLegal.openapi(getLegalPage, async (c) => {
	const { page } = c.req.valid("param");
	const override = await getLegalOverride(page);
	c.header("Cache-Control", "public, max-age=60");
	return c.json(
		{
			page,
			markdown: override?.markdown ?? (await getDefaultLegalMarkdown(page)),
			updatedAt: override?.updatedAt.toISOString() ?? null,
		},
		200,
	);
});
