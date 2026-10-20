import {
	getCachedPlatformConfig,
	listCatalogDeletions,
} from "./cached-queries.js";

import type { ServerTypes } from "@/vars.js";
import type { PlatformConfig } from "@llmgateway/shared";
import type { Context } from "hono";

/**
 * The platform config for this request, loaded at most once per context.
 * Admin-deleted models join `gateway.modelDenylist`, so every surface that
 * honours the denylist treats them as unknown.
 */
export async function getRequestPlatformConfig(
	c: Pick<Context<ServerTypes>, "get" | "set">,
): Promise<PlatformConfig> {
	const loaded = c.get("platformConfig");
	if (loaded) {
		return loaded;
	}
	const [config, deletions] = await Promise.all([
		getCachedPlatformConfig(),
		listCatalogDeletions(),
	]);
	const deletedModels = deletions
		.filter((rule) => rule.scope === "model")
		.map((rule) => rule.target);
	const effective =
		deletedModels.length === 0
			? config
			: {
					...config,
					"gateway.modelDenylist": [
						...config["gateway.modelDenylist"],
						...deletedModels,
					],
				};
	c.set("platformConfig", effective);
	return effective;
}
