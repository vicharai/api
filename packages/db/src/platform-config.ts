import { eq, sql } from "drizzle-orm";

import { logger } from "@llmgateway/logger";
import {
	parseStoredPlatformConfig,
	PLATFORM_CONFIG_SETTING_ID,
	resolvePlatformConfig,
	type PlatformConfig,
	type PlatformConfigState,
	type StoredPlatformConfig,
} from "@llmgateway/shared/platform-config";

import { invalidateCacheTags, systemSettingCacheTag } from "./cache-helpers.js";
import { db } from "./db.js";
import { systemSetting } from "./schema.js";

export const PLATFORM_CONFIG_CACHE_TAG = systemSettingCacheTag(
	PLATFORM_CONFIG_SETTING_ID,
);

/** Parse the stored row value, logging keys that no longer validate. */
export function parsePlatformConfigRow(
	value: string | null | undefined,
): StoredPlatformConfig {
	const { values, invalidKeys } = parseStoredPlatformConfig(value);
	if (invalidKeys.length > 0) {
		logger.warn("Ignoring invalid stored platform config keys", {
			invalidKeys,
		});
	}
	return values;
}

/** Current DB overrides, read straight from Postgres. */
export async function readStoredPlatformConfig(): Promise<StoredPlatformConfig> {
	const rows = await db
		.select({ value: systemSetting.value })
		.from(systemSetting)
		.where(eq(systemSetting.id, PLATFORM_CONFIG_SETTING_ID))
		.limit(1);
	return parsePlatformConfigRow(rows[0]?.value);
}

// Only the DB overrides are memoized; env and defaults resolve on every call.
const MEMO_TTL_MS = 10_000;
let memo: { stored: StoredPlatformConfig; expiresAt: number } | null = null;

async function getStoredPlatformConfig(): Promise<StoredPlatformConfig> {
	const now = Date.now();
	if (memo && memo.expiresAt > now) {
		return memo.stored;
	}
	const stored = await readStoredPlatformConfig();
	memo = { stored, expiresAt: now + MEMO_TTL_MS };
	return stored;
}

export function clearPlatformConfigMemo(): void {
	memo = null;
}

/** Effective values with their sources, for api and worker. */
export async function getPlatformConfigState(): Promise<PlatformConfigState> {
	return resolvePlatformConfig(await getStoredPlatformConfig());
}

/** Effective platform config for api and worker (10s in-process memo). */
export async function getPlatformConfig(): Promise<PlatformConfig> {
	return (await getPlatformConfigState()).values;
}

/** Sender and reply-to of outgoing email (`email.from`, `email.replyTo`). */
export async function getEmailSender(): Promise<{
	from: string;
	replyTo: string;
}> {
	const config = await getPlatformConfig();
	return { from: config["email.from"], replyTo: config["email.replyTo"] };
}

/** `retention.logRetentionDays`, for code that only needs the log window. */
export async function getLogRetentionDays(): Promise<number> {
	return (await getPlatformConfig())["retention.logRetentionDays"];
}

async function evictPlatformConfigCaches(): Promise<void> {
	clearPlatformConfigMemo();
	await invalidateCacheTags([PLATFORM_CONFIG_CACHE_TAG]);
}

/**
 * Merge validated overrides into the stored row in one statement, so
 * concurrent writers never drop each other's keys, then evict every cached
 * copy (this process's memo and the gateway's tagged entry).
 */
export async function mergeStoredPlatformConfig(
	patch: StoredPlatformConfig,
): Promise<void> {
	const json = JSON.stringify(patch);
	await db
		.insert(systemSetting)
		.values({ id: PLATFORM_CONFIG_SETTING_ID, enabled: true, value: json })
		.onConflictDoUpdate({
			target: systemSetting.id,
			set: {
				enabled: true,
				value: sql`(coalesce(${systemSetting.value}, '{}')::jsonb || ${json}::jsonb)::text`,
				updatedAt: new Date(),
			},
		});
	await evictPlatformConfigCaches();
}

/** Drop one override so the key falls back to env/default. */
export async function removeStoredPlatformConfigKey(
	key: string,
): Promise<void> {
	await db
		.update(systemSetting)
		.set({
			value: sql`(coalesce(${systemSetting.value}, '{}')::jsonb - ${key}::text)::text`,
			updatedAt: new Date(),
		})
		.where(eq(systemSetting.id, PLATFORM_CONFIG_SETTING_ID));
	await evictPlatformConfigCaches();
}
