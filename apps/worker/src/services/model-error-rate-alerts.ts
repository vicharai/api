import { redisClient } from "@llmgateway/cache";
import { db, gte, sql, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import {
	MODEL_ERROR_RATE_ALERTS_SETTING_ID,
	parseModelErrorRateAlertSettings,
} from "@llmgateway/shared";

const DISCORD_TIMEOUT_MS = 5_000;
const DISCORD_MAX_EMBEDS = 10;

export interface ModelErrorRateBreach {
	mappingId: string;
	modelId: string;
	providerId: string;
	requests: number;
	errors: number;
	errorRatePercent: number;
}

export function modelErrorRateAlertCooldownKey(mappingId: string): string {
	return `model-error-rate-alert:${mappingId}`;
}

async function postDiscord(
	webhookUrl: string,
	breaches: ModelErrorRateBreach[],
	windowMinutes: number,
): Promise<void> {
	if (new URL(webhookUrl).protocol !== "https:") {
		throw new Error("Model error-rate alert webhook must be https");
	}
	for (let i = 0; i < breaches.length; i += DISCORD_MAX_EMBEDS) {
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				embeds: breaches.slice(i, i + DISCORD_MAX_EMBEDS).map((b) => ({
					title: `High error rate: ${b.providerId}/${b.modelId}`,
					color: 0xef4444,
					fields: [
						{
							name: "Error rate",
							value: `${b.errorRatePercent.toFixed(1)}%`,
							inline: true,
						},
						{ name: "Errors", value: String(b.errors), inline: true },
						{ name: "Requests", value: String(b.requests), inline: true },
						{
							name: "Window",
							value: `${windowMinutes} min`,
							inline: true,
						},
					],
					timestamp: new Date().toISOString(),
				})),
			}),
			signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
		});
		if (!response.ok) {
			throw new Error(
				`Discord webhook error: ${response.status} - ${await response.text()}`,
			);
		}
	}
}

/**
 * Finds mappings whose upstream + gateway error rate over the configured
 * window breaches the threshold and posts the ones outside their cooldown to
 * Discord. Returns the breaches that were posted.
 */
export async function checkModelErrorRateAlerts(
	now: Date = new Date(),
): Promise<ModelErrorRateBreach[]> {
	const setting = await db.query.systemSetting.findFirst({
		where: { id: MODEL_ERROR_RATE_ALERTS_SETTING_ID },
	});
	const settings = parseModelErrorRateAlertSettings(setting?.value);
	if (!settings.enabled || !settings.webhookUrl) {
		return [];
	}

	const history = tables.modelProviderMappingHistory;
	const windowMs = settings.windowMinutes * 60_000;
	const since = new Date(now.getTime() - windowMs);
	const rows = await db
		.select({
			mappingId: history.modelProviderMappingId,
			modelId: history.modelId,
			providerId: history.providerId,
			requests: sql<number>`sum(${history.logsCount})::int`,
			errors: sql<number>`sum(${history.upstreamErrorsCount} + ${history.gatewayErrorsCount})::int`,
		})
		.from(history)
		.where(gte(history.minuteTimestamp, since))
		.groupBy(
			history.modelProviderMappingId,
			history.modelId,
			history.providerId,
		)
		.having(sql`sum(${history.logsCount}) >= ${settings.minRequests}`);

	const breaches = rows
		.map((row) => ({
			...row,
			errorRatePercent: (row.errors / row.requests) * 100,
		}))
		.filter((row) => row.errorRatePercent >= settings.thresholdPercent);

	const fresh: ModelErrorRateBreach[] = [];
	for (const breach of breaches) {
		const claimed = await redisClient.set(
			modelErrorRateAlertCooldownKey(breach.mappingId),
			"1",
			"EX",
			settings.cooldownMinutes * 60,
			"NX",
		);
		if (claimed === "OK") {
			fresh.push(breach);
		}
	}
	if (fresh.length === 0) {
		return [];
	}

	try {
		await postDiscord(settings.webhookUrl, fresh, settings.windowMinutes);
	} catch (error) {
		// Release the cooldown so the next run retries the notification.
		await redisClient.del(
			...fresh.map((b) => modelErrorRateAlertCooldownKey(b.mappingId)),
		);
		throw error;
	}

	logger.info("Posted model error-rate alerts", {
		count: fresh.length,
		mappings: fresh.map((b) => b.mappingId),
	});
	return fresh;
}
