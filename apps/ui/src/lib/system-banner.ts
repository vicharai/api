import createFetchClient from "openapi-fetch";

import { getConfig } from "./config-server";

import type { paths } from "./api/v1";
import type { SystemBanner } from "@llmgateway/shared";

/**
 * Admin-toggled announcement banner plus the gateway maintenance notice.
 * Revalidated often enough that switching either off takes effect within
 * seconds, without a backend read per page view.
 */
export async function fetchSystemBanners(): Promise<SystemBanner[]> {
	const client = createFetchClient<paths>({
		baseUrl: getConfig().apiBackendUrl,
	});

	try {
		const { data } = await client.GET("/public/banner", {
			next: { revalidate: 30 },
		});
		const banners = data?.banner ? [data.banner] : [];
		const maintenance = data?.maintenance;
		if (
			maintenance &&
			!banners.some((banner) => banner.message === maintenance.message)
		) {
			banners.push({
				message: maintenance.message,
				severity: "warning",
				linkUrl: null,
				linkLabel: null,
			});
		}
		return banners;
	} catch (error) {
		// Every page renders this: a backend outage must not blank the site,
		// which is exactly when an incident banner would be configured.
		console.error("Failed to load the announcement banner:", error);
		return [];
	}
}
