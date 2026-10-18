import { isPublicIp } from "@/lib/client-ip.js";

import { redisClient } from "@llmgateway/cache";
import { getPlatformConfig } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import { platformConfigValue, type PlatformConfig } from "@llmgateway/shared";

import type { AbuseIpReport } from "@llmgateway/db";

const ABUSE_IPDB_CHECK_URL = "https://api.abuseipdb.com/api/v2/check";
const LOOKUP_TIMEOUT_MS = 3000;
const REPORT_CACHE_TTL_SECONDS = 60 * 60 * 24;
/** Cached in place of a report when AbuseIPDB has nothing on the address. */
const NO_REPORT = "none";

export function isAbuseCheckConfigured(): boolean {
	return Boolean(process.env.ABUSE_IPDB_API_KEY);
}

/**
 * Minimum AbuseIPDB confidence score (0-100) that counts as abusive
 * (`abuse.abuseIpdbScoreThreshold`). 50 is AbuseIPDB's own "likely abusive"
 * mark; lower it to catch more, raise it to only flag addresses with a strong
 * reporting history.
 */
export function getAbuseScoreThreshold(config?: PlatformConfig): number {
	return platformConfigValue("abuse.abuseIpdbScoreThreshold", config);
}

/** Whether a report crosses the configured confidence threshold. */
export function isAbusiveReport(
	report: AbuseIpReport | null | undefined,
	config?: PlatformConfig,
): report is AbuseIpReport {
	return Boolean(
		report && report.abuseConfidenceScore >= getAbuseScoreThreshold(config),
	);
}

export function getAbuseIpCacheKey(ip: string): string {
	return `abuse_ip:${ip.trim().toLowerCase()}`;
}

/** Human-readable summary of a report, used in logs and admin notifications. */
export function describeAbuseReport(report: AbuseIpReport): string {
	const parts = [`confidence ${report.abuseConfidenceScore}%`];
	if (report.totalReports !== undefined) {
		parts.push(`${report.totalReports} reports`);
	}
	if (report.usageType) {
		parts.push(report.usageType);
	}
	if (report.isTor) {
		parts.push("Tor exit node");
	}
	return `AbuseIPDB: ${parts.join(", ")}`;
}

function parseReport(payload: unknown, ip: string): AbuseIpReport | null {
	if (!payload || typeof payload !== "object") {
		return null;
	}
	const data = (payload as { data?: unknown }).data;
	if (!data || typeof data !== "object") {
		return null;
	}
	const record = data as Record<string, unknown>;
	const score = Number(record.abuseConfidenceScore);
	if (!Number.isFinite(score)) {
		return null;
	}

	// A whitelisted address (AbuseIPDB's allowlist of search-engine crawlers,
	// major clouds' egress, and similar) is never treated as abusive, whatever
	// score reporters gave it.
	if (record.isWhitelisted === true) {
		return null;
	}

	const asString = (value: unknown): string | null =>
		typeof value === "string" && value.trim() ? value.trim() : null;

	return {
		ipAddress: asString(record.ipAddress) ?? ip,
		abuseConfidenceScore: score,
		totalReports: Number.isFinite(Number(record.totalReports))
			? Number(record.totalReports)
			: undefined,
		countryCode: asString(record.countryCode),
		usageType: asString(record.usageType),
		isp: asString(record.isp),
		domain: asString(record.domain),
		isTor: record.isTor === true,
		lastReportedAt: asString(record.lastReportedAt),
	};
}

async function fetchReport(
	ip: string,
	apiKey: string,
): Promise<AbuseIpReport | null> {
	const url = new URL(ABUSE_IPDB_CHECK_URL);
	url.searchParams.set("ipAddress", ip);
	const maxAgeDays = (await getPlatformConfig())["abuse.abuseIpdbMaxAgeDays"];
	url.searchParams.set("maxAgeInDays", String(maxAgeDays));

	const response = await fetch(url, {
		signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
		headers: { Accept: "application/json", Key: apiKey },
	});
	if (!response.ok) {
		throw new Error(`AbuseIPDB check failed with status ${response.status}`);
	}

	return parseReport(await response.json(), ip);
}

/**
 * Reputation of a client IP according to AbuseIPDB, cached in Redis for a day.
 * Returns null when the address cannot or should not be checked (no API key,
 * private address, lookup failure, nothing reported) so every caller fails
 * open: a reputation service being down must never block sign-ups.
 */
export async function checkIpAbuse(
	ip: string | null | undefined,
): Promise<AbuseIpReport | null> {
	const apiKey = process.env.ABUSE_IPDB_API_KEY;
	if (!apiKey || !ip || !isPublicIp(ip)) {
		return null;
	}

	const cacheKey = getAbuseIpCacheKey(ip);
	try {
		const cached = await redisClient.get(cacheKey);
		if (cached) {
			return cached === NO_REPORT
				? null
				: (JSON.parse(cached) as AbuseIpReport);
		}
	} catch (error) {
		logger.warn("Abuse IP cache read failed", { error });
	}

	let report: AbuseIpReport | null = null;
	try {
		report = await fetchReport(ip, apiKey);
	} catch (error) {
		logger.warn("Abuse IP lookup failed", { error });
		return null;
	}

	try {
		await redisClient.set(
			cacheKey,
			report ? JSON.stringify(report) : NO_REPORT,
			"EX",
			REPORT_CACHE_TTL_SECONDS,
		);
	} catch (error) {
		logger.warn("Abuse IP cache write failed", { error });
	}

	return report;
}
