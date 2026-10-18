import { z } from "zod";

/** system_setting row holding admin overrides, keyed by template id. */
export const EMAIL_TEMPLATES_SETTING_ID = "email_templates";

export const EMAIL_TEMPLATE_IDS = [
	"welcome",
	"verification",
	"password_reset",
	"low_balance",
	"payment_receipt",
	"auto_topup_failed",
] as const;

export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];

export interface EmailTemplateDefinition {
	id: EmailTemplateId;
	label: string;
	variables: readonly string[];
	defaultSubject: string;
	/** Markdown-lite: blank-line paragraphs, **bold**, [text](url). */
	defaultBody: string;
}

export const EMAIL_TEMPLATES: Record<EmailTemplateId, EmailTemplateDefinition> =
	{
		welcome: {
			id: "welcome",
			label: "Welcome / getting started (24h after signup, no credits yet)",
			variables: ["email", "dashboardUrl", "docsUrl"],
			defaultSubject:
				"Get started with Vichar - Add credits to unlock all models",
			defaultBody: `Hi there,

Thanks for signing up for Vichar! We noticed you haven't added any credits yet.

With credits you can access 300+ AI models from OpenAI, Anthropic, Google, and more through a single API. Here's how to get started:

1. Log in at {{dashboardUrl}}
2. Add credits under Billing (the wallet icon in the sidebar)
3. Create an API key
4. Start making requests using the OpenAI-compatible API

Read our quickstart here: {{docsUrl}}/quick-start

If you have any questions, just reply to this email and we'll be happy to help.

Best,
The Vichar Team`,
		},
		verification: {
			id: "verification",
			label: "Email verification",
			variables: ["name", "url"],
			defaultSubject: "Verify your email for Vichar",
			defaultBody: `Hey {{name}}!

Welcome to Vichar! Glad to have you here.

First things first, verify your email by clicking the link below:

{{url}}

Quick question: what made you sign up? We'd love to know what you're building or what caught your eye. Just hit reply and let us know.

If you didn't create this account, feel free to ignore this.

Cheers,
The Vichar Team`,
		},
		password_reset: {
			id: "password_reset",
			label: "Password reset",
			variables: ["name", "url"],
			defaultSubject: "Reset your Vichar password",
			defaultBody: `Hey {{name}},

We received a request to reset the password for your Vichar account.

Click the link below to set a new password. It expires in 1 hour:

{{url}}

If you didn't request this, you can safely ignore this email. Your password won't change.

The Vichar Team`,
		},
		low_balance: {
			id: "low_balance",
			label: "Low balance alert",
			variables: [
				"currentBalance",
				"thresholdLabel",
				"dashboardUrl",
				"billingUrl",
			],
			defaultSubject: "Your Vichar credits are running low",
			defaultBody: `Hi there,

Your Vichar credit balance has dropped below {{thresholdLabel}} of your last top-up.

Current balance: \${{currentBalance}}

To keep your API access uninterrupted:

1. Top up now: {{dashboardUrl}}
2. Enable auto-reload: {{billingUrl}} (scroll to Auto Top-Up)

Auto-reload ensures you never run out — your card is charged automatically when credits get low.

Best,
The Vichar Team`,
		},
		payment_receipt: {
			id: "payment_receipt",
			label: "Payment receipt (invoice PDF attached)",
			variables: [
				"organizationName",
				"invoiceNumber",
				"invoiceDate",
				"amount",
				"currency",
			],
			defaultSubject: "Invoice {{invoiceNumber}} - Vichar",
			defaultBody: `Thank you for your payment!

Please find your invoice attached to this email.

**Invoice Number:** {{invoiceNumber}}
**Date:** {{invoiceDate}}
**Total:** {{currency}} {{amount}}`,
		},
		auto_topup_failed: {
			id: "auto_topup_failed",
			label: "Auto top-up failed",
			variables: [
				"organizationName",
				"reason",
				"amount",
				"currency",
				"billingUrl",
			],
			defaultSubject: "Auto top-up payment failed",
			defaultBody: `Hi there,

We were unable to process a payment for **{{organizationName}}**.

{{reason}}

Amount: {{currency}} {{amount}}

To ensure uninterrupted service, please update your payment information as soon as possible: [Update payment method]({{billingUrl}})

If you believe this is an error or need assistance, please reply to this email and we'll be happy to help.`,
		},
	};

export const emailTemplateOverrideSchema = z.object({
	subject: z.string().trim().min(1).max(300).nullable(),
	body: z.string().trim().min(1).max(20000).nullable(),
});

export type EmailTemplateOverride = z.infer<typeof emailTemplateOverrideSchema>;

export const emailTemplateOverridesSchema = z
	.object(
		Object.fromEntries(
			EMAIL_TEMPLATE_IDS.map((id) => [id, emailTemplateOverrideSchema]),
		) as Record<EmailTemplateId, typeof emailTemplateOverrideSchema>,
	)
	.partial();

export type EmailTemplateOverrides = z.infer<
	typeof emailTemplateOverridesSchema
>;

export type EmailTemplateVariables = Record<string, string>;

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const URL_ONLY = /^https?:\/\/\S+$/;

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#x27;");
}

/** Replaces {{var}} tokens; unknown variables render as empty strings. */
export function substituteVariables(
	template: string,
	variables: EmailTemplateVariables,
): string {
	return template.replace(TOKEN, (_, name: string) => variables[name] ?? "");
}

/**
 * Markdown-lite to HTML. The template is escaped before any markup is
 * produced and variable values are escaped on insertion, so neither the
 * template author nor a variable value can inject HTML.
 */
export function renderEmailHtml(
	body: string,
	variables: EmailTemplateVariables,
): string {
	const value = (name: string) => escapeHtml(variables[name] ?? "");
	const paragraphs = escapeHtml(body.replace(/\r\n/g, "\n"))
		.split(/\n{2,}/)
		.map((paragraph) =>
			paragraph
				.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
				.replace(
					/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\{\{\s*[a-zA-Z0-9_]+\s*\}\})\)/g,
					(_, text: string, href: string) =>
						`<a href="${href}" style="color:#000000;">${text}</a>`,
				)
				.replace(/\n/g, "<br>"),
		)
		.map(
			(paragraph) =>
				`<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#333333;">${paragraph}</p>`,
		)
		.join("\n");
	// Tokens inside an href take the value only when it is an http(s) URL;
	// elsewhere a URL value becomes a link.
	const html = paragraphs
		.replace(
			/href="\{\{\s*([a-zA-Z0-9_]+)\s*\}\}"/g,
			(_, name: string) =>
				`href="${URL_ONLY.test(variables[name] ?? "") ? value(name) : "#"}"`,
		)
		.replace(TOKEN, (_, name: string) => {
			const raw = variables[name] ?? "";
			return URL_ONLY.test(raw)
				? `<a href="${value(name)}" style="color:#000000;">${value(name)}</a>`
				: value(name);
		});
	return `<!DOCTYPE html>
<html lang="en">
	<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
	<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#ffffff;">
		<div style="max-width:600px;margin:0 auto;">
${html}
		</div>
	</body>
</html>`;
}

export interface RenderedEmail {
	subject: string;
	text: string;
	html: string;
}

/** Renders a template, preferring the admin override for subject and body. */
export function renderEmailTemplate(
	id: EmailTemplateId,
	override: EmailTemplateOverride | undefined,
	variables: EmailTemplateVariables,
): RenderedEmail {
	const definition = EMAIL_TEMPLATES[id];
	const subject = override?.subject ?? definition.defaultSubject;
	const body = override?.body ?? definition.defaultBody;
	return {
		subject: substituteVariables(subject, variables).replace(/\s+/g, " "),
		text: substituteVariables(body, variables),
		html: renderEmailHtml(body, variables),
	};
}

/** Sample values for previews and test sends. */
export const EMAIL_TEMPLATE_SAMPLE_VARIABLES: EmailTemplateVariables = {
	name: "Ada",
	email: "ada@example.com",
	url: "https://example.com/action",
	dashboardUrl: "https://example.com/dashboard",
	docsUrl: "https://example.com/docs",
	billingUrl: "https://example.com/billing",
	organizationName: "Example Organization",
	invoiceNumber: "INV-0001",
	invoiceDate: "January 1, 2026",
	amount: "25.00",
	currency: "USD",
	reason: "Your auto top-up charge could not be completed.",
	currentBalance: "4.20",
	thresholdLabel: "20%",
};
