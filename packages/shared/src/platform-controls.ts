export const SIGNUP_MODE_SETTING_ID = "signup_mode";
export const BLOCKED_SIGNUP_IPS_SETTING_ID = "blocked_signup_ips";
export const GATEWAY_MAINTENANCE_SETTING_ID = "gateway_maintenance";
export const ADMIN_DIGEST_SETTING_ID = "admin_digest";

export const SIGNUP_MODES = ["open", "invite_only", "closed"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

export const DEFAULT_MAINTENANCE_MESSAGE =
	"Vichar is undergoing maintenance. Please retry shortly.";

export interface GatewayMaintenance {
	enabled: boolean;
	message: string | null;
}

export function parseSignupMode(value: string | null | undefined): SignupMode {
	return (SIGNUP_MODES as readonly string[]).includes(value ?? "")
		? (value as SignupMode)
		: "open";
}

export function parseStringList(value: string | null | undefined): string[] {
	if (!value) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

export interface AdminDigestSettings {
	enabled: boolean;
	hourUtc: number;
}

export function parseAdminDigestHour(value: string | null | undefined): number {
	const hour = Number(value);
	return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 8;
}
