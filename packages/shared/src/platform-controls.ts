import { z } from "zod";

/** `system_setting` rows behind the admin platform controls. */
export const SIGNUP_MODE_SETTING_ID = "signup_mode";
export const BLOCKED_SIGNUP_IPS_SETTING_ID = "blocked_signup_ips";
export const GATEWAY_MAINTENANCE_SETTING_ID = "gateway_maintenance";
export const ADMIN_DIGEST_SETTING_ID = "admin_digest";

/** Redis key the worker refreshes on every heartbeat (ISO timestamp). */
export const WORKER_HEARTBEAT_KEY = "worker:heartbeat";

export const SIGNUP_MODES = ["open", "invite_only", "closed"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

export function parseSignupMode(value: string | null | undefined): SignupMode {
	return SIGNUP_MODES.find((mode) => mode === value) ?? "open";
}

export const DEFAULT_MAINTENANCE_MESSAGE =
	"The API is temporarily down for maintenance. Please retry shortly.";

export interface GatewayMaintenance {
	enabled: boolean;
	message: string | null;
}

export const adminDigestSettingsSchema = z.object({
	enabled: z.boolean(),
	hourUtc: z.number().int().min(0).max(23),
});

export type AdminDigestSettings = z.infer<typeof adminDigestSettingsSchema>;

export const DEFAULT_ADMIN_DIGEST_SETTINGS: AdminDigestSettings = {
	enabled: false,
	hourUtc: 8,
};

/** Parse the stored JSON value; missing or invalid input yields the defaults. */
export function parseAdminDigestSettings(
	value: string | null | undefined,
): AdminDigestSettings {
	if (!value) {
		return DEFAULT_ADMIN_DIGEST_SETTINGS;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return DEFAULT_ADMIN_DIGEST_SETTINGS;
	}
	const result = adminDigestSettingsSchema.safeParse(parsed);
	return result.success ? result.data : DEFAULT_ADMIN_DIGEST_SETTINGS;
}

/**
 * Transaction types that represent an actual customer payment. Gifts, refunds
 * and bookkeeping rows never count.
 */
export const PAID_TRANSACTION_TYPES = [
	"credit_topup",
	"credit_manual_payment",
	"enterprise_license_fee",
	"subscription_start",
	"dev_plan_start",
	"dev_plan_upgrade",
	"dev_plan_renewal",
	"dev_plan_reset_pass",
	"chat_plan_start",
	"chat_plan_upgrade",
	"chat_plan_renewal",
	"end_user_topup",
] as const;
