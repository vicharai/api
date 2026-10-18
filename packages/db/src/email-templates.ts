import { logger } from "@llmgateway/logger";
import {
	EMAIL_TEMPLATES_SETTING_ID,
	emailTemplateOverridesSchema,
	renderEmailTemplate,
	type EmailTemplateId,
	type EmailTemplateOverrides,
	type EmailTemplateVariables,
	type RenderedEmail,
} from "@llmgateway/shared";

import { db } from "./db.js";

/** Admin email template overrides (Admin → Content). */
export async function getEmailTemplateOverrides(): Promise<EmailTemplateOverrides> {
	const row = await db.query.systemSetting.findFirst({
		where: { id: { eq: EMAIL_TEMPLATES_SETTING_ID } },
		columns: { value: true },
	});
	if (!row?.value) {
		return {};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(row.value);
	} catch (error) {
		// A broken row must not stop verification or reset emails; fall back
		// to the bundled templates.
		logger.error("Invalid email_templates setting JSON", error as Error);
		return {};
	}
	const result = emailTemplateOverridesSchema.safeParse(parsed);
	if (!result.success) {
		logger.error("Invalid email_templates setting", {
			issues: result.error.issues,
		});
		return {};
	}
	return result.data;
}

/**
 * Renders a template with any admin override applied. `overridden` tells
 * callers with a richer built-in HTML template whether to use the result.
 */
export async function resolveEmailTemplate(
	id: EmailTemplateId,
	variables: EmailTemplateVariables,
): Promise<RenderedEmail & { overridden: boolean }> {
	const override = (await getEmailTemplateOverrides())[id];
	return {
		...renderEmailTemplate(id, override, variables),
		overridden: Boolean(override?.subject ?? override?.body),
	};
}
