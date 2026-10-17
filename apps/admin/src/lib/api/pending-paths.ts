/**
 * Endpoint contracts for admin routes that may not be in the generated
 * OpenAPI types yet. `AdminPaths` lets the generated definitions win, so
 * entries here only apply while a route is missing from openapi.json.
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

interface Success {
	success: true;
}
interface UserIdPath {
	userId: string;
}
interface OrgIdPath {
	orgId: string;
}

export type AdminRoleName = "admin" | "support" | "viewer";

export interface AdminUserDetail {
	user: {
		id: string;
		email: string;
		name: string | null;
		emailVerified: boolean;
		status: "active" | "deactivated";
		blockReason: string | null;
		riskStatus: string | null;
		riskFlaggedAt: string | null;
		riskFlagIp: string | null;
		riskReviewedAt: string | null;
		createdAt: string;
		isOwnerAdmin: boolean;
		adminRole: AdminRoleName | null;
	};
	organizations: {
		id: string;
		name: string;
		role: string;
		status: string | null;
		plan: string;
		kind: string;
		credits: string;
	}[];
	sessions: {
		id: string;
		createdAt: string;
		expiresAt: string;
		ipAddress: string | null;
		userAgent: string | null;
	}[];
	accounts: { providerId: string }[];
	hasPasskeys: boolean;
}

export interface AdminAuditEntry {
	id: string;
	createdAt: string;
	adminUserId: string | null;
	adminEmail: string;
	adminRole: string;
	method: string;
	path: string;
	targetOrganizationId: string | null;
	targetUserId: string | null;
	statusCode: number;
	requestSummary: Record<string, unknown> | null;
}

export interface AdminTeamMember {
	userId: string;
	email: string;
	name: string | null;
	role: AdminRoleName;
	isOwner: boolean;
	createdAt: string | null;
}

export interface PaymentMethodRow {
	id: string;
	type: string;
	brand: string | null;
	last4: string | null;
	expMonth: number | null;
	expYear: number | null;
	isDefault: boolean;
	createdAt: string;
}

export interface ErrorRateAlertSettings {
	enabled: boolean;
	thresholdPercent: number;
	minRequests: number;
	windowMinutes: number;
	cooldownMinutes: number;
	webhookConfigured: boolean;
}

export interface RateLimitBody {
	provider?: string | null;
	model?: string | null;
	limitType: "rpm" | "rpd";
	maxRequests: number;
	enforcement?: "per_org" | "global";
	reason?: string | null;
}

export interface RateLimitRow {
	id: string;
	organizationId: string | null;
	provider: string | null;
	model: string | null;
	limitType: "rpm" | "rpd";
	maxRequests: number;
	enforcement: "per_org" | "global";
	reason: string | null;
	createdAt: string;
	updatedAt: string;
}

type JsonOf<
	P extends keyof paths,
	M extends keyof paths[P],
> = paths[P][M] extends {
	responses: { 200: { content: { "application/json": infer R } } };
}
	? R
	: never;

export type LoadOverview = JsonOf<"/admin/load/overview", "get">;
export type LoadWindow = LoadOverview["window"];
export type LoadGroupBy = LoadOverview["groupBy"];

export type ProviderIncidents = JsonOf<
	"/admin/providers/{providerId}/incidents",
	"get"
>;
export type IncidentWindow = "1h" | "6h" | "24h" | "7d";

export type ProviderAccess = JsonOf<
	"/admin/organizations/{orgId}/provider-access",
	"get"
>;

export type CrmAccountDetail = JsonOf<"/admin/crm/accounts/{id}", "get">;
export type CrmAccount = CrmAccountDetail["account"];
export type CrmContact = CrmAccountDetail["contacts"][number];
export type CrmActivity = CrmAccountDetail["activities"][number];
export type CrmStage = CrmAccount["stage"];
export type CrmSegment = CrmAccount["segment"];
export type CrmPriority = CrmAccount["priority"];
export type CrmActivityType = CrmActivity["type"];
export type CrmAccountBody = NonNullable<
	paths["/admin/crm/accounts/{id}"]["patch"]["requestBody"]
>["content"]["application/json"];

export interface PendingPaths {
	"/admin/users/{userId}": Item<{
		get: Op<UserIdPath, never, undefined, AdminUserDetail>;
	}>;
	"/admin/users/{userId}/block": Item<{
		post: Op<UserIdPath, never, { reason: string }, Success>;
	}>;
	"/admin/users/{userId}/unblock": Item<{
		post: Op<UserIdPath, never, undefined, Success>;
	}>;
	"/admin/users/{userId}/sessions": Item<{
		delete: Op<UserIdPath, never, undefined, { deleted: number }>;
	}>;
	"/admin/organizations/{orgId}/unblock": Item<{
		post: Op<
			OrgIdPath,
			never,
			{ reactivateMembers: boolean },
			{ success: true; reactivatedMembers: number }
		>;
	}>;
	"/admin/organizations/{orgId}/api-keys/{keyId}": Item<{
		patch: Op<
			{ orgId: string; keyId: string },
			never,
			{ status: "active" | "inactive" },
			{ apiKey: { id: string; status: string } }
		>;
	}>;
	"/admin/audit-logs": Item<{
		get: Op<
			undefined,
			{
				limit?: number;
				offset?: number;
				adminUserId?: string;
				targetOrganizationId?: string;
				targetUserId?: string;
				method?: string;
				from?: string;
				to?: string;
				search?: string;
			},
			undefined,
			{ entries: AdminAuditEntry[]; total: number }
		>;
	}>;
	"/admin/team": Item<{
		get: Op<undefined, never, undefined, { members: AdminTeamMember[] }>;
		post: Op<
			undefined,
			never,
			{ email: string; role: AdminRoleName },
			{ member: AdminTeamMember }
		>;
	}>;
	"/admin/team/{userId}": Item<{
		patch: Op<
			UserIdPath,
			never,
			{ role: AdminRoleName },
			{ member: AdminTeamMember }
		>;
		delete: Op<UserIdPath, never, undefined, Success>;
	}>;
	"/admin/organizations/{orgId}/payment-methods": Item<{
		get: Op<
			OrgIdPath,
			never,
			undefined,
			{ paymentMethods: PaymentMethodRow[] }
		>;
	}>;
	"/admin/rate-limits/{rateLimitId}": Item<{
		put: Op<
			{ rateLimitId: string },
			never,
			RateLimitBody,
			{ rateLimit: RateLimitRow }
		>;
	}>;
	"/admin/organizations/{orgId}/rate-limits/{rateLimitId}": Item<{
		put: Op<
			{ orgId: string; rateLimitId: string },
			never,
			RateLimitBody,
			{ rateLimit: RateLimitRow }
		>;
	}>;
	"/admin/settings/model-error-rate-alerts": Item<{
		get: Op<undefined, never, undefined, ErrorRateAlertSettings>;
		put: Op<
			undefined,
			never,
			Omit<ErrorRateAlertSettings, "webhookConfigured"> & {
				webhookUrl?: string | null;
			},
			ErrorRateAlertSettings
		>;
	}>;
}

/** Keys of `T` whose value is not `never` (i.e. methods a path item defines). */
type Defined<T> = {
	[M in keyof T]-?: [NonNullable<T[M]>] extends [never] ? never : M;
}[keyof T];

/** Generated methods win; pending ones only fill methods the spec lacks. */
type MergeItem<G, P> = Omit<G, Exclude<Defined<P>, Defined<G>>> &
	Pick<P, Exclude<Defined<P>, Defined<G>>>;

export type AdminPaths = {
	[K in keyof paths | keyof PendingPaths]: K extends keyof paths
		? K extends keyof PendingPaths
			? MergeItem<paths[K], PendingPaths[K]>
			: paths[K]
		: K extends keyof PendingPaths
			? PendingPaths[K]
			: never;
};
