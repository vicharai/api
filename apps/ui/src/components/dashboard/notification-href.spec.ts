import { describe, expect, test } from "vitest";

import { isExternalHref, resolveNotificationHref } from "./notification-href";

describe("resolveNotificationHref", () => {
	test("returns null for an empty link", () => {
		expect(resolveNotificationHref("", "org-1")).toBeNull();
		expect(resolveNotificationHref("   ", "org-1")).toBeNull();
		expect(resolveNotificationHref(null, "org-1")).toBeNull();
	});

	test("fills in the current workspace", () => {
		expect(
			resolveNotificationHref("/dashboard/{orgId}/org/billing", "org-1"),
		).toBe("/dashboard/org-1/org/billing");
	});

	test("falls back to the dashboard without a workspace", () => {
		expect(
			resolveNotificationHref("/dashboard/{orgId}/org/billing", null),
		).toBe("/dashboard");
	});

	test("keeps other links unchanged", () => {
		expect(resolveNotificationHref("https://example.com/x", "org-1")).toBe(
			"https://example.com/x",
		);
		expect(isExternalHref("https://example.com/x")).toBe(true);
		expect(isExternalHref("/models")).toBe(false);
	});
});
