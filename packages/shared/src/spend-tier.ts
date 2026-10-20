/**
 * Per-organization trust tiers and rate-limit path config shared by the gateway
 * (which enforces them) and the API (which displays them in the dashboard).
 *
 * Everything here is pure: it reads only its arguments (a loaded
 * `PlatformConfig`, falling back to env/defaults when none is passed), so it
 * can run in either process. The gateway owns the Redis/DB side effects (usage
 * spend aggregation, counter increments); this module owns the ladder math and
 * the Redis key formats so both sides agree.
 */

import {
	platformConfigValue,
	rateLimitRpmConfigKey,
	spendTierConfigKey,
	type PlatformConfig,
	type SpendTierField,
} from "./platform-config.js";
import {
	PATH_RATE_LIMITS,
	SPEND_TIER_DEFAULTS,
	type PathRateLimitConfig,
	type SpendTierDefaults,
} from "./rate-limit-defaults.js";

const DAY_MS = 86_400_000;

export type PlanClass = "regular" | "dev" | "chat";

export {
	PATH_RATE_LIMITS,
	SPEND_TIER_DEFAULTS,
	type PathRateLimitConfig,
	type SpendTierDefaults,
};

export interface ResolvedSpendTier {
	tier: number;
	rpmMultiplier: number;
	inflightLimit: number;
	dailyCapUsd: number;
	monthlyCapUsd: number;
	topUpDailyCapUsd: number;
}

/** Parse a non-negative numeric env var, falling back on missing/invalid. */
export function getRateLimitEnvNumber(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined || raw === "") {
		return fallback;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function tierValue(
	d: SpendTierDefaults,
	field: SpendTierField,
	config: PlatformConfig | undefined,
): number {
	return platformConfigValue(spendTierConfigKey(d.tier, field), config);
}

function resolveTier(
	d: SpendTierDefaults,
	config: PlatformConfig | undefined,
): ResolvedSpendTier {
	return {
		tier: d.tier,
		rpmMultiplier: tierValue(d, "rpmMultiplier", config),
		inflightLimit: tierValue(d, "inflightLimit", config),
		dailyCapUsd: tierValue(d, "dailyCapUsd", config),
		monthlyCapUsd: tierValue(d, "monthlyCapUsd", config),
		topUpDailyCapUsd: tierValue(d, "topUpDailyCapUsd", config),
	};
}

function accountAgeDays(createdAt: Date | string, now: number): number {
	// Org rows served from the SWR disaster mirror are JSON round-tripped, so
	// createdAt arrives as an ISO string; calling .getTime() on it would throw
	// and make the limiter's catch fail open for the whole outage.
	const createdMs =
		createdAt instanceof Date
			? createdAt.getTime()
			: new Date(createdAt).getTime();
	return (now - createdMs) / DAY_MS;
}

/** Org fields the tier resolver reads. */
export interface SpendTierOrg {
	createdAt: Date;
	/** Admin-set tier pin (0-4); takes precedence over the computed ladder. */
	trustTierOverride?: number | null;
	/** Expiry of a temporary pin (boost); ignored once passed. */
	trustTierOverrideUntil?: Date | string | null;
}

/**
 * The org's admin-set tier pin, clamped to the ladder, or null when the org
 * follows the automatic ladder or the pin has expired.
 */
export function resolveTrustTierOverride(
	org: {
		trustTierOverride?: number | null;
		trustTierOverrideUntil?: Date | string | null;
	},
	now: number = Date.now(),
): number | null {
	const override = org.trustTierOverride;
	if (override === null || override === undefined) {
		return null;
	}
	// SWR mirror rows are JSON round-tripped, so the expiry may be a string.
	if (
		org.trustTierOverrideUntil &&
		new Date(org.trustTierOverrideUntil).getTime() <= now
	) {
		return null;
	}
	const max = SPEND_TIER_DEFAULTS.length - 1;
	return Math.min(max, Math.max(0, Math.floor(override)));
}

/**
 * Resolve an org's unified trust tier. An admin-set `trustTierOverride` wins
 * outright — both to hold an abusive org down and to lift a vetted org past
 * the age floors. Otherwise: the highest tier whose age threshold is met, or
 * whose spend threshold is met while the account also satisfies the tier's
 * minimum age. The floor means spend alone never promotes a brand-new
 * account: no amount of day-one burn can unlock higher caps or allowances.
 */
export function getOrgSpendTier(
	org: SpendTierOrg,
	lifetimeSpend: number,
	now: number = Date.now(),
	config?: PlatformConfig,
): ResolvedSpendTier {
	const override = resolveTrustTierOverride(org, now);
	if (override !== null) {
		return resolveTier(SPEND_TIER_DEFAULTS[override], config);
	}
	const ageDays = accountAgeDays(org.createdAt, now);
	for (let i = SPEND_TIER_DEFAULTS.length - 1; i >= 0; i--) {
		const d = SPEND_TIER_DEFAULTS[i];
		if (
			ageDays >= tierValue(d, "ageDays", config) ||
			(lifetimeSpend >= tierValue(d, "spendUsd", config) &&
				ageDays >= tierValue(d, "minAgeDays", config))
		) {
			return resolveTier(d, config);
		}
	}
	return resolveTier(SPEND_TIER_DEFAULTS[0], config);
}

/** Content filter tiers at or above this value use the lenient thresholds. */
export const LENIENT_CONTENT_FILTER_TIER_MIN = 3;

export type ContentFilterLevel = "strict" | "lenient";

export interface ContentFilterTierOrg extends SpendTierOrg {
	/** Admin-set content filter tier pin (0-4); NULL follows the trust tier. */
	contentFilterTierOverride?: number | null;
}

export interface ResolvedContentFilterTier {
	tier: number;
	/** True when `contentFilterTierOverride` decided the tier. */
	overridden: boolean;
	level: ContentFilterLevel;
}

/** The org's content filter pin, clamped to the ladder, or null when unpinned. */
export function resolveContentFilterTierOverride(org: {
	contentFilterTierOverride?: number | null;
}): number | null {
	const override = org.contentFilterTierOverride;
	if (override === null || override === undefined) {
		return null;
	}
	const max = SPEND_TIER_DEFAULTS.length - 1;
	return Math.min(max, Math.max(0, Math.floor(override)));
}

export function contentFilterLevelForTier(tier: number): ContentFilterLevel {
	return tier >= LENIENT_CONTENT_FILTER_TIER_MIN ? "lenient" : "strict";
}

/**
 * Resolve the tier the gateway content filter applies to an org. A content
 * filter pin wins outright; otherwise the tier is the trust tier, so it rises
 * with account age or spend and follows a `trustTierOverride` pin.
 */
export function getOrgContentFilterTier(
	org: ContentFilterTierOrg,
	lifetimeSpend: number,
	now: number = Date.now(),
	config?: PlatformConfig,
): ResolvedContentFilterTier {
	const override = resolveContentFilterTierOverride(org);
	if (override !== null) {
		return {
			tier: override,
			overridden: true,
			level: contentFilterLevelForTier(override),
		};
	}
	const { tier } = getOrgSpendTier(org, lifetimeSpend, now, config);
	return { tier, overridden: false, level: contentFilterLevelForTier(tier) };
}

export interface NextSpendTierInfo extends ResolvedSpendTier {
	/** Account age (days) that qualifies for this tier. */
	ageDaysRequired: number;
	/** Lifetime spend (USD) that qualifies for this tier. */
	spendUsdRequired: number;
	/** Whole days of aging left before qualifying by the age path (0 if met). */
	daysUntilQualify: number;
	/** USD of additional lifetime spend to qualify by the spend path (0 if met). */
	spendUsdUntilQualify: number;
	/** Minimum account age (days) the spend path to this tier requires. */
	minAgeDaysRequired: number;
	/** Whole days until the spend path's age floor is met (0 if met). */
	daysUntilSpendPathUnlocks: number;
}

/**
 * The next tier above an org's current one, with what it takes to reach it:
 * wait until the age threshold, or meet the spend threshold once the account
 * is at least `minAgeDaysRequired` days old. Returns null at the top tier —
 * and for pinned orgs (`trustTierOverride` set): a pinned tier neither ages
 * nor spends its way up, so there is no progression to advertise.
 */
export function getNextSpendTier(
	org: SpendTierOrg,
	lifetimeSpend: number,
	now: number = Date.now(),
	config?: PlatformConfig,
): NextSpendTierInfo | null {
	if (resolveTrustTierOverride(org, now) !== null) {
		return null;
	}
	const current = getOrgSpendTier(org, lifetimeSpend, now, config);
	const next = SPEND_TIER_DEFAULTS.find((d) => d.tier === current.tier + 1);
	if (!next) {
		return null;
	}
	const ageDays = accountAgeDays(org.createdAt, now);
	const ageDaysRequired = tierValue(next, "ageDays", config);
	const spendUsdRequired = tierValue(next, "spendUsd", config);
	const minAgeDaysRequired = tierValue(next, "minAgeDays", config);
	return {
		...resolveTier(next, config),
		ageDaysRequired,
		spendUsdRequired,
		daysUntilQualify: Math.max(0, Math.ceil(ageDaysRequired - ageDays)),
		spendUsdUntilQualify: Math.max(0, spendUsdRequired - lifetimeSpend),
		minAgeDaysRequired,
		daysUntilSpendPathUnlocks: Math.max(
			0,
			Math.ceil(minAgeDaysRequired - ageDays),
		),
	};
}

/**
 * Determine which rate-limit profile an org falls under. Classified by the
 * IMMUTABLE `organization.kind` first: a devpass/chat org whose plan lapsed
 * (devPlan/chatPlan back to "none") is still a product org and must keep its
 * flat product limits, never the regular PAYG bases + tier multiplier. The
 * entitlement fields only cover the legacy case of rows without a kind.
 */
export function getPlanClass(org: {
	kind?: string | null;
	devPlan?: string | null;
	chatPlan?: string | null;
}): PlanClass {
	if (org.kind === "devpass") {
		return "dev";
	}
	if (org.kind === "chat") {
		return "chat";
	}
	if (org.devPlan && org.devPlan !== "none") {
		return "dev";
	}
	if (org.chatPlan && org.chatPlan !== "none") {
		return "chat";
	}
	return "regular";
}

/**
 * Env var that overrides the base RPM for a path under a given plan class, e.g.
 * `GATEWAY_RATE_LIMIT_CHAT_COMPLETIONS_RPM` (regular),
 * `GATEWAY_RATE_LIMIT_DEV_CHAT_COMPLETIONS_RPM` (dev plan),
 * `GATEWAY_RATE_LIMIT_CHATPLAN_CHAT_COMPLETIONS_RPM` (chat plan).
 */
export function baseLimitEnvVar(
	planClass: PlanClass,
	config: PathRateLimitConfig,
): string {
	const suffix = `${config.key.toUpperCase()}_RPM`;
	switch (planClass) {
		case "dev":
			return `GATEWAY_RATE_LIMIT_DEV_${suffix}`;
		case "chat":
			return `GATEWAY_RATE_LIMIT_CHATPLAN_${suffix}`;
		default:
			return `GATEWAY_RATE_LIMIT_${suffix}`;
	}
}

/**
 * Resolve the base RPM for a path under a given plan class, before any
 * spend-tier multiplier. Regular orgs read the platform config; the legacy
 * dev/chat classes stay env-only.
 */
export function getBaseLimit(
	config: PathRateLimitConfig,
	planClass: PlanClass,
	platformConfig?: PlatformConfig,
): number {
	if (planClass === "regular") {
		return platformConfigValue(
			rateLimitRpmConfigKey(config.key),
			platformConfig,
		);
	}
	const fallback =
		planClass === "dev" ? config.devDefaultRpm : config.chatDefaultRpm;
	return getRateLimitEnvNumber(baseLimitEnvVar(planClass, config), fallback);
}

/**
 * Resolve the rate limit config for a request path, or `null` if the path is
 * not rate limited (e.g. `/`, `/metrics`, `/docs`, `/mcp`).
 */
export function resolvePathRateLimit(path: string): PathRateLimitConfig | null {
	for (const config of PATH_RATE_LIMITS) {
		if (path === config.prefix || path.startsWith(`${config.prefix}/`)) {
			return config;
		}
	}
	return null;
}

/** Org fields needed to decide whether spend caps apply and resolve its tier. */
export interface SpendCapOrg {
	id: string;
	kind?: string | null;
	plan?: string | null;
	createdAt: Date;
	trustTierOverride?: number | null;
	trustTierOverrideUntil?: Date | string | null;
}

/** Only regular pay-as-you-go orgs are capped; devpass/chat/enterprise are not. */
export function isCappedOrg(org: {
	kind?: string | null;
	plan?: string | null;
}): boolean {
	return org.kind === "default" && org.plan !== "enterprise";
}

/** Rolling window for the per-tier top-up velocity cap. */
export const TOPUP_VELOCITY_WINDOW_MS = 86_400_000;

/**
 * TTL for the Redis reservation that bridges top-up initiation to webhook
 * fulfillment (when the `transaction` row appears). Long enough to cover
 * webhook latency, short enough that abandoned attempts free their headroom.
 */
export const TOPUP_VELOCITY_RESERVATION_TTL_SECONDS = 900;

/** Redis key holding the org's in-flight (reserved) top-up USD. */
export function topUpVelocityKey(organizationId: string): string {
	return `topup_velocity:resv:${organizationId}`;
}

/** Limit families tracked in `org_limit_hit_daily` for the admin dashboard. */
export type OrgLimitType =
	| "rpm"
	| "spend_cap_daily"
	| "spend_cap_monthly"
	| "topup_velocity"
	| "concurrency";

/**
 * `PATH_RATE_LIMITS` keys whose requests are inference work: they can hold a
 * connection open for the duration of a model call (minutes for streaming),
 * so they are the only paths counted against in-flight concurrency budgets
 * (the per-org limit and the pod-wide backpressure cap). Cheap metadata reads
 * (models, key, credits) and the realtime secret mint are excluded — realtime
 * WebSocket sessions bypass Hono middleware entirely and are bounded by their
 * own session caps.
 */
export const INFLIGHT_LIMITED_KEYS: ReadonlySet<string> = new Set([
	"chat_completions",
	"messages",
	"responses",
	"embeddings",
	"moderations",
	"rerank",
	"systemone",
	"ocr",
	"images",
	"audio_speech",
	"audio_transcriptions",
	"videos",
	"ai_sdk",
]);

/** Redis sorted set holding an org's in-flight inference request slots. */
export function orgInflightKey(organizationId: string): string {
	return `rate_limit:org_inflight:${organizationId}`;
}

/**
 * How long an in-flight slot may live before it is considered leaked and
 * reaped (a pod that crashed mid-stream never releases its slots). Must stay
 * above the longest legitimate request — streams get a 20-minute grace
 * (`SHUTDOWN_GRACE_PERIOD_MS`/`AI_STREAMING_TIMEOUT_MS`) — so a legit
 * long-runner at worst frees its slot early, which only errs permissive.
 */
export function getOrgInflightStaleSeconds(config?: PlatformConfig): number {
	return platformConfigValue("gateway.orgInflightStaleSeconds", config);
}

/**
 * Base fleet-wide cap on an organization's concurrent in-flight inference
 * requests, by plan class. Unlike the per-path RPM limits, enterprise orgs
 * are not exempt — they get an elevated ceiling instead, since unbounded
 * concurrency from a single tenant can still exhaust shared gateway capacity.
 * For regular (PAYG) orgs this is tier 0's `inflightLimit`; higher trust
 * tiers raise it, resolved lazily by the gateway only once an org reaches
 * this base (mirroring the RPM multiplier). Dev/chat plans stay flat. A
 * value of 0 disables the check for that class (matching `getBaseLimit`
 * semantics).
 */
export function getOrgInflightLimit(
	planClass: PlanClass,
	isEnterprise: boolean,
	config?: PlatformConfig,
): number {
	if (isEnterprise) {
		return platformConfigValue("gateway.orgInflightLimitEnterprise", config);
	}
	switch (planClass) {
		case "dev":
			return getRateLimitEnvNumber("GATEWAY_ORG_INFLIGHT_LIMIT_DEV", 50);
		case "chat":
			return getRateLimitEnvNumber("GATEWAY_ORG_INFLIGHT_LIMIT_CHATPLAN", 10);
		default:
			return resolveTier(SPEND_TIER_DEFAULTS[0], config).inflightLimit;
	}
}

/**
 * Redis hash buffering one UTC day of per-org limit-hit counters until the
 * worker flushes them to Postgres. Fields are
 * `c|{orgId}|{limitType}|{endpointKey}` (hit count) and `u|...` (blocked USD).
 */
export function limitHitsKey(dayKey: string): string {
	return `limit_hits:${dayKey}`;
}

/**
 * Which orgs the top-up velocity cap applies to. Broader than {@link isCappedOrg}:
 * DevPass PAYG top-ups also land in `organization.credits` via the same Stripe
 * path and are equally abusable, so devpass orgs are included. Enterprise is
 * fully exempt.
 */
export function isTopUpVelocityGatedOrg(org: {
	kind?: string | null;
	plan?: string | null;
}): boolean {
	return (
		org.plan !== "enterprise" &&
		(org.kind === "default" || org.kind === "devpass")
	);
}

/**
 * Per-org endpoint RPM limiting switch (`gateway.rateLimitsEnabled`). Unset, it
 * is on everywhere except the e2e suite. Lives here so the API's limits
 * display honors the same switch enforcement reads.
 */
export function isOrgRateLimitEnabled(config?: PlatformConfig): boolean {
	return platformConfigValue("gateway.rateLimitsEnabled", config);
}

/**
 * Daily/monthly spend cap switch. Unset, it is on except under a test runner,
 * where the tight T0 cap would trip unrelated specs sharing the seeded org.
 */
export function isSpendCapEnabled(config?: PlatformConfig): boolean {
	return platformConfigValue("gateway.spendCapsEnabled", config);
}

/** Top-up velocity cap switch; same unset behavior as the spend caps. */
export function isTopUpVelocityEnabled(config?: PlatformConfig): boolean {
	return platformConfigValue("gateway.topUpVelocityEnabled", config);
}

/** UTC `YYYY-MM-DD` for the daily spend bucket. */
export function spendUtcDateKey(now: number): string {
	const d = new Date(now);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** UTC `YYYY-MM` for the monthly spend bucket. */
export function spendUtcMonthKey(now: number): string {
	const d = new Date(now);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

export function spendDailyKey(organizationId: string, now: number): string {
	return `spend_cap:daily:${organizationId}:${spendUtcDateKey(now)}`;
}

export function spendMonthlyKey(organizationId: string, now: number): string {
	return `spend_cap:monthly:${organizationId}:${spendUtcMonthKey(now)}`;
}
