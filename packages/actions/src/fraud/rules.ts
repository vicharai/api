import { redisClient } from "@llmgateway/cache";
import {
	db,
	tables,
	type FraudRuleAction,
	type FraudRuleType,
	type FraudSubjectType,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import {
	MODEL_ERROR_RATE_ALERTS_SETTING_ID,
	parseModelErrorRateAlertSettings,
} from "@llmgateway/shared";

import { evaluateFraudRule, type FraudMatch } from "./evaluate.js";
import { fraudRuleWindowMs, parseFraudRuleParams } from "./params.js";
import {
	flagUserFromFraudRule,
	setOrganizationRiskFlag,
} from "./risk-flags.js";

const DISCORD_TIMEOUT_MS = 5_000;
const DISCORD_MAX_EMBEDS = 10;

export function fraudRuleDedupeKey(
	ruleId: string,
	subjectType: FraudSubjectType,
	subjectId: string,
): string {
	return `fraud-rule:${ruleId}:${subjectType}:${subjectId}`;
}

export interface CreatedFraudEvent {
	id: string;
	ruleId: string;
	ruleName: string;
	ruleType: FraudRuleType;
	action: FraudRuleAction;
	subjectType: FraudSubjectType;
	subjectId: string;
	label: string;
	actionTaken: string;
	details: Record<string, unknown>;
}

/**
 * Applies a rule action. `suspend_org` and `block_org` only raise the risk
 * flag (which already stops inference and purchases) and record the intended
 * action for an admin to confirm: suspension and blocking cancel
 * subscriptions and deactivate members, which stays a human decision.
 */
async function applyFraudAction(
	action: FraudRuleAction,
	match: FraudMatch,
): Promise<{ actionTaken: string; organizationIds: string[] }> {
	if (action === "notify") {
		return { actionTaken: "notified", organizationIds: [] };
	}
	const pending = action === "flag" ? "" : `_pending_${action}`;
	if (match.subjectType === "user") {
		const result = await flagUserFromFraudRule(match.subjectId);
		return result
			? {
					actionTaken: `${result.outcome}${pending}`,
					organizationIds: result.organizationIds,
				}
			: { actionTaken: "subject_missing", organizationIds: [] };
	}
	const outcome = await setOrganizationRiskFlag(match.subjectId, true);
	return {
		actionTaken: outcome ? `${outcome}${pending}` : "subject_missing",
		organizationIds: outcome === "flagged" ? [match.subjectId] : [],
	};
}

async function getFraudWebhookUrl(): Promise<string | null> {
	const row = await db.query.systemSetting.findFirst({
		where: { id: MODEL_ERROR_RATE_ALERTS_SETTING_ID },
	});
	return parseModelErrorRateAlertSettings(row?.value).webhookUrl;
}

function describeDetails(details: Record<string, unknown>): string {
	return Object.entries(details)
		.filter(([, value]) => typeof value !== "object" || value === null)
		.map(([key, value]) => `${key}: ${String(value)}`)
		.join("\n")
		.slice(0, 1000);
}

/** Posts new fraud events to the alerts Discord webhook. */
export async function postFraudEventsToDiscord(
	webhookUrl: string,
	events: CreatedFraudEvent[],
): Promise<void> {
	if (new URL(webhookUrl).protocol !== "https:") {
		throw new Error("Fraud alert webhook must be https");
	}
	for (let i = 0; i < events.length; i += DISCORD_MAX_EMBEDS) {
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				embeds: events.slice(i, i + DISCORD_MAX_EMBEDS).map((e) => ({
					title: `Fraud rule: ${e.ruleName}`,
					color: 0xf97316,
					fields: [
						{
							name: e.subjectType === "user" ? "User" : "Organization",
							value: `${e.label} (${e.subjectId})`,
						},
						{ name: "Action", value: e.actionTaken, inline: true },
						{ name: "Rule type", value: e.ruleType, inline: true },
						{
							name: "Details",
							value: describeDetails(e.details) || "—",
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
 * Evaluates every enabled rule, records one event per newly matched subject
 * (deduped per rule window in Redis), applies the rule's action and posts the
 * new events to Discord when the alerts webhook is configured.
 */
export async function runFraudRules(
	now: Date = new Date(),
): Promise<CreatedFraudEvent[]> {
	const rules = await db.query.fraudRule.findMany({
		where: { enabled: { eq: true } },
	});
	const created: CreatedFraudEvent[] = [];

	for (const rule of rules) {
		let matches: FraudMatch[];
		let windowMs: number;
		try {
			windowMs = fraudRuleWindowMs(
				rule.type,
				parseFraudRuleParams(rule.type, rule.params),
			);
			matches = await evaluateFraudRule(rule, now);
		} catch (error) {
			logger.error(
				"Fraud rule evaluation failed",
				error instanceof Error ? error : new Error(String(error)),
				{ ruleId: rule.id, type: rule.type },
			);
			continue;
		}

		for (const match of matches) {
			const claimed = await redisClient.set(
				fraudRuleDedupeKey(rule.id, match.subjectType, match.subjectId),
				now.toISOString(),
				"PX",
				windowMs,
				"NX",
			);
			if (claimed !== "OK") {
				continue;
			}
			const { actionTaken, organizationIds } = await applyFraudAction(
				rule.action,
				match,
			);
			const details = {
				...match.details,
				...(rule.action === "suspend_org" || rule.action === "block_org"
					? { intendedAction: rule.action }
					: {}),
				...(organizationIds.length
					? { flaggedOrganizationIds: organizationIds }
					: {}),
			};
			const [event] = await db
				.insert(tables.fraudEvent)
				.values({
					ruleId: rule.id,
					ruleType: rule.type,
					subjectType: match.subjectType,
					subjectId: match.subjectId,
					details,
					actionTaken,
				})
				.returning({ id: tables.fraudEvent.id });
			created.push({
				id: event.id,
				ruleId: rule.id,
				ruleName: rule.name,
				ruleType: rule.type,
				action: rule.action,
				subjectType: match.subjectType,
				subjectId: match.subjectId,
				label: match.label,
				actionTaken,
				details,
			});
		}
	}

	if (created.length > 0) {
		logger.warn("Fraud rules raised events", {
			count: created.length,
			events: created.map((e) => ({
				ruleId: e.ruleId,
				subject: `${e.subjectType}:${e.subjectId}`,
				actionTaken: e.actionTaken,
			})),
		});
		const webhookUrl = await getFraudWebhookUrl();
		if (webhookUrl) {
			// Events are already recorded; a failed post is logged, not retried.
			try {
				await postFraudEventsToDiscord(webhookUrl, created);
			} catch (error) {
				logger.error(
					"Failed to post fraud events to Discord",
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}
	}
	return created;
}
