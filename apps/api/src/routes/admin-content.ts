import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

import {
	getDefaultLegalMarkdown,
	getLegalOverride,
	LEGAL_PAGES,
	setLegalOverride,
} from "@/lib/legal-content.js";
import { adminMiddleware } from "@/middleware/admin.js";
import { sendTransactionalEmail } from "@/utils/email.js";

import { db, getEmailTemplateOverrides, tables } from "@llmgateway/db";
import {
	EMAIL_TEMPLATE_IDS,
	EMAIL_TEMPLATE_SAMPLE_VARIABLES,
	EMAIL_TEMPLATES,
	EMAIL_TEMPLATES_SETTING_ID,
	emailTemplateOverrideSchema,
	renderEmailTemplate,
	type EmailTemplateId,
	type EmailTemplateOverrides,
} from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";

export const adminContent = new OpenAPIHono<ServerTypes>();

adminContent.use("/*", adminMiddleware);

const json = <T extends z.ZodTypeAny>(schema: T) => ({
	content: { "application/json": { schema } },
});

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

const templateSchema = z.object({
	id: z.enum(EMAIL_TEMPLATE_IDS),
	label: z.string(),
	variables: z.array(z.string()),
	defaultSubject: z.string(),
	defaultBody: z.string(),
	subject: z.string().nullable(),
	body: z.string().nullable(),
});

function toTemplate(
	id: EmailTemplateId,
	overrides: EmailTemplateOverrides,
): z.infer<typeof templateSchema> {
	const definition = EMAIL_TEMPLATES[id];
	return {
		id,
		label: definition.label,
		variables: [...definition.variables],
		defaultSubject: definition.defaultSubject,
		defaultBody: definition.defaultBody,
		subject: overrides[id]?.subject ?? null,
		body: overrides[id]?.body ?? null,
	};
}

const listTemplates = createRoute({
	operationId: "admin_list_email_templates",
	method: "get",
	path: "/content/email-templates",
	responses: {
		200: {
			...json(z.object({ templates: z.array(templateSchema) })),
			description: "Editable transactional email templates.",
		},
	},
});

adminContent.openapi(listTemplates, async (c) => {
	const overrides = await getEmailTemplateOverrides();
	return c.json(
		{ templates: EMAIL_TEMPLATE_IDS.map((id) => toTemplate(id, overrides)) },
		200,
	);
});

const templateParams = z.object({ id: z.enum(EMAIL_TEMPLATE_IDS) });

const updateTemplate = createRoute({
	operationId: "admin_update_email_template",
	method: "put",
	path: "/content/email-templates/{id}",
	request: {
		params: templateParams,
		// null restores the default for that part.
		body: json(emailTemplateOverrideSchema),
	},
	responses: {
		200: {
			...json(z.object({ template: templateSchema })),
			description: "Template saved.",
		},
	},
});

adminContent.openapi(updateTemplate, async (c) => {
	const { id } = c.req.valid("param");
	const override = c.req.valid("json");
	const current = await getEmailTemplateOverrides();
	const cleared = override.subject === null && override.body === null;
	const overrides: EmailTemplateOverrides = Object.fromEntries([
		...Object.entries(current).filter(([key]) => key !== id),
		...(cleared ? [] : [[id, override]]),
	]);
	const value = JSON.stringify(overrides);
	await db
		.insert(tables.systemSetting)
		.values({ id: EMAIL_TEMPLATES_SETTING_ID, enabled: true, value })
		.onConflictDoUpdate({
			target: tables.systemSetting.id,
			set: { value, enabled: true, updatedAt: new Date() },
		});
	return c.json({ template: toTemplate(id, overrides) }, 200);
});

const testTemplate = createRoute({
	operationId: "admin_send_test_email_template",
	method: "post",
	path: "/content/email-templates/{id}/test",
	request: { params: templateParams },
	responses: {
		200: {
			...json(z.object({ sent: z.literal(true) })),
			description:
				"The saved template, filled with sample values, was sent to the calling admin.",
		},
	},
});

adminContent.openapi(testTemplate, async (c) => {
	const admin = c.get("user")!;
	const { id } = c.req.valid("param");
	const overrides = await getEmailTemplateOverrides();
	const rendered = renderEmailTemplate(
		id,
		overrides[id],
		EMAIL_TEMPLATE_SAMPLE_VARIABLES,
	);
	await sendTransactionalEmail({
		to: admin.email,
		subject: `[Test] ${rendered.subject}`,
		text: rendered.text,
		html: rendered.html,
		strict: true,
	});
	return c.json({ sent: true as const }, 200);
});

// ---------------------------------------------------------------------------
// Legal pages
// ---------------------------------------------------------------------------

const legalParams = z.object({ page: z.enum(LEGAL_PAGES) });

const legalSchema = z.object({
	page: z.enum(LEGAL_PAGES),
	markdown: z.string().nullable(),
	updatedAt: z.string().nullable(),
	defaultMarkdown: z.string().nullable(),
});

async function legalResponse(page: (typeof LEGAL_PAGES)[number]) {
	const [override, defaultMarkdown] = await Promise.all([
		getLegalOverride(page),
		getDefaultLegalMarkdown(page),
	]);
	return {
		page,
		markdown: override?.markdown ?? null,
		updatedAt: override?.updatedAt.toISOString() ?? null,
		defaultMarkdown,
	};
}

const getLegal = createRoute({
	operationId: "admin_get_legal_page",
	method: "get",
	path: "/content/legal/{page}",
	request: { params: legalParams },
	responses: {
		200: {
			...json(legalSchema),
			description:
				"The override (null = bundled default) and the bundled markdown.",
		},
	},
});

adminContent.openapi(getLegal, async (c) => {
	const { page } = c.req.valid("param");
	return c.json(await legalResponse(page), 200);
});

const putLegal = createRoute({
	operationId: "admin_update_legal_page",
	method: "put",
	path: "/content/legal/{page}",
	request: {
		params: legalParams,
		// null restores the bundled default.
		body: json(
			z.object({ markdown: z.string().trim().min(1).max(200000).nullable() }),
		),
	},
	responses: {
		200: { ...json(legalSchema), description: "Legal page saved." },
	},
});

adminContent.openapi(putLegal, async (c) => {
	const { page } = c.req.valid("param");
	const { markdown } = c.req.valid("json");
	await setLegalOverride(page, markdown);
	return c.json(await legalResponse(page), 200);
});
