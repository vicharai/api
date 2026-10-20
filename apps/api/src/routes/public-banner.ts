import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

import { getPlatformControls } from "@/lib/platform-controls.js";
import { getActiveSystemBanner } from "@/lib/system-banner.js";

import {
	DEFAULT_MAINTENANCE_MESSAGE,
	SYSTEM_BANNER_SEVERITIES,
} from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";

/**
 * Public, unauthenticated announcement banner rendered by the main UI, docs
 * and Airside. Toggled from the admin dashboard; gateway maintenance mode
 * surfaces here too.
 */
export const publicBanner = new OpenAPIHono<ServerTypes>();

const getBanner = createRoute({
	method: "get",
	path: "/",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z
						.object({
							banner: z
								.object({
									message: z.string(),
									severity: z.enum(SYSTEM_BANNER_SEVERITIES),
									linkUrl: z.string().nullable(),
									linkLabel: z.string().nullable(),
								})
								.nullable(),
							// Set while gateway maintenance mode is on. `banner` falls back
							// to it when no announcement is published.
							maintenance: z.object({ message: z.string() }).nullable(),
						})
						.openapi({}),
				},
			},
			description:
				"The active announcement banner and gateway maintenance notice.",
		},
	},
});

publicBanner.openapi(getBanner, async (c) => {
	// Short enough that switching the banner off reaches every site quickly,
	// long enough that it does not add a database read per page view.
	c.header("Cache-Control", "public, max-age=30");
	const [banner, { maintenance }] = await Promise.all([
		getActiveSystemBanner(),
		getPlatformControls(),
	]);
	const maintenanceNotice = maintenance.enabled
		? { message: maintenance.message ?? DEFAULT_MAINTENANCE_MESSAGE }
		: null;
	return c.json({
		banner:
			banner ??
			(maintenanceNotice && {
				message: maintenanceNotice.message,
				severity: "warning" as const,
				linkUrl: null,
				linkLabel: null,
			}),
		maintenance: maintenanceNotice,
	});
});

export default publicBanner;
