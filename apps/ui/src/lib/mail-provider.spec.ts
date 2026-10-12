import { describe, expect, test } from "vitest";

import { getMailProvider } from "./mail-provider";

describe("getMailProvider", () => {
	test("maps gmail.com to a Gmail deep link searching for vichar.io", () => {
		const provider = getMailProvider("user@gmail.com");
		expect(provider?.name).toBe("Gmail");
		expect(provider?.url).toContain("mail.google.com");
	});

	test("maps outlook aliases to Outlook", () => {
		for (const domain of [
			"outlook.com",
			"hotmail.com",
			"live.com",
			"msn.com",
		]) {
			expect(getMailProvider(`user@${domain}`)?.name).toBe("Outlook");
		}
	});

	test("matches domains case-insensitively", () => {
		expect(getMailProvider("user@GMAIL.COM")?.name).toBe("Gmail");
	});

	test("returns null for unknown domains", () => {
		expect(getMailProvider("user@example.org")).toBeNull();
	});

	test("returns null for malformed addresses", () => {
		expect(getMailProvider("not-an-email")).toBeNull();
		expect(getMailProvider("")).toBeNull();
		expect(getMailProvider("user@")).toBeNull();
	});
});
