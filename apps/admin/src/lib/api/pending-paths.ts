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

export type LoadWindow = "1h" | "6h" | "24h" | "7d" | "30d" | "90d" | "365d";
export type LoadGroupBy =
	"model" | "provider" | "organization" | "project" | "apiKey";

export interface LoadOverview {
	window: LoadWindow;
	groupBy: LoadGroupBy;
	summary: {
		requests: number;
		errors: number;
		clientErrors: number;
		errorRate: number;
		requestsPerSecond: number;
		avgDurationMs: number | null;
		avgTtftMs: number | null;
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		cost: number;
	};
	timeseries: {
		timestamp: string;
		requests: number;
		errors: number;
		totalTokens: number;
		avgDurationMs: number | null;
		avgTtftMs: number | null;
	}[];
	breakdown: {
		key: string;
		label: string;
		requests: number;
		errors: number;
		errorRate: number;
		totalTokens: number;
		cost: number;
		avgDurationMs: number | null;
		avgTtftMs: number | null;
	}[];
}

export type IncidentWindow = "1h" | "6h" | "24h" | "7d";

export interface ProviderIncidents {
	summary: {
		requests: number;
		errors: number;
		upstreamErrors: number;
		gatewayErrors: number;
		clientErrors: number;
		errorRate: number;
	};
	byModel: {
		modelId: string;
		requests: number;
		errors: number;
		upstreamErrors: number;
		gatewayErrors: number;
		clientErrors: number;
		errorRate: number;
	}[];
	timeseries: {
		timestamp: string;
		requests: number;
		errors: number;
		upstreamErrors: number;
		gatewayErrors: number;
		clientErrors: number;
	}[];
}

export interface ProviderAccess {
	mode: "none" | "allow" | "deny";
	providers: string[];
	models: string[];
	mappings: string[];
	reason: string | null;
}

export type CrmStage =
	"lead" | "qualified" | "trial" | "negotiation" | "won" | "lost";
export type CrmSegment = "smb" | "mid_market" | "enterprise";
export type CrmPriority = "low" | "medium" | "high";
export type CrmActivityType = "note" | "call" | "email" | "meeting" | "task";

export interface CrmAccount {
	id: string;
	name: string;
	domain: string | null;
	segment: CrmSegment;
	stage: CrmStage;
	priority: CrmPriority;
	dealValue: string | null;
	annualContractValue: string | null;
	expectedCloseDate: string | null;
	ownerUserId: string | null;
	ownerEmail: string | null;
	notes: string | null;
	organizationIds: string[];
	createdAt: string;
	updatedAt: string;
	openTaskCount: number;
	overdueTaskCount: number;
	lastActivityAt: string | null;
	last30dSpend: number;
}

export interface CrmAccountBody {
	name?: string;
	domain?: string | null;
	segment?: CrmSegment;
	stage?: CrmStage;
	priority?: CrmPriority;
	dealValue?: string | null;
	annualContractValue?: string | null;
	expectedCloseDate?: string | null;
	ownerUserId?: string | null;
	notes?: string | null;
	organizationIds?: string[];
}

export interface CrmContact {
	id: string;
	name: string;
	email: string | null;
	title: string | null;
	phone: string | null;
}

export interface CrmActivity {
	id: string;
	type: CrmActivityType;
	body: string;
	dueAt: string | null;
	doneAt: string | null;
	createdAt: string;
	createdByEmail: string | null;
}

export interface CrmAccountDetail {
	account: CrmAccount;
	contacts: CrmContact[];
	activities: CrmActivity[];
	organizations: {
		id: string;
		name: string;
		plan: string;
		credits: string;
		last30dSpend: number;
		totalRevenue: number;
	}[];
	inbound: {
		id: string;
		name: string | null;
		email: string;
		company: string | null;
		createdAt: string;
	}[];
}

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
	"/admin/load/overview": Item<{
		get: Op<
			undefined,
			{
				window?: LoadWindow;
				groupBy?: LoadGroupBy;
				metric?: "requests" | "tokens";
			},
			undefined,
			LoadOverview
		>;
	}>;
	"/admin/providers/{providerId}/incidents": Item<{
		get: Op<
			{ providerId: string },
			{ window?: IncidentWindow },
			undefined,
			ProviderIncidents
		>;
	}>;
	"/admin/organizations/{orgId}/provider-access": Item<{
		get: Op<OrgIdPath, never, undefined, ProviderAccess>;
		put: Op<OrgIdPath, never, ProviderAccess, ProviderAccess>;
	}>;
	"/admin/crm/accounts": Item<{
		get: Op<
			undefined,
			{ stage?: CrmStage; segment?: CrmSegment; search?: string },
			undefined,
			{
				accounts: CrmAccount[];
				kpis: {
					contractedAcv: number;
					openPipeline: number;
					trials: number;
					leads: number;
					needsAttention: number;
				};
			}
		>;
		post: Op<
			undefined,
			never,
			CrmAccountBody & { name: string },
			{ account: CrmAccount }
		>;
	}>;
	"/admin/crm/accounts/{id}": Item<{
		get: Op<{ id: string }, never, undefined, CrmAccountDetail>;
		patch: Op<{ id: string }, never, CrmAccountBody, { account: CrmAccount }>;
		delete: Op<{ id: string }, never, undefined, Success>;
	}>;
	"/admin/crm/accounts/{id}/contacts": Item<{
		put: Op<
			{ id: string },
			never,
			{
				contacts: {
					id?: string;
					name: string;
					email?: string | null;
					title?: string | null;
					phone?: string | null;
				}[];
			},
			{ contacts: CrmContact[] }
		>;
	}>;
	"/admin/crm/accounts/{id}/activities": Item<{
		post: Op<
			{ id: string },
			never,
			{ type: CrmActivityType; body: string; dueAt?: string | null },
			{ activity: CrmActivity }
		>;
	}>;
	"/admin/crm/activities/{id}": Item<{
		patch: Op<
			{ id: string },
			never,
			{ body?: string; dueAt?: string | null; done?: boolean },
			{ activity: CrmActivity }
		>;
		delete: Op<{ id: string }, never, undefined, Success>;
	}>;
	"/admin/crm/tasks": Item<{
		get: Op<
			undefined,
			never,
			undefined,
			{
				tasks: {
					id: string;
					accountId: string;
					accountName: string;
					body: string;
					dueAt: string | null;
					createdAt: string;
				}[];
			}
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
