/**
 * Round-3 endpoints typed from the agreed contract until the backend branches
 * land and `pnpm --filter admin generate` produces them. Delete this file and
 * its use in admin-types.ts once the generated types cover every path here.
 */
import type { paths } from "./v1";

type Method = "get" | "put" | "post" | "delete" | "patch";
type AnyMethod = Method | "options" | "head" | "trace";

interface Json<R> {
	headers: { [name: string]: unknown };
	content: { "application/json": R };
}

type Op<
	R,
	Q = never,
	P = never,
	B = never,
	C extends string = "application/json",
> = {
	parameters: {
		query?: Q;
		header?: never;
		cookie?: never;
	} & ([P] extends [never] ? { path?: never } : { path: P });
	responses: {
		200: C extends "application/json"
			? Json<R>
			: { headers: { [name: string]: unknown }; content: Record<C, R> };
	};
} & ([B] extends [never]
	? { requestBody?: never }
	: { requestBody: { content: { "application/json": B } } });

type Item<T extends Partial<Record<Method, unknown>>> = T &
	Partial<Record<Exclude<AnyMethod, keyof T>, never>> & {
		parameters: {
			query?: never;
			header?: never;
			path?: never;
			cookie?: never;
		};
	};

// ---- Config registry (agent 2) ----

export type ConfigFieldType =
	"number" | "string" | "boolean" | "stringList" | "json";

export interface PlatformConfigEntry {
	key: string;
	category: string;
	label: string;
	description: string;
	type: ConfigFieldType;
	unit: string | null;
	min: number | null;
	max: number | null;
	options: string[] | null;
	nullable: boolean;
	default: unknown;
	value: unknown;
	source: "db" | "env" | "default";
	env: string | null;
	secret: false;
}

export interface PlatformConfig {
	categories: { id: string; label: string }[];
	entries: PlatformConfigEntry[];
}

// ---- Users & money & content (agent 3) ----

export interface UsersListQuery {
	search?: string;
	tag?: string;
	limit?: number;
	offset?: number;
	sortBy?: "createdAt" | "email" | "lastActiveAt" | "credits";
	sortOrder?: "asc" | "desc";
	status?: "active" | "deactivated";
	riskStatus?: "none" | "flagged" | "approved";
	emailVerified?: "true" | "false";
	createdFrom?: string;
	createdTo?: string;
	hasBalance?: "true" | "false";
}

export interface UserListRow {
	id: string;
	email: string;
	name: string | null;
	emailVerified: boolean;
	status: string;
	riskStatus: string;
	createdAt: string;
	lastActiveAt: string | null;
	totalCredits: number;
	tags: string[];
	organizations: {
		id: string;
		name: string;
		role: string | null;
		credits: string | null;
		status: string | null;
	}[];
}

export interface BalanceAdjustmentBody {
	amount: number;
	reason: string;
	allowNegative?: boolean;
}

export interface BalanceAdjustmentResult {
	balance: number;
	transactionId: string;
}

export interface PromoCodeRow {
	id: string;
	code: string;
	amount: number;
	maxRedemptions: number | null;
	perOrgLimit: number;
	redemptionCount: number;
	expiresAt: string | null;
	active: boolean;
	createdAt: string;
	createdByEmail: string | null;
}

export interface PromoRedemptionRow {
	id: string;
	organizationId: string;
	organizationName: string;
	userEmail: string | null;
	amount: number;
	createdAt: string;
}

export interface TransactionsQuery {
	limit?: number;
	offset?: number;
	type?: string;
	status?: "pending" | "completed" | "failed";
	organizationId?: string;
	from?: string;
	to?: string;
	minAmount?: number;
	maxAmount?: number;
}

export interface LedgerRow {
	id: string;
	createdAt: string;
	organizationId: string;
	organizationName: string;
	type: string;
	status: string;
	amount: number | null;
	creditAmount: number | null;
	currency: string | null;
	description: string | null;
	paymentMethod: string | null;
}

export interface GlobalApiKeyRow {
	id: string;
	description: string | null;
	tokenPrefix: string;
	status: string;
	organizationId: string;
	organizationName: string;
	projectId: string;
	projectName: string;
	createdAt: string;
	lastUsedAt: string | null;
	usage: number | null;
	usageLimit: number | null;
}

export type EmailTemplateId =
	| "welcome"
	| "verification"
	| "password_reset"
	| "low_balance"
	| "payment_receipt"
	| "auto_topup_failed";

export interface EmailTemplateRow {
	id: EmailTemplateId;
	label: string;
	variables: string[];
	defaultSubject: string;
	defaultBody: string;
	subject: string | null;
	body: string | null;
}

export type LegalPageId = "terms" | "privacy";

export interface LegalPageContent {
	page: LegalPageId;
	markdown: string | null;
	updatedAt: string | null;
	defaultMarkdown: string | null;
}

export interface PendingR3Paths {
	"/admin/settings/config": Item<{
		get: Op<PlatformConfig>;
		put: Op<
			PlatformConfig,
			never,
			never,
			{ values: { [key: string]: unknown } }
		>;
	}>;
	"/admin/settings/config/{key}": Item<{
		delete: Op<PlatformConfig, never, { key: string }>;
	}>;
	"/admin/users": Item<{
		get: Op<{ users: UserListRow[]; total: number }, UsersListQuery>;
	}>;
	"/admin/organizations/{orgId}/balance-adjustments": Item<{
		post: Op<
			BalanceAdjustmentResult,
			never,
			{ orgId: string },
			BalanceAdjustmentBody
		>;
	}>;
	"/admin/users/{userId}/balance-adjustments": Item<{
		post: Op<
			BalanceAdjustmentResult,
			never,
			{ userId: string },
			BalanceAdjustmentBody & { organizationId: string }
		>;
	}>;
	"/admin/promo-codes": Item<{
		get: Op<{ codes: PromoCodeRow[] }>;
		post: Op<
			{ code: PromoCodeRow },
			never,
			never,
			{
				code?: string;
				amount: number;
				maxRedemptions?: number;
				perOrgLimit?: number;
				expiresAt?: string;
			}
		>;
	}>;
	"/admin/promo-codes/{id}": Item<{
		patch: Op<
			{ code: PromoCodeRow },
			never,
			{ id: string },
			{
				active?: boolean;
				expiresAt?: string | null;
				maxRedemptions?: number | null;
			}
		>;
		delete: Op<{ success: boolean }, never, { id: string }>;
	}>;
	"/admin/promo-codes/{id}/redemptions": Item<{
		get: Op<{ redemptions: PromoRedemptionRow[] }, never, { id: string }>;
	}>;
	"/admin/transactions": Item<{
		get: Op<{ transactions: LedgerRow[]; total: number }, TransactionsQuery>;
	}>;
	"/admin/transactions.csv": Item<{
		get: Op<string, TransactionsQuery, never, never, "text/csv">;
	}>;
	"/admin/api-keys": Item<{
		get: Op<
			{ apiKeys: GlobalApiKeyRow[]; total: number },
			{
				search?: string;
				status?: "active" | "inactive" | "deleted";
				limit?: number;
				offset?: number;
			}
		>;
	}>;
	"/admin/content/email-templates": Item<{
		get: Op<{ templates: EmailTemplateRow[] }>;
	}>;
	"/admin/content/email-templates/{id}": Item<{
		put: Op<
			{ template: EmailTemplateRow },
			never,
			{ id: EmailTemplateId },
			{ subject: string | null; body: string | null }
		>;
	}>;
	"/admin/content/email-templates/{id}/test": Item<{
		post: Op<{ sent: true }, never, { id: EmailTemplateId }>;
	}>;
	"/admin/content/legal/{page}": Item<{
		get: Op<LegalPageContent, never, { page: LegalPageId }>;
		put: Op<
			LegalPageContent,
			never,
			{ page: LegalPageId },
			{ markdown: string | null }
		>;
	}>;
}

/** Generated paths with the round-3 contract layered on top. */
export type PathsWithPending = Omit<paths, keyof PendingR3Paths> &
	PendingR3Paths;
