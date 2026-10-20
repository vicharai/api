import { describe, expect, it } from "vitest";

import { validateEmail } from "./email-validation.js";

describe("validateEmail", () => {
	describe("plus sign validation", () => {
		it("should reject emails with + in local part", () => {
			const result = validateEmail("test+alias@example.com");
			expect(result.valid).toBe(false);
			expect(result.reason).toBe("plus_sign");
			expect(result.message).toBe("Email addresses with '+' are not allowed");
		});

		it("should reject emails with + anywhere in local part", () => {
			const result = validateEmail("user+test+more@example.com");
			expect(result.valid).toBe(false);
			expect(result.reason).toBe("plus_sign");
		});

		it("should allow emails without + in local part", () => {
			const result = validateEmail("test@example.com");
			expect(result.valid).toBe(true);
		});
	});

	describe("configured domain validation", () => {
		it("blocks configured domains and their subdomains case-insensitively", () => {
			for (const email of [
				"user@example.com",
				"user@EXAMPLE.COM",
				"user@mail.example.com",
				"user@a.b.example.com",
			]) {
				expect(validateEmail(email, ["example.com"])).toEqual({
					valid: false,
					reason: "blacklisted_domain",
					message: "This email domain is not allowed",
				});
			}
		});

		it("allows unconfigured domains and suffix lookalikes", () => {
			expect(validateEmail("user@example.com", [])).toEqual({ valid: true });
			expect(validateEmail("user@notexample.com", ["example.com"])).toEqual({
				valid: true,
			});
			expect(validateEmail("user@example.com.org", ["example.com"])).toEqual({
				valid: true,
			});
		});
	});

	describe("valid emails", () => {
		it("should allow valid gmail addresses", () => {
			const result = validateEmail("user@gmail.com");
			expect(result.valid).toBe(true);
			expect(result.reason).toBeUndefined();
			expect(result.message).toBeUndefined();
		});

		it("should allow valid work email addresses", () => {
			const result = validateEmail("employee@company.com");
			expect(result.valid).toBe(true);
		});

		it("should allow valid outlook addresses", () => {
			const result = validateEmail("user@outlook.com");
			expect(result.valid).toBe(true);
		});

		it("should allow valid custom domain addresses", () => {
			const result = validateEmail("admin@my-startup.io");
			expect(result.valid).toBe(true);
		});
	});

	it("checks the plus sign before the blocked domain list", () => {
		expect(
			validateEmail("test+alias@example.com", ["example.com"]).reason,
		).toBe("plus_sign");
	});
});
