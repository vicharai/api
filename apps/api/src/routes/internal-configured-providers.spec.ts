import { afterEach, describe, expect, test, vi } from "vitest";

import { app } from "@/index.js";
import { createTestUser } from "@/testing.js";

// The /internal router is mounted publicly for the model catalogue pages, but
// /internal/configured-providers discloses which upstream providers hold
// platform credentials — it must reject anything but an admin session.
describe("/internal/configured-providers", () => {
	const originalAdminEmails = process.env.ADMIN_EMAILS;

	afterEach(() => {
		vi.unstubAllEnvs();
		if (originalAdminEmails !== undefined) {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		} else {
			delete process.env.ADMIN_EMAILS;
		}
	});

	test("rejects unauthenticated requests", async () => {
		vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
		const res = await app.request("/internal/configured-providers");
		expect(res.status).toBe(403);
	});

	test("rejects an authenticated non-admin session", async () => {
		vi.stubEnv("ADMIN_EMAILS", "someone-else@example.com");
		const cookie = await createTestUser();
		const res = await app.request("/internal/configured-providers", {
			headers: { Cookie: cookie },
		});
		expect(res.status).toBe(403);
	});

	test("returns provider ids to an admin session", async () => {
		vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
		const cookie = await createTestUser();
		const res = await app.request("/internal/configured-providers", {
			headers: { Cookie: cookie },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toHaveProperty("providerIds");
		expect(Array.isArray(body.providerIds)).toBe(true);
	});

	test("public catalogue routes stay unauthenticated", async () => {
		await createTestUser();
		const res = await app.request("/internal/models");
		expect(res.status).toBe(200);
	});
});
