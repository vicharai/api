/**
 * Phase 2 control-plane contracts (kill switches, platform controls, notes,
 * tags, user/org management, announcements, activity, health, cache,
 * digest). Generated definitions win once the routes are in openapi.json.
 */
import type { Item, Op, Success } from "./pending-paths";

export type AdminTargetType = "organization" | "user";

export type RoutingOverrideScope = "provider" | "model" | "mapping";

export interface RoutingOverride {
	id: string;
	scope: RoutingOverrideScope;
	target: string;
	reason: string;
	expiresAt: string | null;
	createdAt: string;
	createdByEmail: string | null;
	active: boolean;
}

export type SignupMode = "open" | "invite_only" | "closed";

export interface PlatformControls {
	signupMode: SignupMode;
	blockedSignupIps: string[];
	maintenance: { enabled: boolean; message: string | null };
}

export interface AdminNote {
	id: string;
	body: string;
	pinned: boolean;
	createdAt: string;
	updatedAt: string;
	authorEmail: string | null;
}

export type SegmentType = "all" | "plan" | "kind" | "organizations" | "tag";

export interface AnnouncementSegment {
	type: SegmentType;
	value?: string | string[];
}

export interface Announcement {
	id: string;
	title: string;
	message: string;
	href: string | null;
	segment: AnnouncementSegment;
	recipientCount: number;
	emailSent: boolean;
	createdAt: string;
	createdByEmail: string;
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

interface IdPath {
	id: string;
}
interface UserIdPath {
	userId: string;
}
interface OrgIdPath {
	orgId: string;
}
interface Target {
	targetType: AdminTargetType;
	targetId: string;
}

export interface PhaseTwoPaths {
	"/admin/routing-overrides": Item<{
		get: Op<undefined, never, undefined, { overrides: RoutingOverride[] }>;
		post: Op<
			undefined,
			never,
			{
				scope: RoutingOverrideScope;
				target: string;
				reason: string;
				expiresAt?: string;
			},
			{ override: RoutingOverride }
		>;
	}>;
	"/admin/routing-overrides/{id}": Item<{
		delete: Op<IdPath, never, undefined, Success>;
	}>;
	"/admin/settings/platform-controls": Item<{
		get: Op<undefined, never, undefined, PlatformControls>;
		put: Op<undefined, never, Partial<PlatformControls>, PlatformControls>;
	}>;
	"/admin/settings/admin-digest": Item<{
		get: Op<undefined, never, undefined, AdminDigestSettings>;
		put: Op<undefined, never, AdminDigestSettings, AdminDigestSettings>;
	}>;
	"/admin/notes": Item<{
		get: Op<undefined, Target, undefined, { notes: AdminNote[] }>;
		post: Op<
			undefined,
			never,
			Target & { body: string; pinned?: boolean },
			{ note: AdminNote }
		>;
	}>;
	"/admin/notes/{id}": Item<{
		patch: Op<
			IdPath,
			never,
			{ body?: string; pinned?: boolean },
			{ note: AdminNote }
		>;
		delete: Op<IdPath, never, undefined, Success>;
	}>;
	"/admin/tags": Item<{
		get: Op<undefined, Target, undefined, { tags: string[] }>;
		put: Op<undefined, never, Target & { tags: string[] }, { tags: string[] }>;
	}>;
	"/admin/tags/all": Item<{
		get: Op<
			undefined,
			{ targetType?: AdminTargetType },
			undefined,
			{ tags: { tag: string; count: number }[] }
		>;
	}>;
	"/admin/users/{userId}": Item<{
		delete: Op<UserIdPath, never, { reason: string }, Success>;
	}>;
	"/admin/users/{userId}/email": Item<{
		patch: Op<UserIdPath, never, { email: string }, Success>;
	}>;
	"/admin/users/{userId}/password-reset": Item<{
		post: Op<UserIdPath, never, undefined, { sent: true }>;
	}>;
	"/admin/users/{userId}/passkeys": Item<{
		delete: Op<UserIdPath, never, undefined, { deleted: number }>;
	}>;
	"/admin/organizations": Item<{
		post: Op<
			undefined,
			never,
			{ name: string; ownerEmail: string; billingEmail?: string },
			{ organization: { id: string; name: string } }
		>;
	}>;
	"/admin/organizations/{orgId}/members/{userId}": Item<{
		patch: Op<OrgIdPath & UserIdPath, never, { role: string }, Success>;
		delete: Op<OrgIdPath & UserIdPath, never, undefined, Success>;
	}>;
	"/admin/organizations/{orgId}/api-keys": Item<{
		post: Op<
			OrgIdPath,
			never,
			{ projectId?: string; description: string; usageLimit?: string },
			{
				apiKey: {
					id: string;
					token: string;
					description: string;
					projectId: string;
				};
			}
		>;
	}>;
	"/admin/announcements": Item<{
		get: Op<undefined, never, undefined, { announcements: Announcement[] }>;
		post: Op<
			undefined,
			never,
			{
				title: string;
				message: string;
				href?: string;
				segment: AnnouncementSegment;
				sendEmail: boolean;
			},
			{ announcement: Announcement }
		>;
	}>;
	"/admin/announcements/preview": Item<{
		get: Op<
			undefined,
			{ type: SegmentType; value?: string },
			undefined,
			{ recipientCount: number }
		>;
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
