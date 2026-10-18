import { describe, expect, test } from "vitest";

import {
	EMAIL_TEMPLATE_IDS,
	EMAIL_TEMPLATES,
	renderEmailHtml,
	renderEmailTemplate,
	substituteVariables,
} from "./email-templates.js";

describe("email templates", () => {
	test("every default only uses its documented variables", () => {
		for (const id of EMAIL_TEMPLATE_IDS) {
			const { defaultSubject, defaultBody, variables } = EMAIL_TEMPLATES[id];
			const used = (
				`${defaultSubject} ${defaultBody}`.match(/\{\{\w+\}\}/g) ?? []
			).map((token) => token.slice(2, -2));
			for (const name of used) {
				expect(variables).toContain(name);
			}
		}
	});

	test("substitutes variables and blanks unknown ones", () => {
		expect(
			substituteVariables("Hi {{ name }}, {{missing}}!", { name: "Ada" }),
		).toBe("Hi Ada, !");
	});

	test("escapes template markup and variable values in HTML", () => {
		const html = renderEmailHtml(
			"<b>Hi</b> **{{name}}**\n\n[Open]({{url}}) {{url}}",
			{
				name: '<script>alert("x")</script>',
				url: "https://example.com/?a=1&b=2",
			},
		);
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<b>");
		expect(html).toContain("&lt;b&gt;Hi&lt;/b&gt;");
		expect(html).toContain(
			"<strong>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</strong>",
		);
		expect(html).toContain(
			'<a href="https://example.com/?a=1&amp;b=2" style="color:#000000;">Open</a>',
		);
		// A bare URL value becomes a link too.
		expect(html.match(/<a href=/g)).toHaveLength(2);
	});

	test("does not turn a non-URL value into a link target", () => {
		const html = renderEmailHtml("[Click]({{name}})", {
			name: "javascript:alert(1)",
		});
		expect(html).not.toContain('href="javascript');
	});

	test("overrides replace subject and body independently", () => {
		const rendered = renderEmailTemplate(
			"password_reset",
			{ subject: "Reset for {{name}}", body: null },
			{ name: "Ada", url: "https://example.com/reset" },
		);
		expect(rendered.subject).toBe("Reset for Ada");
		expect(rendered.text).toContain("https://example.com/reset");
		expect(rendered.text).toContain("Hey Ada,");
	});
});
