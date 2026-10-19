import createFetchClient from "openapi-fetch";

import {
	DEFAULT_BILLING_CONFIG,
	type PublicBillingConfig,
} from "./billing-config";
import { getConfig } from "./config-server";

import type { paths } from "./api/v1";

const REVALIDATE_SECONDS = 60;

function createPublicClient() {
	return createFetchClient<paths>({ baseUrl: getConfig().apiBackendUrl });
}

/**
 * Server-side reads of operator-managed public content. Pages that render
 * these must stay up during a backend outage, so a failed read logs and falls
 * back to the bundled value.
 */
export async function fetchPublicBillingConfig(): Promise<PublicBillingConfig> {
	try {
		const { data } = await createPublicClient().GET("/v1/config", {
			next: { revalidate: REVALIDATE_SECONDS },
		});
		return data?.billing ?? DEFAULT_BILLING_CONFIG;
	} catch (error) {
		console.error("Failed to load the public billing config:", error);
		return DEFAULT_BILLING_CONFIG;
	}
}

/** Operator override of a legal page, or null to render the bundled file. */
export async function fetchLegalOverride(
	page: "terms" | "privacy",
): Promise<string | null> {
	try {
		const { data } = await createPublicClient().GET("/public/legal/{page}", {
			params: { path: { page } },
			next: { revalidate: REVALIDATE_SECONDS },
		});
		return data?.markdown ?? null;
	} catch (error) {
		console.error(`Failed to load the ${page} override:`, error);
		return null;
	}
}
