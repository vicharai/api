import { z } from "zod";

import {
	PATH_RATE_LIMITS,
	SPEND_TIER_DEFAULTS,
} from "./rate-limit-defaults.js";

/**
 * Admin-editable platform settings. Each value resolves as DB → env →
 * default; the DB overrides live as one JSON object in the `system_setting`
 * row {@link PLATFORM_CONFIG_SETTING_ID}. Secrets never belong here.
 */
export const PLATFORM_CONFIG_SETTING_ID = "platform_config";

export const PLATFORM_CONFIG_CATEGORIES = [
	{ id: "gateway", label: "Gateway limits" },
	{ id: "billing", label: "Billing" },
	{ id: "plans", label: "Plans" },
	{ id: "company", label: "Company & email" },
	{ id: "retention", label: "Retention" },
	{ id: "abuse", label: "Abuse" },
	{ id: "contentFilter", label: "Content filter" },
] as const;

export type PlatformConfigCategory =
	(typeof PLATFORM_CONFIG_CATEGORIES)[number]["id"];
export type PlatformConfigType =
	"number" | "string" | "boolean" | "stringList" | "json";
export type PlatformConfigSource = "db" | "env" | "default";

type Env = Record<string, string | undefined>;

export interface PlatformConfigEntry<T = unknown> {
	type: PlatformConfigType;
	category: PlatformConfigCategory;
	label: string;
	description: string;
	unit: string | null;
	min: number | null;
	max: number | null;
	/** Allowed values of a `string` entry. */
	options: readonly string[] | null;
	/** Whether `null` is a valid value (meaning "not set"). */
	nullable: boolean;
	env: string | null;
	default: T | (() => T);
	schema: z.ZodType<T>;
	/** Value from the environment, or undefined when unset or invalid. */
	fromEnv: (env: Env) => T | undefined;
}

interface CommonOptions {
	category: PlatformConfigCategory;
	label: string;
	description: string;
	unit?: string;
	env?: string;
}

function rawEnv(env: Env, name: string | undefined): string | undefined {
	if (!name) {
		return undefined;
	}
	const raw = env[name];
	return raw === undefined || raw.trim() === "" ? undefined : raw.trim();
}

function base(opts: CommonOptions) {
	return {
		category: opts.category,
		label: opts.label,
		description: opts.description,
		unit: opts.unit ?? null,
		env: opts.env ?? null,
		options: null,
	};
}

function numberEntry(
	opts: CommonOptions & {
		default: number | (() => number);
		min?: number;
		max?: number;
		integer?: boolean;
	},
): PlatformConfigEntry<number> {
	let schema = z.number().finite();
	if (opts.integer) {
		schema = schema.int();
	}
	if (opts.min !== undefined) {
		schema = schema.min(opts.min);
	}
	if (opts.max !== undefined) {
		schema = schema.max(opts.max);
	}
	return {
		...base(opts),
		type: "number",
		min: opts.min ?? null,
		max: opts.max ?? null,
		nullable: false,
		default: opts.default,
		schema,
		fromEnv: (env) => {
			const raw = rawEnv(env, opts.env);
			if (raw === undefined) {
				return undefined;
			}
			const parsed = schema.safeParse(
				opts.integer ? Number.parseInt(raw, 10) : Number(raw),
			);
			return parsed.success ? parsed.data : undefined;
		},
	};
}

function optionalNumberEntry(
	opts: CommonOptions & { min?: number; max?: number },
): PlatformConfigEntry<number | null> {
	const inner = numberEntry({ ...opts, default: 0 });
	return {
		...inner,
		nullable: true,
		default: null,
		schema: (inner.schema as z.ZodNumber).nullable(),
	};
}

function booleanEntry(
	opts: CommonOptions & {
		default: boolean | (() => boolean);
		/** How a set env var maps to a value; defaults to `=== "true"`. */
		parseEnv?: (raw: string) => boolean;
	},
): PlatformConfigEntry<boolean> {
	const parseEnv = opts.parseEnv ?? ((raw: string) => raw === "true");
	return {
		...base(opts),
		type: "boolean",
		min: null,
		max: null,
		nullable: false,
		default: opts.default,
		schema: z.boolean(),
		fromEnv: (env) => {
			// An explicitly set (even empty) switch counts as set.
			const raw = opts.env ? env[opts.env] : undefined;
			return raw === undefined ? undefined : parseEnv(raw.trim());
		},
	};
}

function stringEntry(
	opts: CommonOptions & {
		default: string;
		options?: readonly string[];
		maxLength?: number;
		parseEnv?: (env: Env) => string | undefined;
	},
): PlatformConfigEntry<string> {
	const options = opts.options;
	const schema: z.ZodType<string> = options
		? z.string().refine((value) => options.includes(value), {
				message: `Expected one of: ${options.join(", ")}`,
			})
		: z
				.string()
				.trim()
				.max(opts.maxLength ?? 500);
	return {
		...base(opts),
		type: "string",
		min: null,
		max: null,
		options: options ?? null,
		nullable: false,
		default: opts.default,
		schema,
		fromEnv: (env) => {
			const raw = opts.parseEnv ? opts.parseEnv(env) : rawEnv(env, opts.env);
			if (raw === undefined) {
				return undefined;
			}
			const parsed = schema.safeParse(raw);
			return parsed.success ? parsed.data : undefined;
		},
	};
}

function stringListEntry(
	opts: CommonOptions & { default?: string[]; maxItems?: number },
): PlatformConfigEntry<string[]> {
	return {
		...base(opts),
		type: "stringList",
		min: null,
		max: null,
		nullable: false,
		default: () => [...(opts.default ?? [])],
		schema: z
			.array(z.string().trim().min(1).max(200))
			.max(opts.maxItems ?? 1000),
		fromEnv: (env) => {
			const raw = rawEnv(env, opts.env);
			if (raw === undefined) {
				return undefined;
			}
			const list = raw
				.split(",")
				.map((entry) => entry.trim())
				.filter(Boolean);
			return list.length > 0 ? list : undefined;
		},
	};
}

function jsonEntry<T>(
	opts: CommonOptions & { default: () => T; schema: z.ZodType<T> },
): PlatformConfigEntry<T> {
	return {
		...base(opts),
		type: "json",
		min: null,
		max: null,
		nullable: false,
		default: opts.default,
		schema: opts.schema,
		fromEnv: () => undefined,
	};
}

/** On everywhere except under a test runner, matching the legacy env toggles. */
const enabledOutsideTests = () =>
	process.env.NODE_ENV !== "test" && process.env.E2E_TEST !== "true";

const TIER_FIELDS = {
	ageDays: { env: "AGE_DAYS", label: "account age", unit: "days" },
	spendUsd: { env: "SPEND_USD", label: "lifetime spend", unit: "USD" },
	minAgeDays: {
		env: "MIN_AGE_DAYS",
		label: "min age for spend path",
		unit: "days",
	},
	rpmMultiplier: { env: "RPM_MULTIPLIER", label: "RPM multiplier", unit: "×" },
	inflightLimit: {
		env: "INFLIGHT_LIMIT",
		label: "in-flight limit",
		unit: "requests",
	},
	dailyCapUsd: { env: "DAILY_CAP_USD", label: "daily spend cap", unit: "USD" },
	monthlyCapUsd: {
		env: "MONTHLY_CAP_USD",
		label: "monthly spend cap",
		unit: "USD",
	},
	topUpDailyCapUsd: {
		env: "TOPUP_DAILY_CAP_USD",
		label: "top-up cap per 24h",
		unit: "USD",
	},
} as const;

export type SpendTierField = keyof typeof TIER_FIELDS;
export type SpendTierConfigKey = `gateway.tier${number}.${SpendTierField}`;
export type RateLimitRpmConfigKey = `gateway.rpm.${string}`;

export function spendTierConfigKey(
	tier: number,
	field: SpendTierField,
): SpendTierConfigKey {
	return `gateway.tier${tier}.${field}`;
}

export function rateLimitRpmConfigKey(pathKey: string): RateLimitRpmConfigKey {
	return `gateway.rpm.${pathKey}`;
}

function buildRateLimitEntries(): Record<
	RateLimitRpmConfigKey,
	PlatformConfigEntry<number>
> {
	const entries: Record<
		RateLimitRpmConfigKey,
		PlatformConfigEntry<number>
	> = {};
	for (const config of PATH_RATE_LIMITS) {
		const key = rateLimitRpmConfigKey(config.key);
		if (key in entries) {
			continue;
		}
		const prefixes = PATH_RATE_LIMITS.filter((c) => c.key === config.key).map(
			(c) => c.prefix,
		);
		entries[key] = numberEntry({
			category: "gateway",
			label: `RPM: ${prefixes.join(", ")}`,
			description:
				"Base requests per minute per organization before the trust-tier multiplier. 0 disables the limit.",
			unit: "req/min",
			env: `GATEWAY_RATE_LIMIT_${config.key.toUpperCase()}_RPM`,
			default: config.defaultRpm,
			min: 0,
		});
	}
	return entries;
}

function buildSpendTierEntries(): Record<
	SpendTierConfigKey,
	PlatformConfigEntry<number>
> {
	const entries: Record<SpendTierConfigKey, PlatformConfigEntry<number>> = {};
	for (const tier of SPEND_TIER_DEFAULTS) {
		for (const [field, meta] of Object.entries(TIER_FIELDS) as [
			SpendTierField,
			(typeof TIER_FIELDS)[SpendTierField],
		][]) {
			entries[spendTierConfigKey(tier.tier, field)] = numberEntry({
				category: "gateway",
				label: `Tier ${tier.tier}: ${meta.label}`,
				description: `Trust tier ${tier.tier} ${meta.label}.`,
				unit: meta.unit,
				env: `GATEWAY_SPEND_TIER_${tier.tier}_${meta.env}`,
				default: tier[field],
				min: 0,
			});
		}
	}
	return entries;
}

const STATIC_ENTRIES = {
	// Gateway limits
	"gateway.modelAllowlist": stringListEntry({
		category: "gateway",
		label: "Model allowlist",
		description:
			"Model ids the gateway serves; a trailing * is a prefix match. Empty allows every model.",
		env: "GATEWAY_MODEL_ALLOWLIST",
	}),
	"gateway.rateLimitsEnabled": booleanEntry({
		category: "gateway",
		label: "Per-organization rate limits",
		description: "Enforce the per-endpoint RPM and in-flight limits.",
		env: "GATEWAY_RATE_LIMITS_ENABLED",
		default: () => process.env.E2E_TEST !== "true",
	}),
	"gateway.spendCapsEnabled": booleanEntry({
		category: "gateway",
		label: "Spend caps",
		description: "Enforce the trust-tier daily and monthly USD spend caps.",
		env: "GATEWAY_SPEND_CAPS_ENABLED",
		default: enabledOutsideTests,
	}),
	"gateway.topUpVelocityEnabled": booleanEntry({
		category: "gateway",
		label: "Top-up velocity caps",
		description: "Enforce the trust-tier 24h credit top-up caps.",
		env: "GATEWAY_TOPUP_VELOCITY_ENABLED",
		default: enabledOutsideTests,
	}),
	"gateway.orgInflightLimitEnterprise": numberEntry({
		category: "gateway",
		label: "Enterprise in-flight limit",
		description:
			"Concurrent in-flight inference requests per enterprise organization. 0 disables the limit.",
		unit: "requests",
		env: "GATEWAY_ORG_INFLIGHT_LIMIT_ENTERPRISE",
		default: 2000,
		min: 0,
	}),
	"gateway.orgInflightStaleSeconds": numberEntry({
		category: "gateway",
		label: "In-flight slot expiry",
		description:
			"Age after which an unreleased in-flight slot is treated as leaked.",
		unit: "seconds",
		env: "GATEWAY_ORG_INFLIGHT_STALE_SECONDS",
		default: 1800,
		min: 60,
	}),
	"gateway.maxInflightPerPod": numberEntry({
		category: "gateway",
		label: "Max in-flight per pod",
		description:
			"Inference requests one gateway process serves at once before shedding with 529.",
		unit: "requests",
		env: "GATEWAY_MAX_INFLIGHT_REQUESTS",
		default: 1000,
		min: 1,
	}),
	"gateway.streamingBufferMb": numberEntry({
		category: "gateway",
		label: "Streaming buffer",
		description: "Maximum buffered size of one streaming response.",
		unit: "MB",
		env: "MAX_STREAMING_BUFFER_MB",
		default: 50,
		min: 1,
		max: 1024,
	}),
	"gateway.imageSizeLimitMb": numberEntry({
		category: "gateway",
		label: "Image size limit",
		description: "Maximum size of an input image.",
		unit: "MB",
		env: "IMAGE_SIZE_LIMIT_PRO_MB",
		default: 100,
		min: 1,
		max: 1024,
	}),
	"gateway.imageSizeLimitEnterpriseMb": optionalNumberEntry({
		category: "gateway",
		label: "Enterprise image size limit",
		description:
			"Maximum input image size for enterprise organizations. Empty uses the image size limit.",
		unit: "MB",
		env: "IMAGE_SIZE_LIMIT_ENTERPRISE_MB",
		min: 1,
		max: 1024,
	}),
	"gateway.realtimeMaxSessionsPerOrg": numberEntry({
		category: "gateway",
		label: "Realtime sessions per organization",
		description: "Concurrent realtime sessions per organization.",
		unit: "sessions",
		env: "REALTIME_MAX_SESSIONS_PER_ORG",
		default: 20,
		min: 1,
		integer: true,
	}),
	"gateway.realtimeMaxSessionsPerKey": numberEntry({
		category: "gateway",
		label: "Realtime sessions per API key",
		description: "Concurrent realtime sessions per API key.",
		unit: "sessions",
		env: "REALTIME_MAX_SESSIONS_PER_KEY",
		default: 10,
		min: 1,
		integer: true,
	}),
	"gateway.realtimeMaxSessionSeconds": numberEntry({
		category: "gateway",
		label: "Realtime session length",
		description: "Maximum duration of one realtime session.",
		unit: "seconds",
		env: "REALTIME_MAX_SESSION_SECONDS",
		default: 3600,
		min: 1,
	}),
	"gateway.realtimeMaxSessionSpendUsd": numberEntry({
		category: "gateway",
		label: "Realtime session spend",
		description: "Spend after which a realtime session is closed.",
		unit: "USD",
		env: "REALTIME_MAX_SESSION_SPEND_USD",
		default: 10,
		min: 0.01,
	}),
	"gateway.billCancelledRequests": booleanEntry({
		category: "gateway",
		label: "Bill cancelled requests",
		description:
			"Bill the tokens a client-cancelled streaming request already consumed upstream.",
		env: "BILL_CANCELLED_REQUESTS",
		default: true,
		parseEnv: (raw) => raw !== "false",
	}),
	"gateway.sameKeyMaxRetries": numberEntry({
		category: "gateway",
		label: "Same-key retries",
		description:
			"Retries against the pinned provider key before giving up. 0 disables them.",
		unit: "retries",
		env: "SAME_KEY_MAX_RETRIES",
		default: 2,
		min: 0,
		max: 10,
		integer: true,
	}),
	"gateway.explorationRate": optionalNumberEntry({
		category: "gateway",
		label: "Routing exploration rate",
		description:
			"Share of requests routed to a random provider. Empty uses each project's routing setting.",
		env: "EXPLORATION_RATE",
		min: 0,
		max: 1,
	}),

	// Billing
	"billing.topUpMinAmount": numberEntry({
		category: "billing",
		label: "Minimum top-up",
		description: "Smallest credit top-up, before fees.",
		unit: "USD",
		default: 20,
		min: 1,
		integer: true,
	}),
	"billing.topUpMaxAmount": numberEntry({
		category: "billing",
		label: "Maximum top-up",
		description: "Largest single credit top-up, before fees.",
		unit: "USD",
		default: 5000,
		min: 1,
		max: 1_000_000,
		integer: true,
	}),
	"billing.topUpPresets": jsonEntry<number[]>({
		category: "billing",
		label: "Top-up presets",
		description: "Amounts offered as one-click choices in the dashboard.",
		unit: "USD",
		default: () => [20, 50, 100, 250],
		schema: z.array(z.number().int().min(1)).min(1).max(8),
	}),
	"billing.autoTopUpDefaultThreshold": numberEntry({
		category: "billing",
		label: "Auto top-up default threshold",
		description:
			"Balance below which auto top-up triggers, pre-filled for users.",
		unit: "USD",
		default: 5,
		min: 0,
	}),
	"billing.autoTopUpDefaultAmount": numberEntry({
		category: "billing",
		label: "Auto top-up default amount",
		description: "Auto top-up amount pre-filled for users.",
		unit: "USD",
		default: 20,
		min: 1,
		integer: true,
	}),
	"billing.platformFeePercent": numberEntry({
		category: "billing",
		label: "Platform fee",
		description: "Fee added on top of every credit top-up.",
		unit: "%",
		default: 5,
		min: 0,
		max: 100,
	}),
	"billing.signupBonusCredits": numberEntry({
		category: "billing",
		label: "Signup bonus",
		description:
			"Credits granted to a verified user's first organization. 0 disables it.",
		unit: "USD",
		default: 0,
		min: 0,
		max: 10_000,
	}),
	"billing.referralDefaultPercent": numberEntry({
		category: "billing",
		label: "Default referral bonus",
		description:
			"Referral bonus on a referred organization's first top-up when the referrer has no custom percent.",
		unit: "%",
		default: 50,
		min: 0,
		max: 1000,
	}),
	"billing.referralCookieDays": numberEntry({
		category: "billing",
		label: "Referral cookie lifetime",
		description: "How long a referral link is remembered.",
		unit: "days",
		default: 30,
		min: 1,
		max: 365,
		integer: true,
	}),
	"billing.orgDeletionMaxCredits": numberEntry({
		category: "billing",
		label: "Deletable balance limit",
		description:
			"Organizations holding this balance or more cannot be deleted from the dashboard.",
		unit: "USD",
		default: 5,
		min: 0,
	}),

	// Plans
	"plans.free.seatLimit": numberEntry({
		category: "plans",
		label: "Free: seats",
		description: "Default team member limit of free organizations.",
		default: 5,
		min: 0,
		integer: true,
	}),
	"plans.pro.seatLimit": numberEntry({
		category: "plans",
		label: "Pro: seats",
		description: "Default team member limit of pro organizations.",
		default: 5,
		min: 0,
		integer: true,
	}),
	"plans.enterprise.seatLimit": numberEntry({
		category: "plans",
		label: "Enterprise: seats",
		description: "Default team member limit of enterprise organizations.",
		default: 100,
		min: 0,
		integer: true,
	}),
	"plans.free.projectLimit": numberEntry({
		category: "plans",
		label: "Free: projects",
		description: "Default project limit of free organizations.",
		default: 10,
		min: 0,
		integer: true,
	}),
	"plans.pro.projectLimit": numberEntry({
		category: "plans",
		label: "Pro: projects",
		description: "Default project limit of pro organizations.",
		default: 10,
		min: 0,
		integer: true,
	}),
	"plans.enterprise.projectLimit": numberEntry({
		category: "plans",
		label: "Enterprise: projects",
		description: "Default project limit of enterprise organizations.",
		default: 250,
		min: 0,
		integer: true,
	}),
	"plans.free.apiKeyLimit": numberEntry({
		category: "plans",
		label: "Free: API keys",
		description: "Default active API key limit of free organizations.",
		default: 20,
		min: 0,
		integer: true,
	}),
	"plans.pro.apiKeyLimit": numberEntry({
		category: "plans",
		label: "Pro: API keys",
		description: "Default active API key limit of pro organizations.",
		default: 20,
		min: 0,
		integer: true,
	}),
	"plans.enterprise.apiKeyLimit": numberEntry({
		category: "plans",
		label: "Enterprise: API keys",
		description: "Default active API key limit of enterprise organizations.",
		default: 500,
		min: 0,
		integer: true,
	}),

	// Company & email
	"company.name": stringEntry({
		category: "company",
		label: "Company name",
		description: "Legal name shown as the invoice issuer.",
		default: "Vichar",
		maxLength: 200,
	}),
	"company.address": stringEntry({
		category: "company",
		label: "Company address",
		description: "Postal address on invoices; one line per row.",
		default: "",
		maxLength: 1000,
	}),
	"company.taxId": stringEntry({
		category: "company",
		label: "Tax ID",
		description: "Tax or VAT number on invoices.",
		default: "",
		maxLength: 100,
	}),
	"company.supportEmail": stringEntry({
		category: "company",
		label: "Support email",
		description: "Contact address shown to users.",
		default: "contact@vichar.io",
		maxLength: 254,
	}),
	"email.from": stringEntry({
		category: "company",
		label: "Email sender",
		description: 'Sender of outgoing email, e.g. "Vichar <noreply@vichar.io>".',
		env: "RESEND_FROM_EMAIL",
		default: "Vichar <noreply@vichar.io>",
		maxLength: 254,
	}),
	"email.replyTo": stringEntry({
		category: "company",
		label: "Email reply-to",
		description: "Reply-to address of outgoing email.",
		env: "RESEND_REPLY_TO_EMAIL",
		default: "contact@vichar.io",
		maxLength: 254,
	}),
	"email.followUpsEnabled": booleanEntry({
		category: "company",
		label: "Follow-up emails",
		description:
			"Send lifecycle follow-up and low-balance emails. Off logs them as a dry run.",
		env: "EMAIL_FOLLOW_UPS",
		default: false,
	}),
	"email.followUpMaxAgeDays": numberEntry({
		category: "company",
		label: "Follow-up max account age",
		description: "Accounts older than this get no lifecycle follow-ups.",
		unit: "days",
		env: "FOLLOW_UP_MAX_AGE_DAYS",
		default: 30,
		min: 1,
	}),

	// Retention
	"retention.cleanupEnabled": booleanEntry({
		category: "retention",
		label: "Log data cleanup",
		description:
			"Strip verbose payloads from request logs past the retention window.",
		env: "ENABLE_DATA_RETENTION_CLEANUP",
		default: false,
	}),
	"retention.logRetentionDays": numberEntry({
		category: "retention",
		label: "Log retention",
		description: "Age after which request log payloads are removed.",
		unit: "days",
		default: 30,
		min: 1,
		max: 3650,
		integer: true,
	}),
	"retention.modelHistoryRetentionDays": numberEntry({
		category: "retention",
		label: "Model history retention",
		description: "Age after which minute-level model history rows are deleted.",
		unit: "days",
		env: "MODEL_HISTORY_RETENTION_DAYS",
		default: 3,
		min: 1,
		max: 365,
	}),

	// Abuse
	"abuse.abuseIpdbScoreThreshold": numberEntry({
		category: "abuse",
		label: "AbuseIPDB score threshold",
		description:
			"AbuseIPDB confidence score at or above which an IP counts as abusive.",
		env: "ABUSE_IPDB_SCORE_THRESHOLD",
		default: 50,
		min: 1,
		max: 100,
	}),
	"abuse.abuseIpdbMaxAgeDays": numberEntry({
		category: "abuse",
		label: "AbuseIPDB report age",
		description: "Only AbuseIPDB reports from this many recent days count.",
		unit: "days",
		env: "ABUSE_IPDB_MAX_AGE_DAYS",
		default: 90,
		min: 1,
		max: 365,
		integer: true,
	}),

	// Content filter
	"contentFilter.mode": stringEntry({
		category: "contentFilter",
		label: "Mode",
		description:
			"disabled: off. monitor: check and log only. enabled: reroute or block matches.",
		env: "LLM_CONTENT_FILTER_MODE",
		default: "disabled",
		options: ["disabled", "monitor", "enabled"],
		parseEnv: (env) => {
			const raw = rawEnv(env, "LLM_CONTENT_FILTER_MODE");
			return raw === "openai" ? "enabled" : raw;
		},
	}),
	"contentFilter.method": stringEntry({
		category: "contentFilter",
		label: "Method",
		description:
			"keywords: the keyword list. openai: OpenAI moderation. jev: TypeSafe Jev (images via OpenAI).",
		env: "LLM_CONTENT_FILTER_METHOD",
		default: "keywords",
		options: ["keywords", "openai", "jev"],
		parseEnv: (env) => {
			const raw = rawEnv(env, "LLM_CONTENT_FILTER_METHOD");
			if (raw === "jev" || raw === "openai") {
				return raw;
			}
			return rawEnv(env, "LLM_CONTENT_FILTER_MODE") === "openai"
				? "openai"
				: undefined;
		},
	}),
	"contentFilter.models": stringListEntry({
		category: "contentFilter",
		label: "Filtered models",
		description: "Model ids the filter applies to. Empty applies it to all.",
		env: "LLM_CONTENT_FILTER_MODELS",
	}),
	"contentFilter.keywords": stringListEntry({
		category: "contentFilter",
		label: "Blocked keywords",
		description: "Case-insensitive keywords for the keywords method.",
		env: "LLM_CONTENT_FILTER_KEYWORDS",
	}),
	"contentFilter.openaiScoreThreshold": numberEntry({
		category: "contentFilter",
		label: "OpenAI score threshold",
		description:
			"Category score above which OpenAI moderation counts as a match.",
		env: "LLM_CONTENT_FILTER_OPENAI_SCORE_THRESHOLD",
		default: 0.75,
		min: 0,
		max: 1,
	}),
	"contentFilter.jevScoreThreshold": numberEntry({
		category: "contentFilter",
		label: "Jev score threshold",
		description: "Category score above which Jev counts as a match.",
		env: "LLM_CONTENT_FILTER_JEV_SCORE_THRESHOLD",
		default: 0.75,
		min: 0,
		max: 1,
	}),
	"contentFilter.tierStrictScoreThreshold": numberEntry({
		category: "contentFilter",
		label: "Tiered filter: strict threshold",
		description: "Score threshold for strict (lower) content filter tiers.",
		env: "LLM_CONTENT_FILTER_TIER_STRICT_SCORE_THRESHOLD",
		default: 0.5,
		min: 0,
		max: 1,
	}),
	"contentFilter.tierLenientScoreThreshold": numberEntry({
		category: "contentFilter",
		label: "Tiered filter: lenient threshold",
		description: "Score threshold for lenient (higher) content filter tiers.",
		env: "LLM_CONTENT_FILTER_TIER_LENIENT_SCORE_THRESHOLD",
		default: 0.9,
		min: 0,
		max: 1,
	}),
};

type StaticEntries = typeof STATIC_ENTRIES;
type EntryValue<E> = E extends PlatformConfigEntry<infer T> ? T : never;

export type PlatformConfig = {
	[K in keyof StaticEntries]: EntryValue<StaticEntries[K]>;
} & Record<RateLimitRpmConfigKey, number> &
	Record<SpendTierConfigKey, number>;

export type PlatformConfigKey =
	keyof StaticEntries | RateLimitRpmConfigKey | SpendTierConfigKey;

/** DB overrides: a validated subset of the config. */
export type StoredPlatformConfig = Partial<PlatformConfig>;

export const PLATFORM_CONFIG_REGISTRY: Readonly<
	Record<string, PlatformConfigEntry>
> = {
	...(STATIC_ENTRIES as Record<string, PlatformConfigEntry>),
	...buildRateLimitEntries(),
	...buildSpendTierEntries(),
};

export function getPlatformConfigEntry(
	key: string,
): PlatformConfigEntry | undefined {
	return Object.hasOwn(PLATFORM_CONFIG_REGISTRY, key)
		? PLATFORM_CONFIG_REGISTRY[key]
		: undefined;
}

export function platformConfigDefault(entry: PlatformConfigEntry): unknown {
	return typeof entry.default === "function"
		? (entry.default as () => unknown)()
		: entry.default;
}

function resolveEntry(
	key: string,
	entry: PlatformConfigEntry,
	stored: Record<string, unknown>,
	env: Env,
): { value: unknown; source: PlatformConfigSource } {
	if (Object.hasOwn(stored, key)) {
		return { value: stored[key], source: "db" };
	}
	const fromEnv = entry.fromEnv(env);
	if (fromEnv !== undefined) {
		return { value: fromEnv, source: "env" };
	}
	return { value: platformConfigDefault(entry), source: "default" };
}

export interface PlatformConfigState {
	values: PlatformConfig;
	sources: Record<string, PlatformConfigSource>;
}

/** Resolve every key as DB → env → default. Env is read on every call. */
export function resolvePlatformConfig(
	stored: StoredPlatformConfig = {},
	env: Env = process.env,
): PlatformConfigState {
	const values: Record<string, unknown> = {};
	const sources: Record<string, PlatformConfigSource> = {};
	for (const [key, entry] of Object.entries(PLATFORM_CONFIG_REGISTRY)) {
		const resolved = resolveEntry(
			key,
			entry,
			stored as Record<string, unknown>,
			env,
		);
		values[key] = resolved.value;
		sources[key] = resolved.source;
	}
	return { values: values as PlatformConfig, sources };
}

/**
 * One value from `config`, or env → default when the caller has no loaded
 * config (tests and code paths outside a request).
 */
export function platformConfigValue<K extends PlatformConfigKey>(
	key: K,
	config?: PlatformConfig,
): PlatformConfig[K] {
	if (config) {
		return config[key];
	}
	const entry = getPlatformConfigEntry(key);
	if (!entry) {
		throw new Error(`Unknown platform config key: ${key}`);
	}
	return resolveEntry(key, entry, {}, process.env).value as PlatformConfig[K];
}

export interface PlatformConfigValidationError {
	key: string;
	message: string;
}

export type PlatformConfigPatchResult =
	| { ok: true; values: StoredPlatformConfig }
	| { ok: false; errors: PlatformConfigValidationError[] };

/** Validate an admin-supplied partial update. Unknown keys are errors. */
export function validatePlatformConfigPatch(
	input: Record<string, unknown>,
): PlatformConfigPatchResult {
	const values: Record<string, unknown> = {};
	const errors: PlatformConfigValidationError[] = [];
	for (const [key, value] of Object.entries(input)) {
		const entry = getPlatformConfigEntry(key);
		if (!entry) {
			errors.push({ key, message: "Unknown setting" });
			continue;
		}
		const parsed = entry.schema.safeParse(value);
		if (!parsed.success) {
			errors.push({
				key,
				message: parsed.error.issues.map((issue) => issue.message).join("; "),
			});
			continue;
		}
		values[key] = parsed.data;
	}
	return errors.length > 0
		? { ok: false, errors }
		: { ok: true, values: values as StoredPlatformConfig };
}

/** Rules spanning several keys, checked against the merged effective config. */
export function crossValidatePlatformConfig(
	config: PlatformConfig,
): PlatformConfigValidationError[] {
	const errors: PlatformConfigValidationError[] = [];
	if (config["billing.topUpMinAmount"] > config["billing.topUpMaxAmount"]) {
		errors.push({
			key: "billing.topUpMinAmount",
			message: "Must not exceed the maximum top-up",
		});
	}
	if (
		config["contentFilter.tierStrictScoreThreshold"] >
		config["contentFilter.tierLenientScoreThreshold"]
	) {
		errors.push({
			key: "contentFilter.tierStrictScoreThreshold",
			message: "Must not exceed the lenient threshold",
		});
	}
	return errors;
}

/**
 * Parse the stored row value. Keys that no longer validate (renamed, or
 * tightened bounds) are dropped and reported so the caller can log them.
 */
export function parseStoredPlatformConfig(raw: string | null | undefined): {
	values: StoredPlatformConfig;
	invalidKeys: string[];
} {
	if (!raw) {
		return { values: {}, invalidKeys: [] };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { values: {}, invalidKeys: ["(unparseable JSON)"] };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { values: {}, invalidKeys: ["(not an object)"] };
	}
	const values: Record<string, unknown> = {};
	const invalidKeys: string[] = [];
	for (const [key, value] of Object.entries(parsed)) {
		const entry = getPlatformConfigEntry(key);
		const result = entry?.schema.safeParse(value);
		if (result?.success) {
			values[key] = result.data;
		} else {
			invalidKeys.push(key);
		}
	}
	return { values: values as StoredPlatformConfig, invalidKeys };
}

export interface PlatformConfigEntryView {
	key: string;
	category: PlatformConfigCategory;
	label: string;
	description: string;
	type: PlatformConfigType;
	unit: string | null;
	min: number | null;
	max: number | null;
	options: readonly string[] | null;
	nullable: boolean;
	default: unknown;
	value: unknown;
	source: PlatformConfigSource;
	env: string | null;
	secret: false;
}

/** Registry metadata plus effective values, for the admin settings page. */
export function describePlatformConfig(state: PlatformConfigState): {
	categories: { id: PlatformConfigCategory; label: string }[];
	entries: PlatformConfigEntryView[];
} {
	const values = state.values as unknown as Record<string, unknown>;
	return {
		categories: PLATFORM_CONFIG_CATEGORIES.map((c) => ({ ...c })),
		entries: Object.entries(PLATFORM_CONFIG_REGISTRY).map(([key, entry]) => ({
			key,
			category: entry.category,
			label: entry.label,
			description: entry.description,
			type: entry.type,
			unit: entry.unit,
			min: entry.min,
			max: entry.max,
			options: entry.options,
			nullable: entry.nullable,
			default: platformConfigDefault(entry),
			value: values[key],
			source: state.sources[key] ?? "default",
			env: entry.env,
			secret: false,
		})),
	};
}
