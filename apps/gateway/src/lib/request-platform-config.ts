import { getCachedPlatformConfig } from "./cached-queries.js";

import type { ServerTypes } from "@/vars.js";
import type { PlatformConfig } from "@llmgateway/shared";
import type { Context } from "hono";

/** The platform config for this request, loaded at most once per context. */
export async function getRequestPlatformConfig(
	c: Pick<Context<ServerTypes>, "get" | "set">,
): Promise<PlatformConfig> {
	const loaded = c.get("platformConfig");
	if (loaded) {
		return loaded;
	}
	const config = await getCachedPlatformConfig();
	c.set("platformConfig", config);
	return config;
}
