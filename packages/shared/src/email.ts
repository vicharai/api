import { Resend } from "resend";

// Sender and reply-to live in the platform config (`email.from`/`email.replyTo`).
const resendApiKey = process.env.RESEND_API_KEY;
const resendAudienceId = process.env.RESEND_AUDIENCE_ID ?? "";

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
	if (!resendApiKey) {
		return null;
	}
	resendClient ??= new Resend(resendApiKey);
	return resendClient;
}

export { resendAudienceId, getResendClient };
