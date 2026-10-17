/**
 * Phase 2 shapes. Ops endpoints (platform controls, digest, activity feed,
 * system health, cache) are contract-only until admin-ops-control lands;
 * generated definitions win once the routes are in openapi.json.
 */
import type { paths } from "./v1";

interface Json<T> {
	content: { "application/json": T };
}

interface Op<Path extends object | undefined, Query, Body, Res> {
	parameters: {
		query?: Query;
		header?: never;
		cookie?: never;
	} & ([Path] extends [undefined] ? { path?: never } : { path: Path });
	requestBody?: [Body] extends [undefined] ? never : Json<Body>;
	responses: {
		200: { headers: { [name: string]: unknown } } & Json<Res>;
	};
}

interface NeverMethods {
	get?: never;
	put?: never;
	post?: never;
	delete?: never;
	options?: never;
	head?: never;
	patch?: never;
	trace?: never;
}

type Item<T> = T &
	Omit<NeverMethods, keyof T> & {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
	};

/** Keys of `T` whose value is not `never` (methods a path item defines). */
type Defined<T> = {
	[M in keyof T]-?: [NonNullable<T[M]>] extends [never] ? never : M;
}[keyof T];

/** Generated methods win; pending ones only fill methods the spec lacks. */
type MergeItem<G, P> = Omit<G, Exclude<Defined<P>, Defined<G>>> &
	Pick<P, Exclude<Defined<P>, Defined<G>>>;

/** Generated paths plus the Phase 2 contracts the spec does not have yet. */
export type WithPhaseTwoPaths<G> = {
	[K in keyof G | keyof PhaseTwoPaths]: K extends keyof G
		? K extends keyof PhaseTwoPaths
			? MergeItem<G[K], PhaseTwoPaths[K]>
			: G[K]
		: K extends keyof PhaseTwoPaths
			? PhaseTwoPaths[K]
			: never;
};

type JsonOf<
	P extends keyof paths,
	M extends keyof paths[P],
> = paths[P][M] extends {
	responses: { 200: { content: { "application/json": infer R } } };
}
	? R
	: never;

export type RoutingOverride = JsonOf<
	"/admin/routing-overrides",
	"get"
>["overrides"][number];
export type RoutingOverrideScope = RoutingOverride["scope"];

export type AdminNote = JsonOf<"/admin/notes", "get">["notes"][number];
export type AdminTargetType = NonNullable<
	paths["/admin/notes"]["get"]["parameters"]["query"]
>["targetType"];

export type Announcement = JsonOf<
	"/admin/announcements",
	"get"
>["announcements"][number];
export type AnnouncementSegment = Announcement["segment"];
export type SegmentType = AnnouncementSegment["type"];

export type SignupMode = "open" | "invite_only" | "closed";

export interface PlatformControls {
	signupMode: SignupMode;
	blockedSignupIps: string[];
	maintenance: { enabled: boolean; message: string | null };
}

export type ActivityType =
	"signup" | "payment" | "credit_change" | "block" | "flag" | "admin_action";

export interface ActivityEvent {
	id: string;
	type: ActivityType;
	title: string;
	detail: string | null;
	organizationId: string | null;
	userId: string | null;
	amount: number | null;
	createdAt: string;
}

export interface HealthCheck {
	name: string;
	status: "ok" | "degraded" | "down";
	latencyMs: number | null;
	detail: string | null;
}

export interface SystemHealth {
	checks: HealthCheck[];
	version: string | null;
	migration: string | null;
	checkedAt: string;
}

export type CacheScope =
	"organization" | "apiKey" | "settings" | "responseCache";

export interface AdminDigestSettings {
	enabled: boolean;
	hourUtc: number;
}

export interface PhaseTwoPaths {
	"/admin/settings/platform-controls": Item<{
		get: Op<undefined, never, undefined, PlatformControls>;
		put: Op<undefined, never, Partial<PlatformControls>, PlatformControls>;
	}>;
	"/admin/settings/admin-digest": Item<{
		get: Op<undefined, never, undefined, AdminDigestSettings>;
		put: Op<undefined, never, AdminDigestSettings, AdminDigestSettings>;
	}>;
	"/admin/activity-feed": Item<{
		get: Op<
			undefined,
			{ limit?: number; before?: string },
			undefined,
			{ events: ActivityEvent[] }
		>;
	}>;
	"/admin/system/health": Item<{
		get: Op<undefined, never, undefined, SystemHealth>;
	}>;
	"/admin/cache/invalidate": Item<{
		post: Op<
			undefined,
			never,
			{ scope: CacheScope; targetId?: string },
			{ success: boolean; cleared: number | null }
		>;
	}>;
}
