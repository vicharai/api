/**
 * Built-in rate-limit and trust-tier defaults. The platform config registry
 * seeds its entries from these; read effective values through `spend-tier.ts`.
 */

export interface PathRateLimitConfig {
	/** Stable identifier used in the Redis key and env var names. */
	key: string;
	/** Path prefix this config applies to. */
	prefix: string;
	/** Default requests per minute for regular (pay-as-you-go) orgs. */
	defaultRpm: number;
	/** Default requests per minute for dev ("devpass") plan orgs. */
	devDefaultRpm: number;
	/** Default requests per minute for chat plan orgs. */
	chatDefaultRpm: number;
}

/**
 * Ordered list of path configs. The first entry whose prefix matches the
 * request path wins, so more specific prefixes must come before less specific
 * ones (e.g. `/v1/audio/speech` before any hypothetical `/v1/audio`).
 */
export const PATH_RATE_LIMITS: readonly PathRateLimitConfig[] = [
	{
		key: "chat_completions",
		prefix: "/v1/chat/completions",
		defaultRpm: 600,
		devDefaultRpm: 120,
		chatDefaultRpm: 60,
	},
	{
		key: "messages",
		prefix: "/v1/messages",
		defaultRpm: 600,
		devDefaultRpm: 120,
		chatDefaultRpm: 60,
	},
	{
		key: "responses",
		prefix: "/v1/responses",
		defaultRpm: 600,
		devDefaultRpm: 120,
		chatDefaultRpm: 60,
	},
	{
		key: "embeddings",
		prefix: "/v1/embeddings",
		defaultRpm: 1200,
		devDefaultRpm: 120,
		chatDefaultRpm: 120,
	},
	{
		key: "moderations",
		prefix: "/v1/moderations",
		defaultRpm: 1200,
		devDefaultRpm: 120,
		chatDefaultRpm: 120,
	},
	{
		key: "rerank",
		prefix: "/v1/rerank",
		defaultRpm: 1200,
		devDefaultRpm: 120,
		chatDefaultRpm: 120,
	},
	{
		// TypeSafe's own ceiling is 1,200 requests/minute across our whole
		// account, so the per-org limit stays below it.
		key: "systemone",
		prefix: "/v1/systemone",
		defaultRpm: 600,
		devDefaultRpm: 120,
		chatDefaultRpm: 60,
	},
	{
		key: "models",
		prefix: "/v1/models",
		defaultRpm: 1200,
		devDefaultRpm: 120,
		chatDefaultRpm: 120,
	},
	{
		key: "ocr",
		prefix: "/v1/ocr",
		defaultRpm: 300,
		devDefaultRpm: 120,
		chatDefaultRpm: 30,
	},
	{
		key: "images",
		prefix: "/v1/images",
		defaultRpm: 300,
		devDefaultRpm: 120,
		chatDefaultRpm: 30,
	},
	{
		key: "audio_speech",
		prefix: "/v1/audio/speech",
		defaultRpm: 300,
		devDefaultRpm: 120,
		chatDefaultRpm: 30,
	},
	{
		key: "audio_transcriptions",
		prefix: "/v1/audio/transcriptions",
		defaultRpm: 300,
		devDefaultRpm: 120,
		chatDefaultRpm: 30,
	},
	{
		key: "videos",
		prefix: "/v1/videos",
		defaultRpm: 120,
		devDefaultRpm: 120,
		chatDefaultRpm: 12,
	},
	// Realtime session-secret minting (`POST /v1/realtime/client_secrets`).
	// Session churn needs a fresh secret each time, so limiting the mint also
	// bounds churn; the WebSocket upgrade itself bypasses Hono middleware and
	// is gated by needing one of these secrets.
	{
		key: "realtime",
		prefix: "/v1/realtime",
		defaultRpm: 120,
		devDefaultRpm: 120,
		chatDefaultRpm: 12,
	},
	{
		key: "key",
		prefix: "/v1/key",
		defaultRpm: 1200,
		devDefaultRpm: 120,
		chatDefaultRpm: 120,
	},
	{
		key: "credits",
		prefix: "/v1/credits",
		defaultRpm: 300,
		devDefaultRpm: 120,
		chatDefaultRpm: 30,
	},
	// AI SDK Gateway protocol surface. All four spec-version prefixes forward
	// to /v1/chat/completions internally (that hop is origin-stamped and
	// skipped by the limiter), so the four entries share ONE key and therefore
	// one bucket + one env override, matching the chat budget.
	{
		key: "ai_sdk",
		prefix: "/v1/ai",
		defaultRpm: 600,
		devDefaultRpm: 120,
		chatDefaultRpm: 60,
	},
	{
		key: "ai_sdk",
		prefix: "/v2/ai",
		defaultRpm: 600,
		devDefaultRpm: 120,
		chatDefaultRpm: 60,
	},
	{
		key: "ai_sdk",
		prefix: "/v3/ai",
		defaultRpm: 600,
		devDefaultRpm: 120,
		chatDefaultRpm: 60,
	},
	{
		key: "ai_sdk",
		prefix: "/v4/ai",
		defaultRpm: 600,
		devDefaultRpm: 120,
		chatDefaultRpm: 60,
	},
];

/**
 * Unified trust tiers for regular (kind=default, non-enterprise) orgs. A tier
 * qualifies when EITHER the account is old enough OR its lifetime usage spend
 * is high enough AND the account meets the tier's minimum age; the org gets
 * the highest qualifying tier. The min-age floor is what stops a brand-new
 * account from burning its way up the ladder on day one — spend alone never
 * promotes. The tier drives the per-path RPM multiplier, the daily/monthly
 * USD spend caps, and the top-up allowance.
 */
export interface SpendTierDefaults {
	tier: number;
	/** Account age (days) at or above which this tier qualifies. */
	ageDays: number;
	/** Lifetime usage spend (USD) at or above which this tier qualifies. */
	spendUsd: number;
	/** Minimum account age (days) required for the SPEND path to this tier. */
	minAgeDays: number;
	/** RPM multiplier applied to the per-path base limit. */
	rpmMultiplier: number;
	/** Max concurrent in-flight inference requests (fleet-wide, per org). */
	inflightLimit: number;
	/** Daily USD spend cap. */
	dailyCapUsd: number;
	/** Monthly USD spend cap. */
	monthlyCapUsd: number;
	/** Max gross USD in credit top-ups per rolling 24h window. */
	topUpDailyCapUsd: number;
}

export const SPEND_TIER_DEFAULTS: readonly SpendTierDefaults[] = [
	{
		tier: 0,
		ageDays: 0,
		spendUsd: 0,
		minAgeDays: 0,
		rpmMultiplier: 1,
		inflightLimit: 100,
		// High enough that a typical first top-up ($10-$50) is usable on day
		// one; the min-age floors still stop day-0 burn from buying tiers.
		dailyCapUsd: 25,
		monthlyCapUsd: 250,
		topUpDailyCapUsd: 250,
	},
	{
		tier: 1,
		ageDays: 7,
		spendUsd: 10,
		minAgeDays: 1,
		rpmMultiplier: 2,
		inflightLimit: 200,
		dailyCapUsd: 100,
		monthlyCapUsd: 1_000,
		topUpDailyCapUsd: 500,
	},
	{
		tier: 2,
		ageDays: 30,
		spendUsd: 100,
		minAgeDays: 3,
		rpmMultiplier: 4,
		inflightLimit: 400,
		dailyCapUsd: 500,
		monthlyCapUsd: 5_000,
		topUpDailyCapUsd: 2_500,
	},
	{
		tier: 3,
		ageDays: 60,
		spendUsd: 1_000,
		minAgeDays: 7,
		rpmMultiplier: 10,
		inflightLimit: 1_000,
		dailyCapUsd: 5_000,
		monthlyCapUsd: 50_000,
		topUpDailyCapUsd: 10_000,
	},
	{
		tier: 4,
		ageDays: 90,
		spendUsd: 5_000,
		minAgeDays: 14,
		rpmMultiplier: 20,
		inflightLimit: 2_000,
		dailyCapUsd: 15_000,
		monthlyCapUsd: 200_000,
		topUpDailyCapUsd: 20_000,
	},
];
