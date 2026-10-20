import { suspendOrganizationUntil } from "@/organization-suspension.js";

import { redisClient } from "@llmgateway/cache";
import {
	db,
	getPlatformConfig,
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
	soleMemberOrganizationIdsOf,
} from "./risk-flags.js";
import { HOUR_MS, msBefore } from "./time.js";

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

interface ActionResult {
	actionTaken: string;
	details: Record<string, unknown>;
}

/** Suspends the subject org, or a user's sole-member orgs, for the configured hours. */
async function suspendForRule(
	ruleName: string,
	match: FraudMatch,
	now: Date,
): Promise<ActionResult> {
	const organizationIds =
		match.subjectType === "org"
			? [match.subjectId]
			: await soleMemberOrganizationIdsOf(match.subjectId);
	if (organizationIds.length === 0) {
		return { actionTaken: "no_organization", details: {} };
	}
	const config = await getPlatformConfig();
	const until = msBefore(now, -config["abuse.fraudSuspendHours"] * HOUR_MS);
	for (const organizationId of organizationIds) {
		await suspendOrganizationUntil({
			organizationId,
			until,
			reason: `Fraud rule: ${ruleName}`,
		});
	}
	return {
		actionTaken: "suspended",
		details: {
			suspendedOrganizationIds: organizationIds,
			suspendedUntil: until.toISOString(),
		},
	};
}

/**
 * Applies a rule action. `suspend_org` suspends for `abuse.fraudSuspendHours`.
 * `block_org` only raises the risk flag (stopping inference and purchases)
 * and records the intended block for an admin to confirm, since blocking
 * cancels subscriptions and deactivates members.
 */
async function applyFraudAction(
	rule: { name: string; action: FraudRuleAction },
	match: FraudMatch,
	now: Date,
): Promise<ActionResult> {
	switch (rule.action) {
		case "notify":
			return { actionTaken: "notified", details: {} };
		case "suspend_org":
			return await suspendForRule(rule.name, match, now);
		case "flag":
		case "block_org":
			break;
	}
	const pending = rule.action === "block_org" ? "_pending_block_org" : "";
	const intended =
		rule.action === "block_org" ? { intendedAction: "block_org" } : {};
	if (match.subjectType === "user") {
		const result = await flagUserFromFraudRule(match.subjectId);
		if (!result) {
			return { actionTaken: "subject_missing", details: {} };
		}
		return {
			actionTaken: `${result.outcome}${pending}`,
			details: {
				...intended,
				...(result.organizationIds.length
					? { flaggedOrganizationIds: result.organizationIds }
					: {}),
			},
		};
	}
	const outcome = await setOrganizationRiskFlag(match.subjectId, true);
	return {
		actionTaken: outcome ? `${outcome}${pending}` : "subject_missing",
		details: intended,
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
			const action = await applyFraudAction(rule, match, now);
			const actionTaken = action.actionTaken;
			const details = { ...match.details, ...action.details };
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
