import { resolveEmailTemplate } from "@llmgateway/db";

import { sendTransactionalEmail } from "./email.js";

import type { TransactionalEmailOptions } from "./email.js";
import type {
	EmailTemplateId,
	EmailTemplateVariables,
} from "@llmgateway/shared";

/**
 * Sends an email built from an admin-editable template (Admin → Content).
 * Without an override, `builtIn` (the richer hard-coded HTML email) is sent
 * when given, otherwise the default template as plain text.
 */
export async function sendTemplatedEmail(
	id: EmailTemplateId,
	variables: EmailTemplateVariables,
	options: Omit<TransactionalEmailOptions, "subject" | "html" | "text">,
	builtIn?: { subject: string; html: string },
): Promise<void> {
	const rendered = await resolveEmailTemplate(id, variables);
	if (rendered.overridden) {
		await sendTransactionalEmail({
			...options,
			subject: rendered.subject,
			text: rendered.text,
			html: rendered.html,
		});
		return;
	}
	await sendTransactionalEmail(
		builtIn
			? { ...options, ...builtIn }
			: { ...options, subject: rendered.subject, text: rendered.text },
	);
}
