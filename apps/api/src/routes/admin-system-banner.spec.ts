import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { app } from "@/index.js";
import { updatePlatformControls } from "@/lib/platform-controls.js";
import { getActiveSystemBanner } from "@/lib/system-banner.js";
import { createTestUser, deleteAll } from "@/testing.js";

const endpoint = "/admin/settings/banner";

async function putBanner(cookie: string, body: unknown) {
	return await app.request(endpoint, {
		method: "PUT",
		headers: { Cookie: cookie, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("admin system banner", () => {
	let cookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
	});

	afterEach(async () => {
		await deleteAll();
	});

	test("requires authentication", async () => {
		const res = await app.request(endpoint);
		expect(res.status).toBe(401);
	});

	test("returns an empty disabled banner by default", async () => {
		const res = await app.request(endpoint, { headers: { Cookie: cookie } });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			enabled: false,
			message: "",
			severity: "info",
			linkUrl: null,
			linkLabel: null,
		});
	});

	test("stores and publishes a banner", async () => {
		const res = await putBanner(cookie, {
			enabled: true,
			message: "  Upstream provider degraded  ",
			severity: "warning",
			linkUrl: "https://app.vichar.io/",
			linkLabel: "Status page",
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			enabled: true,
			message: "Upstream provider degraded",
			severity: "warning",
			linkUrl: "https://app.vichar.io/",
			linkLabel: "Status page",
		});
		expect(await getActiveSystemBanner()).toEqual({
			message: "Upstream provider degraded",
			severity: "warning",
			linkUrl: "https://app.vichar.io/",
			linkLabel: "Status page",
		});
	});

	test("keeps the draft when the banner is switched off", async () => {
		await putBanner(cookie, {
			enabled: true,
			message: "Scheduled maintenance",
			severity: "info",
			linkUrl: null,
			linkLabel: null,
		});

		const res = await putBanner(cookie, {
			enabled: false,
			message: "Scheduled maintenance",
			severity: "info",
			linkUrl: null,
			linkLabel: null,
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			enabled: false,
			message: "Scheduled maintenance",
		});
		expect(await getActiveSystemBanner()).toBeNull();
	});

	test("rejects enabling an empty banner", async () => {
		const res = await putBanner(cookie, {
			enabled: true,
			message: "   ",
			severity: "info",
			linkUrl: null,
			linkLabel: null,
		});

		expect(res.status).toBe(400);
		expect(await getActiveSystemBanner()).toBeNull();
	});

	test("rejects a non-https link", async () => {
		const res = await putBanner(cookie, {
			enabled: true,
			message: "Degraded",
			severity: "critical",
			linkUrl: "http://app.vichar.io",
			linkLabel: null,
		});

		expect(res.status).toBe(400);
		expect(await getActiveSystemBanner()).toBeNull();
	});

	test("rejects an unknown severity", async () => {
		const res = await putBanner(cookie, {
			enabled: true,
			message: "Degraded",
			severity: "catastrophic",
			linkUrl: null,
			linkLabel: null,
		});

		expect(res.status).toBe(400);
	});

	test("serves the active banner publicly without auth", async () => {
		await putBanner(cookie, {
			enabled: true,
			message: "Degraded routing",
			severity: "critical",
			linkUrl: "https://app.vichar.io/",
			linkLabel: "Status",
		});

		const res = await app.request("/public/banner");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			banner: {
				message: "Degraded routing",
				severity: "critical",
				linkUrl: "https://app.vichar.io/",
				linkLabel: "Status",
			},
			maintenance: null,
		});
	});

	test("serves null publicly when no banner is set", async () => {
		const res = await app.request("/public/banner");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ banner: null, maintenance: null });
	});

	test("falls back to a maintenance banner while maintenance is on", async () => {
		await updatePlatformControls({
			maintenance: { enabled: true, message: "Upgrading the gateway" },
		});

		const res = await app.request("/public/banner");

		expect(await res.json()).toEqual({
			banner: {
				message: "Upgrading the gateway",
				severity: "warning",
				linkUrl: null,
				linkLabel: null,
			},
			maintenance: { message: "Upgrading the gateway" },
		});
	});

	test("keeps the published banner and reports maintenance separately", async () => {
		await putBanner(cookie, {
			enabled: true,
			message: "New models",
			severity: "info",
			linkUrl: null,
			linkLabel: null,
		});
		await updatePlatformControls({ maintenance: { enabled: true } });

		const body = (await (await app.request("/public/banner")).json()) as {
			banner: { message: string };
			maintenance: { message: string } | null;
		};

		expect(body.banner.message).toBe("New models");
		expect(body.maintenance?.message).toMatch(/maintenance/i);
	});
});
