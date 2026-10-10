import { isOrgOwnerEmailVerified } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import {
	fromEmail,
	getResendClient,
	replyToEmail,
} from "@llmgateway/shared/email";

import {
	getBillingPageUrl,
	type BillingOrganizationKind,
} from "./billing-url.js";

/**
 * Escapes HTML special characters to prevent XSS attacks
 */
function escapeHtml(text: string): string {
	const htmlEscapeMap: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#x27;",
		"/": "&#x2F;",
	};
	return text.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
}

export interface TransactionalEmailOptions {
	to: string;
	subject: string;
	html?: string;
	text?: string;
	attachments?: Array<{
		filename: string;
		content: Buffer;
		contentType?: string;
	}>;
	/**
	 * When true, the function rejects on unexpected misconfiguration and
	 * delivery failures instead of silently logging. Intentional policy skips
	 * still resolve. Use for flows where the caller must know whether the email
	 * was actually queued (e.g. password reset).
	 */
	strict?: boolean;
	/**
	 * When true, the email body (html/text) is omitted from the
	 * non-production debug log. The caller is expected to log any
	 * sensitive fields (tokens, signed URLs) separately under explicit
	 * keys so they can be filtered or audited.
	 */
	logSafe?: boolean;
	/**
	 * When set, the email is only sent if the organization's owner has a
	 * verified account email. If the owner is unverified the send is skipped
	 * and logged (policy: never send transactional emails to unverified
	 * accounts). Omit only for emails that must reach unverified addresses,
	 * such as the email-verification and password-reset emails.
	 */
	organizationId?: string;
	/**
	 * Upper bound for the Resend request. When exceeded the send rejects, so a
	 * caller holding a transaction open is not pinned by a slow provider.
	 */
	timeoutMs?: number;
}

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(message)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isReservedEmailAddress(email: string): boolean {
	const separatorIndex = email.lastIndexOf("@");
	if (separatorIndex === -1) {
		return false;
	}

	const domain = email.slice(separatorIndex + 1).toLowerCase();
	const reservedDomains = [
		"example",
		"invalid",
		"localhost",
		"test",
		"example.com",
		"example.net",
		"example.org",
	];

	return reservedDomains.some(
		(reserved) => domain === reserved || domain.endsWith(`.${reserved}`),
	);
}

export async function sendTransactionalEmail({
	to,
	subject,
	html,
	text,
	attachments,
	strict = false,
	logSafe = false,
	organizationId,
	timeoutMs,
}: TransactionalEmailOptions): Promise<void> {
	if (process.env.NODE_ENV === "production" && isReservedEmailAddress(to)) {
		logger.info("Skipping transactional email to reserved domain", {
			to,
			subject,
		});
		return;
	}

	// Policy gate: never send org-scoped transactional emails to an
	// organization whose owner has not verified their email.
	if (organizationId && !(await isOrgOwnerEmailVerified(organizationId))) {
		logger.warn(
			"Skipping transactional email: organization owner email not verified",
			{ to, subject, organizationId },
		);
		return;
	}

	// In non-production environments, just log the email content
	if (process.env.NODE_ENV !== "production") {
		logger.info("Email content (not sent in non-production)", {
			to,
			subject,
			...(logSafe ? {} : { html, text }),
			attachments: attachments?.map((a) => ({
				filename: a.filename,
				size: a.content.length,
			})),
			from: fromEmail,
			replyTo: replyToEmail,
		});
		return;
	}

	const client = getResendClient();
	if (!client) {
		const err = new Error(
			`Resend not configured for email to ${to} with subject: ${subject}`,
		);
		logger.error(
			"RESEND_API_KEY is not configured. Transactional email will not be sent.",
			err,
		);
		if (strict) {
			throw err;
		}
		return;
	}

	try {
		const emailPayload = {
			from: fromEmail,
			to: [to],
			replyTo: replyToEmail,
			subject,
			attachments: attachments?.map((att) => ({
				filename: att.filename,
				content: att.content,
				contentType: att.contentType,
			})),
		};

		const send = client.emails.send(
			text ? { ...emailPayload, text } : { ...emailPayload, html: html ?? "" },
		);
		const { data, error } = await (timeoutMs
			? withTimeout(
					send,
					timeoutMs,
					`Resend did not respond within ${timeoutMs}ms`,
				)
			: send);

		if (error) {
			throw new Error(`Resend API error: ${error.message}`);
		}

		logger.info("Transactional email sent successfully", {
			to,
			subject,
			hasAttachments: !!attachments?.length,
			messageId: data?.id,
		});
	} catch (error) {
		logger.error(
			"Failed to send transactional email",
			error instanceof Error ? error : new Error(String(error)),
		);
		if (strict) {
			throw error instanceof Error ? error : new Error(String(error));
		}
	}
}

export interface PaymentFailureDetails {
	errorMessage: string;
	errorCode?: string;
	declineCode?: string;
	amount?: number;
	currency?: string;
	/** Stripe hosted invoice page, set when the bank requires authentication. */
	payInvoiceUrl?: string;
}

export interface EmailOrganization {
	id: string;
	name: string;
	kind: BillingOrganizationKind;
}

export function generatePaymentFailureEmailHtml(
	organization: EmailOrganization,
	details: PaymentFailureDetails,
): string {
	const escapedOrgName = escapeHtml(organization.name);
	const escapedErrorMessage = escapeHtml(details.errorMessage);
	const billingUrl = getBillingPageUrl(organization);
	const requiresAuthentication =
		details.errorCode === "authentication_required" ||
		details.declineCode === "authentication_required";
	// The hosted invoice is the only place a cardholder can answer the bank's
	// authentication request for an off-session renewal.
	const ctaUrl =
		requiresAuthentication && details.payInvoiceUrl
			? details.payInvoiceUrl
			: billingUrl;
	const ctaLabel =
		ctaUrl === billingUrl ? "Update Payment Method" : "Complete Payment";

	// Escape currency and handle zero amount case properly
	const escapedCurrency = details.currency
		? escapeHtml(details.currency)
		: null;
	const formattedAmount =
		details.amount !== undefined && details.amount !== null && escapedCurrency
			? `${escapedCurrency} ${details.amount.toFixed(2)}`
			: null;

	let actionMessage = "Please update your payment method and try again.";
	if (requiresAuthentication) {
		actionMessage =
			"Your bank asked to verify this payment, which can't happen automatically for a renewal. Please confirm the payment with your bank to keep your plan active.";
	} else if (details.declineCode === "insufficient_funds") {
		actionMessage =
			"Please ensure your card has sufficient funds or use a different payment method.";
	} else if (
		details.declineCode === "expired_card" ||
		details.errorCode === "expired_card"
	) {
		actionMessage = "Your card has expired. Please update your payment method.";
	} else if (
		details.declineCode === "lost_card" ||
		details.declineCode === "stolen_card"
	) {
		actionMessage =
			"This card cannot be used. Please add a different payment method.";
	}

	return `
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Payment Failed - Vichar</title>
	</head>
	<body
		style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff;"
	>
		<table role="presentation" style="width: 100%; border-collapse: collapse;">
			<tr>
				<td align="center" style="padding: 40px 20px;">
					<table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse;">
						<!-- Header -->
						<tr>
							<td
								style="background-color: #dc2626; padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;"
							>
								<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Payment Failed</h1>
							</td>
						</tr>

						<!-- Main Content -->
						<tr>
							<td style="background-color: #f8f9fa; padding: 40px 30px; border-radius: 0 0 8px 8px;">
								<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">
									Hi there,
								</p>

								<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">
									We were unable to process a payment for <strong>${escapedOrgName}</strong>.
								</p>

								<!-- Error Details Box -->
								<div
									style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 20px; margin-bottom: 20px;"
								>
									<p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #991b1b;">
										Error Details:
									</p>
									<p style="margin: 0; font-size: 14px; color: #7f1d1d;">
										${escapedErrorMessage}
									</p>
									${formattedAmount ? `<p style="margin: 10px 0 0 0; font-size: 14px; color: #7f1d1d;">Amount: ${formattedAmount}</p>` : ""}
								</div>

								<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">
									${escapeHtml(actionMessage)}
								</p>

								<p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #333333;">
									${
										ctaUrl === billingUrl
											? "To ensure uninterrupted service, please update your payment information as soon as possible."
											: `To ensure uninterrupted service, please complete the payment as soon as possible. You can also <a href="${billingUrl}" style="color: #000000;">update your payment method</a> first.`
									}
								</p>

								<!-- CTA Button -->
								<table role="presentation" style="width: 100%; border-collapse: collapse;">
									<tr>
										<td align="center" style="padding: 10px 0;">
											<a
												href="${ctaUrl}"
												style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;"
											>${ctaLabel}</a>
										</td>
									</tr>
								</table>

								<p style="margin: 30px 0 0 0; font-size: 14px; line-height: 1.6; color: #666666;">
									If you believe this is an error or need assistance, please reply to this email and we'll be happy to
									help.
								</p>
							</td>
						</tr>

						<!-- Footer -->
						<tr>
							<td
								style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; border-top: 1px solid #e9ecef;"
							>
								<p style="margin: 0 0 12px; color: #666666; font-size: 14px; line-height: 1.6;">
									Need help? Check out our <a
									href="https://app.vichar.io" style="color: #000000; text-decoration: none;"
								>documentation</a> or reply to this email for any questions.
								</p>
								<p style="margin: 0; color: #999999; font-size: 12px;">
									© 2025 Vichar. All rights reserved. This is a transactional email and it can't be unsubscribed from.
								</p>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>
	`.trim();
}

export function generateAutoJoinEmailHtml(
	userName: string,
	organizationName: string,
	organizationId: string,
): string {
	const escapedOrgName = escapeHtml(organizationName);
	const greetingName = userName.trim() ? escapeHtml(userName.trim()) : "there";
	const uiUrl = process.env.UI_URL ?? "https://app.vichar.io";
	const dashboardUrl = `${uiUrl}/dashboard/${encodeURIComponent(organizationId)}`;

	return `
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>You've been added to ${escapedOrgName} - Vichar</title>
	</head>
	<body
		style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff;"
	>
		<table role="presentation" style="width: 100%; border-collapse: collapse;">
			<tr>
				<td align="center" style="padding: 40px 20px;">
					<table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse;">
						<!-- Header -->
						<tr>
							<td
								style="background-color: #000000; padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;"
							>
								<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Welcome to ${escapedOrgName}</h1>
							</td>
						</tr>

						<!-- Main Content -->
						<tr>
							<td style="background-color: #f8f9fa; padding: 40px 30px; border-radius: 0 0 8px 8px;">
								<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">
									Hi ${greetingName},
								</p>

								<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">
									You've been added to <strong>${escapedOrgName}</strong> on Vichar because your
									email domain matches the organization's single sign-on settings. You now have access
									to its projects and shared resources.
								</p>

								<!-- CTA Button -->
								<table role="presentation" style="width: 100%; border-collapse: collapse;">
									<tr>
										<td align="center" style="padding: 10px 0;">
											<a
												href="${dashboardUrl}"
												style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;"
											>Open dashboard</a>
										</td>
									</tr>
								</table>

								<p style="margin: 30px 0 0 0; font-size: 14px; line-height: 1.6; color: #666666;">
									If you don't think you should have access to this organization, please reply to this
									email and we'll help sort it out.
								</p>
							</td>
						</tr>

						<!-- Footer -->
						<tr>
							<td
								style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; border-top: 1px solid #e9ecef;"
							>
								<p style="margin: 0 0 12px; color: #666666; font-size: 14px; line-height: 1.6;">
									Need help? Check out our <a
									href="https://app.vichar.io" style="color: #000000; text-decoration: none;"
								>documentation</a> or reply to this email for any questions.
								</p>
								<p style="margin: 0; color: #999999; font-size: 12px;">
									© 2025 Vichar. All rights reserved. This is a transactional email and it can't be unsubscribed from.
								</p>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>
	`.trim();
}
