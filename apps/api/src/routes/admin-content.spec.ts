import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";
import * as email from "@/utils/email.js";
import { sendTemplatedEmail } from "@/utils/templated-email.js";

import { db, tables } from "@llmgateway/db";

const sendEmail = vi.spyOn(email, "sendTransactionalEmail");

function json(cookie: string, method: string, path: string, body?: unknown) {
	return app.request(path, {
		method,
		headers: { Cookie: cookie, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

describe("admin content", () => {
	let cookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		sendEmail.mockClear();
	});

	afterEach(async () => {
		await deleteAll();
	});

	describe("email templates", () => {
		test("lists every template with its defaults and no override", async () => {
			const res = await json(cookie, "GET", "/admin/content/email-templates");
			expect(res.status).toBe(200);
			const { templates } = await res.json();
			expect(templates.map((t: { id: string }) => t.id)).toEqual([
				"welcome",
				"verification",
				"password_reset",
				"low_balance",
				"payment_receipt",
				"auto_topup_failed",
			]);
			const reset = templates.find(
				(t: { id: string }) => t.id === "password_reset",
			);
			expect(reset).toMatchObject({
				variables: ["name", "url"],
				defaultSubject: "Reset your Vichar password",
				subject: null,
				body: null,
			});
		});

		test("an override replaces the built-in email until it is cleared", async () => {
			const options = { to: "user@example.com" };
			const variables = { name: "Ada", url: "https://example.com/r" };

			await sendTemplatedEmail("password_reset", variables, options);
			expect(sendEmail.mock.calls[0][0].subject).toBe(
				"Reset your Vichar password",
			);
			expect(sendEmail.mock.calls[0][0].html).toBeUndefined();
			expect(sendEmail.mock.calls[0][0].text).toContain("Hey Ada,");

			const put = await json(
				cookie,
				"PUT",
				"/admin/content/email-templates/password_reset",
				{ subject: "Reset for {{name}}", body: "Go to {{url}} now" },
			);
			expect(put.status).toBe(200);
			expect((await put.json()).template).toMatchObject({
				subject: "Reset for {{name}}",
				body: "Go to {{url}} now",
			});

			await sendTemplatedEmail("password_reset", variables, options);
			const overridden = sendEmail.mock.calls[1][0];
			expect(overridden.subject).toBe("Reset for Ada");
			expect(overridden.text).toBe("Go to https://example.com/r now");
			expect(overridden.html).toContain('href="https://example.com/r"');

			// A built-in HTML email is used only while there is no override.
			await sendTemplatedEmail("payment_receipt", {}, options, {
				subject: "Built-in",
				html: "<p>built-in</p>",
			});
			expect(sendEmail.mock.calls[2][0]).toMatchObject({
				subject: "Built-in",
				html: "<p>built-in</p>",
			});

			await json(
				cookie,
				"PUT",
				"/admin/content/email-templates/password_reset",
				{
					subject: null,
					body: null,
				},
			);
			const setting = await db.query.systemSetting.findFirst({
				where: { id: { eq: "email_templates" } },
			});
			expect(JSON.parse(setting!.value!)).toEqual({});
			await sendTemplatedEmail("password_reset", variables, options);
			expect(sendEmail.mock.calls[3][0].subject).toBe(
				"Reset your Vichar password",
			);
		});

		test("a corrupt setting falls back to the defaults", async () => {
			await db.insert(tables.systemSetting).values({
				id: "email_templates",
				enabled: true,
				value: "{not json",
			});
			await sendTemplatedEmail(
				"verification",
				{ name: "Ada", url: "https://example.com/v" },
				{ to: "user@example.com" },
			);
			expect(sendEmail.mock.calls[0][0].subject).toBe(
				"Verify your email for Vichar",
			);
		});

		test("validates template ids and bodies", async () => {
			const unknown = await json(
				cookie,
				"PUT",
				"/admin/content/email-templates/nope",
				{ subject: null, body: null },
			);
			expect(unknown.status).toBe(400);
			const empty = await json(
				cookie,
				"PUT",
				"/admin/content/email-templates/welcome",
				{ subject: "", body: null },
			);
			expect(empty.status).toBe(400);
		});

		test("test send goes to the calling admin with sample values", async () => {
			const res = await json(
				cookie,
				"POST",
				"/admin/content/email-templates/low_balance/test",
			);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ sent: true });
			expect(sendEmail).toHaveBeenCalledOnce();
			const message = sendEmail.mock.calls[0][0];
			expect(message.to).toBe("admin@example.com");
			expect(message.subject).toBe(
				"[Test] Your Vichar credits are running low",
			);
			expect(message.text).toContain("Current balance: $4.20");
		});
	});

	describe("legal pages", () => {
		test("admin edits override the bundled markdown on the public endpoint", async () => {
			let res = await json(cookie, "GET", "/admin/content/legal/terms");
			expect(res.status).toBe(200);
			const initial = await res.json();
			expect(initial).toMatchObject({
				page: "terms",
				markdown: null,
				updatedAt: null,
			});
			// The repository ships the dashboard's markdown; frontmatter is
			// stripped.
			expect(initial.defaultMarkdown).toMatch(/^# Terms of Use/);

			res = await app.request("/public/legal/terms");
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				page: "terms",
				markdown: initial.defaultMarkdown,
				updatedAt: null,
			});

			res = await json(cookie, "PUT", "/admin/content/legal/terms", {
				markdown: "# Custom terms",
			});
			expect(res.status).toBe(200);
			const saved = await res.json();
			expect(saved.markdown).toBe("# Custom terms");
			expect(saved.updatedAt).not.toBeNull();

			res = await app.request("/public/legal/terms");
			expect(await res.json()).toMatchObject({
				markdown: "# Custom terms",
				updatedAt: saved.updatedAt,
			});
			// Privacy is untouched.
			res = await app.request("/public/legal/privacy");
			expect((await res.json()).updatedAt).toBeNull();

			await json(cookie, "PUT", "/admin/content/legal/terms", {
				markdown: null,
			});
			res = await app.request("/public/legal/terms");
			expect((await res.json()).markdown).toBe(initial.defaultMarkdown);
		});

		test("only terms and privacy exist; writes need an admin", async () => {
			expect((await app.request("/public/legal/cookies")).status).toBe(400);
			process.env.ADMIN_EMAILS = "someone-else@example.com";
			const res = await json(cookie, "PUT", "/admin/content/legal/terms", {
				markdown: "x",
			});
			expect(res.status).toBe(403);
		});
	});
});
