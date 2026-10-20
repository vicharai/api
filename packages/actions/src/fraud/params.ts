import type { FraudRuleType, FraudSubjectType } from "@llmgateway/db";

export interface FraudParamSpec {
	key: string;
	label: string;
	unit: string;
	default: number;
	min: number;
	max: number;
}

export interface FraudRuleTypeSpec {
	type: FraudRuleType;
	label: string;
	description: string;
	subjectType: FraudSubjectType;
	params: FraudParamSpec[];
}

const windowHours = (fallback: number): FraudParamSpec => ({
	key: "windowHours",
	label: "Window",
	unit: "hours",
	default: fallback,
	min: 1,
	max: 24 * 30,
});

export const FRAUD_RULE_TYPE_SPECS: Record<FraudRuleType, FraudRuleTypeSpec> = {
	spend_spike_new_account: {
		type: "spend_spike_new_account",
		label: "Spend spike on a new account",
		description:
			"Organizations younger than the age limit that spent at least the threshold in the window.",
		subjectType: "org",
		params: [
			{
				key: "maxAccountAgeDays",
				label: "Max account age",
				unit: "days",
				default: 7,
				min: 1,
				max: 365,
			},
			windowHours(24),
			{
				key: "minSpendUsd",
				label: "Min spend",
				unit: "USD",
				default: 50,
				min: 1,
				max: 1_000_000,
			},
		],
	},
	signup_burst_same_ip: {
		type: "signup_burst_same_ip",
		label: "Signup burst from one IP",
		description:
			"At least the given number of accounts created in the window whose sessions share an IP.",
		subjectType: "user",
		params: [
			{
				key: "windowMinutes",
				label: "Window",
				unit: "minutes",
				default: 60,
				min: 5,
				max: 7 * 24 * 60,
			},
			{
				key: "minAccounts",
				label: "Min accounts",
				unit: "accounts",
				default: 3,
				min: 2,
				max: 1000,
			},
		],
	},
	api_key_burst: {
		type: "api_key_burst",
		label: "API key burst",
		description: "Organizations that created many API keys in the window.",
		subjectType: "org",
		params: [
			windowHours(1),
			{
				key: "minKeys",
				label: "Min keys created",
				unit: "keys",
				default: 10,
				min: 2,
				max: 10_000,
			},
		],
	},
	content_filter_abuse: {
		type: "content_filter_abuse",
		label: "Content filter abuse",
		description:
			"Organizations with at least the given number of content-filter violations in the window.",
		subjectType: "org",
		params: [
			windowHours(24),
			{
				key: "minViolations",
				label: "Min violations",
				unit: "requests",
				default: 20,
				min: 1,
				max: 1_000_000,
			},
		],
	},
	topup_velocity: {
		type: "topup_velocity",
		label: "Top-up velocity hits",
		description:
			"Organizations rejected by the top-up velocity cap at least the given number of times.",
		subjectType: "org",
		params: [
			{
				key: "windowDays",
				label: "Window",
				unit: "days",
				default: 1,
				min: 1,
				max: 90,
			},
			{
				key: "minHits",
				label: "Min rejected top-ups",
				unit: "attempts",
				default: 3,
				min: 1,
				max: 10_000,
			},
		],
	},
	failed_payments: {
		type: "failed_payments",
		label: "Failed payments",
		description:
			"Organizations with at least the given number of failed payments in the window.",
		subjectType: "org",
		params: [
			windowHours(24),
			{
				key: "minFailures",
				label: "Min failures",
				unit: "payments",
				default: 3,
				min: 1,
				max: 10_000,
			},
		],
	},
};

export type FraudRuleParams = Record<string, number>;

/** Validated params with defaults filled in, or the validation issues. */
export function safeParseFraudRuleParams(
	type: FraudRuleType,
	raw: unknown,
): { ok: true; params: FraudRuleParams } | { ok: false; message: string } {
	const input = raw ?? {};
	if (typeof input !== "object" || Array.isArray(input)) {
		return { ok: false, message: "params must be an object" };
	}
	const values = input as Record<string, unknown>;
	const specs = FRAUD_RULE_TYPE_SPECS[type].params;
	const errors: string[] = [];
	for (const key of Object.keys(values)) {
		if (!specs.some((spec) => spec.key === key)) {
			errors.push(`${key}: unknown parameter`);
		}
	}
	const params: FraudRuleParams = {};
	for (const spec of specs) {
		const value = values[spec.key] ?? spec.default;
		if (typeof value !== "number" || !Number.isFinite(value)) {
			errors.push(`${spec.key}: expected a number`);
		} else if (value < spec.min || value > spec.max) {
			errors.push(`${spec.key}: must be between ${spec.min} and ${spec.max}`);
		} else {
			params[spec.key] = value;
		}
	}
	return errors.length > 0
		? { ok: false, message: errors.join("; ") }
		: { ok: true, params };
}

/** Like {@link safeParseFraudRuleParams} but throws on invalid params. */
export function parseFraudRuleParams(
	type: FraudRuleType,
	raw: unknown,
): FraudRuleParams {
	const result = safeParseFraudRuleParams(type, raw);
	if (!result.ok) {
		throw new Error(`Invalid ${type} params: ${result.message}`);
	}
	return result.params;
}

/** How long one match suppresses repeat events for the same subject. */
export function fraudRuleWindowMs(
	type: FraudRuleType,
	params: FraudRuleParams,
): number {
	const minutes =
		params.windowMinutes ??
		(params.windowHours !== undefined ? params.windowHours * 60 : undefined) ??
		(params.windowDays !== undefined ? params.windowDays * 24 * 60 : 60);
	return Math.max(5, minutes) * 60_000;
}
