import { isAdminEmail } from "@/middleware/admin.js";

import {
	db,
	invalidateCacheTags,
	systemSettingCacheTag,
	tables,
} from "@llmgateway/db";
import {
	BLOCKED_SIGNUP_IPS_SETTING_ID,
	GATEWAY_MAINTENANCE_SETTING_ID,
	parseSignupMode,
	SIGNUP_MODE_SETTING_ID,
	type GatewayMaintenance,
	type SignupMode,
} from "@llmgateway/shared";
import { normalizeIpRules } from "@llmgateway/shared/ip-rules";

export {
	ipRuleSchema,
	isIpBlocked,
	normalizeIpRules,
} from "@llmgateway/shared/ip-rules";

export interface PlatformControls {
	signupMode: SignupMode;
	blockedSignupIps: string[];
	maintenance: GatewayMaintenance;
}

const SETTING_IDS = [
	SIGNUP_MODE_SETTING_ID,
	BLOCKED_SIGNUP_IPS_SETTING_ID,
	GATEWAY_MAINTENANCE_SETTING_ID,
];

export async function getPlatformControls(): Promise<PlatformControls> {
	const rows = await db.query.systemSetting.findMany({
		where: { id: { in: SETTING_IDS } },
	});
	const byId = new Map(rows.map((row) => [row.id, row]));
	const ips = byId.get(BLOCKED_SIGNUP_IPS_SETTING_ID);
	const maintenance = byId.get(GATEWAY_MAINTENANCE_SETTING_ID);
	return {
		signupMode: parseSignupMode(byId.get(SIGNUP_MODE_SETTING_ID)?.value),
		blockedSignupIps:
			ips?.enabled && ips.value ? ips.value.split(",").filter(Boolean) : [],
		maintenance: {
			enabled: maintenance?.enabled ?? false,
			message: maintenance?.value ?? null,
		},
	};
}

async function upsertSetting(
	id: string,
	enabled: boolean,
	value: string | null,
) {
	await db
		.insert(tables.systemSetting)
		.values({ id, enabled, value })
		.onConflictDoUpdate({
			target: tables.systemSetting.id,
			set: { enabled, value, updatedAt: new Date() },
		});
}

export async function updatePlatformControls(input: {
	signupMode?: SignupMode;
	blockedSignupIps?: string[];
	maintenance?: { enabled: boolean; message?: string | null };
}): Promise<PlatformControls> {
	if (input.signupMode !== undefined) {
		await upsertSetting(
			SIGNUP_MODE_SETTING_ID,
			input.signupMode !== "open",
			input.signupMode,
		);
	}
	if (input.blockedSignupIps !== undefined) {
		const rules = normalizeIpRules(input.blockedSignupIps);
		await upsertSetting(
			BLOCKED_SIGNUP_IPS_SETTING_ID,
			rules.length > 0,
			rules.join(","),
		);
	}
	if (input.maintenance !== undefined) {
		const message = input.maintenance.message?.trim() || null;
		await upsertSetting(
			GATEWAY_MAINTENANCE_SETTING_ID,
			input.maintenance.enabled,
			message,
		);
		// The gateway caches this row; evict it so the toggle applies at once.
		await invalidateCacheTags([
			systemSettingCacheTag(GATEWAY_MAINTENANCE_SETTING_ID),
		]);
	}
	return await getPlatformControls();
}

async function hasPendingInvite(email: string): Promise<boolean> {
	const invite = await db.query.organizationInvite.findFirst({
		where: {
			email: { eq: email },
			status: { eq: "pending" },
			expiresAt: { gt: new Date() },
		},
		columns: { id: true },
	});
	return invite !== undefined;
}

/**
 * Whether the signup mode lets this email create an account. ADMIN_EMAILS can
 * always sign up; invite-only additionally admits pending org invitations.
 */
export async function isSignupAllowedByMode(
	mode: SignupMode,
	email: string | null | undefined,
): Promise<boolean> {
	if (mode === "open") {
		return true;
	}
	const normalized = email?.trim().toLowerCase();
	if (!normalized) {
		return false;
	}
	if (isAdminEmail(normalized)) {
		return true;
	}
	return mode === "invite_only" && (await hasPendingInvite(normalized));
}

export async function getSignupMode(): Promise<SignupMode> {
	const row = await db.query.systemSetting.findFirst({
		where: { id: SIGNUP_MODE_SETTING_ID },
		columns: { value: true },
	});
	return parseSignupMode(row?.value);
}
