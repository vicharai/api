import ipaddr from "ipaddr.js";
import { z } from "zod";

import { isAdminEmail } from "@/middleware/admin.js";

import { db, drizzleCache, tables } from "@llmgateway/db";
import {
	BLOCKED_SIGNUP_IPS_SETTING_ID,
	GATEWAY_MAINTENANCE_SETTING_ID,
	parseSignupMode,
	SIGNUP_MODE_SETTING_ID,
	systemSettingCacheTag,
	type GatewayMaintenance,
	type SignupMode,
} from "@llmgateway/shared";

export interface PlatformControls {
	signupMode: SignupMode;
	blockedSignupIps: string[];
	maintenance: GatewayMaintenance;
}

type IpRange = [ipaddr.IPv4 | ipaddr.IPv6, number];

function parseAddress(value: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
	if (ipaddr.IPv4.isValidFourPartDecimal(value)) {
		return ipaddr.IPv4.parse(value);
	}
	if (ipaddr.IPv6.isValid(value)) {
		return ipaddr.IPv6.parse(value);
	}
	return null;
}

function parseIpRule(rule: string): IpRange | null {
	const [address, bitsText, ...rest] = rule.trim().split("/");
	if (rest.length > 0 || !address) {
		return null;
	}
	const parsed = parseAddress(address);
	if (!parsed) {
		return null;
	}
	const maxBits = parsed.kind() === "ipv4" ? 32 : 128;
	if (bitsText === undefined) {
		return [parsed, maxBits];
	}
	if (!/^\d{1,3}$/.test(bitsText) || Number(bitsText) > maxBits) {
		return null;
	}
	return [parsed, Number(bitsText)];
}

export const ipRuleSchema = z
	.string()
	.trim()
	.max(64)
	.refine(
		(value) => parseIpRule(value) !== null,
		"Enter an IPv4/IPv6 address or CIDR range such as 203.0.113.0/24.",
	);

/** Canonical, deduped form of the given rules. Throws on an invalid rule. */
export function normalizeIpRules(rules: string[]): string[] {
	const normalized = rules.map((rule) => {
		const range = parseIpRule(rule);
		if (!range) {
			throw new Error(`Invalid IP rule: ${rule}`);
		}
		const [addr, bits] = range;
		const maxBits = addr.kind() === "ipv4" ? 32 : 128;
		return bits === maxBits ? addr.toString() : `${addr.toString()}/${bits}`;
	});
	return [...new Set(normalized)];
}

function rangeContains(range: IpRange, client: ipaddr.IPv4 | ipaddr.IPv6) {
	const [addr, bits] = range;
	if (addr.kind() === "ipv4" && client.kind() === "ipv4") {
		return (client as ipaddr.IPv4).match(addr as ipaddr.IPv4, bits);
	}
	if (addr.kind() === "ipv6" && client.kind() === "ipv6") {
		return (client as ipaddr.IPv6).match(addr as ipaddr.IPv6, bits);
	}
	return false;
}

/** IPv4-mapped IPv6 clients are matched as their IPv4 address. */
export function isIpBlocked(ip: string | null, rules: string[]): boolean {
	const parsed = ip ? parseAddress(ip) : null;
	if (!parsed) {
		return false;
	}
	const client =
		parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()
			? (parsed as ipaddr.IPv6).toIPv4Address()
			: parsed;
	return rules.some((rule) => {
		const range = parseIpRule(rule);
		return range !== null && rangeContains(range, client);
	});
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
		await drizzleCache.onMutate({
			tags: [systemSettingCacheTag(GATEWAY_MAINTENANCE_SETTING_ID)],
		});
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
