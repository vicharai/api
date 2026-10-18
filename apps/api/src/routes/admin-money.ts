import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { dateQuery, escapeLike } from "@/lib/admin-query.js";
import { applyBalanceAdjustment } from "@/lib/balance-adjustment.js";
import { generatePromoCode, promoCodeInputSchema } from "@/lib/promo-codes.js";
import { adminMiddleware } from "@/middleware/admin.js";

import {
	and,
	apiKeyHourlyStats,
	db,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	lte,
	max,
	or,
	sql,
	tables,
	type SQL,
} from "@llmgateway/db";
import { buildCsv } from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";

export const adminMoney = new OpenAPIHono<ServerTypes>();

adminMoney.use("/*", adminMiddleware);

const json = <T extends z.ZodTypeAny>(schema: T) => ({
	content: { "application/json": { schema } },
});

const nullableNumber = (value: string | null) =>
	value === null ? null : Number(value);

// ---------------------------------------------------------------------------
// Balance adjustments
// ---------------------------------------------------------------------------

const adjustmentFields = {
	amount: z
		.number()
		.min(-100000)
		.max(100000)
		.refine((v) => v !== 0, "Amount cannot be zero"),
	reason: z.string().trim().min(1).max(500),
	allowNegative: z.boolean().optional(),
};

const adjustmentResultSchema = z.object({
	balance: z.number(),
	transactionId: z.string(),
});

const adjustmentResponses = {
	200: { ...json(adjustmentResultSchema), description: "Balance adjusted." },
	404: { description: "Organization not found." },
	409: { description: "The balance would go negative." },
};

const adjustOrganizationBalance = createRoute({
	operationId: "admin_adjust_organization_balance",
	method: "post",
	path: "/organizations/{orgId}/balance-adjustments",
	request: {
		params: z.object({ orgId: z.string() }),
		body: json(z.object(adjustmentFields)),
	},
	responses: adjustmentResponses,
});

adminMoney.openapi(adjustOrganizationBalance, async (c) => {
	const admin = c.get("user")!;
	const { orgId } = c.req.valid("param");
	const { amount, reason, allowNegative = false } = c.req.valid("json");
	const result = await applyBalanceAdjustment({
		organizationId: orgId,
		amount,
		reason,
		allowNegative,
		admin,
	});
	return c.json(result, 200);
});

const adjustUserBalance = createRoute({
	operationId: "admin_adjust_user_balance",
	method: "post",
	path: "/users/{userId}/balance-adjustments",
	request: {
		params: z.object({ userId: z.string() }),
		body: json(
			z.object({ organizationId: z.string().min(1), ...adjustmentFields }),
		),
	},
	responses: adjustmentResponses,
});

adminMoney.openapi(adjustUserBalance, async (c) => {
	const admin = c.get("user")!;
	const { userId } = c.req.valid("param");
	const {
		organizationId,
		amount,
		reason,
		allowNegative = false,
	} = c.req.valid("json");

	const membership = await db.query.userOrganization.findFirst({
		where: { userId: { eq: userId }, organizationId: { eq: organizationId } },
		columns: { id: true },
	});
	if (!membership) {
		throw new HTTPException(404, {
			message: "The user is not a member of this organization",
		});
	}

	const result = await applyBalanceAdjustment({
		organizationId,
		amount,
		reason,
		allowNegative,
		admin,
	});
	return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// Promo codes
// ---------------------------------------------------------------------------

const promoCodeSchema = z.object({
	id: z.string(),
	code: z.string(),
	amount: z.number(),
	maxRedemptions: z.number().nullable(),
	perOrgLimit: z.number(),
	redemptionCount: z.number(),
	expiresAt: z.string().nullable(),
	active: z.boolean(),
	createdAt: z.string(),
	createdByEmail: z.string().nullable(),
});

type PromoCodeRow = typeof tables.promoCode.$inferSelect;

function toPromoCode(row: PromoCodeRow): z.infer<typeof promoCodeSchema> {
	return {
		id: row.id,
		code: row.code,
		amount: Number(row.amount),
		maxRedemptions: row.maxRedemptions,
		perOrgLimit: row.perOrgLimit,
		redemptionCount: row.redemptionCount,
		expiresAt: row.expiresAt?.toISOString() ?? null,
		active: row.active,
		createdAt: row.createdAt.toISOString(),
		createdByEmail: row.createdByEmail,
	};
}

async function promoCodeOrThrow(id: string) {
	const row = await db.query.promoCode.findFirst({
		where: { id: { eq: id } },
	});
	if (!row) {
		throw new HTTPException(404, { message: "Promo code not found" });
	}
	return row;
}

const listPromoCodes = createRoute({
	operationId: "admin_list_promo_codes",
	method: "get",
	path: "/promo-codes",
	responses: {
		200: {
			...json(z.object({ codes: z.array(promoCodeSchema) })),
			description: "Every promo code, newest first.",
		},
	},
});

adminMoney.openapi(listPromoCodes, async (c) => {
	const rows = await db.query.promoCode.findMany({
		orderBy: { createdAt: "desc", id: "desc" },
	});
	return c.json({ codes: rows.map(toPromoCode) }, 200);
});

const isoDate = z
	.string()
	.datetime({ offset: true })
	.transform((value) => new Date(value));

const createPromoCode = createRoute({
	operationId: "admin_create_promo_code",
	method: "post",
	path: "/promo-codes",
	request: {
		body: json(
			z.object({
				// Generated when omitted.
				code: promoCodeInputSchema.optional(),
				amount: z.number().positive().max(100000),
				maxRedemptions: z.number().int().min(1).nullable().optional(),
				perOrgLimit: z.number().int().min(1).max(1000).optional(),
				expiresAt: isoDate.nullable().optional(),
			}),
		),
	},
	responses: {
		200: {
			...json(z.object({ code: promoCodeSchema })),
			description: "Promo code created.",
		},
		409: { description: "The code already exists." },
	},
});

adminMoney.openapi(createPromoCode, async (c) => {
	const admin = c.get("user")!;
	const body = c.req.valid("json");
	const code = body.code ?? generatePromoCode();

	const existing = await db.query.promoCode.findFirst({
		where: { code: { eq: code } },
		columns: { id: true },
	});
	if (existing) {
		throw new HTTPException(409, { message: `Code ${code} already exists` });
	}

	const [row] = await db
		.insert(tables.promoCode)
		.values({
			code,
			amount: body.amount.toString(),
			maxRedemptions: body.maxRedemptions ?? null,
			perOrgLimit: body.perOrgLimit ?? 1,
			expiresAt: body.expiresAt ?? null,
			createdBy: admin.id,
			createdByEmail: admin.email,
		})
		.returning();
	return c.json({ code: toPromoCode(row) }, 200);
});

const updatePromoCode = createRoute({
	operationId: "admin_update_promo_code",
	method: "patch",
	path: "/promo-codes/{id}",
	request: {
		params: z.object({ id: z.string() }),
		body: json(
			z.object({
				active: z.boolean().optional(),
				expiresAt: isoDate.nullable().optional(),
				maxRedemptions: z.number().int().min(1).nullable().optional(),
			}),
		),
	},
	responses: {
		200: {
			...json(z.object({ code: promoCodeSchema })),
			description: "Promo code updated.",
		},
		404: { description: "Promo code not found." },
	},
});

adminMoney.openapi(updatePromoCode, async (c) => {
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	await promoCodeOrThrow(id);
	const [row] = await db
		.update(tables.promoCode)
		.set({
			...(body.active === undefined ? {} : { active: body.active }),
			...(body.expiresAt === undefined ? {} : { expiresAt: body.expiresAt }),
			...(body.maxRedemptions === undefined
				? {}
				: { maxRedemptions: body.maxRedemptions }),
		})
		.where(eq(tables.promoCode.id, id))
		.returning();
	return c.json({ code: toPromoCode(row) }, 200);
});

const deactivatePromoCode = createRoute({
	operationId: "admin_deactivate_promo_code",
	method: "delete",
	path: "/promo-codes/{id}",
	request: { params: z.object({ id: z.string() }) },
	responses: {
		200: {
			...json(z.object({ success: z.boolean() })),
			description: "Promo code deactivated. Redemption history is kept.",
		},
		404: { description: "Promo code not found." },
	},
});

adminMoney.openapi(deactivatePromoCode, async (c) => {
	const { id } = c.req.valid("param");
	await promoCodeOrThrow(id);
	await db
		.update(tables.promoCode)
		.set({ active: false })
		.where(eq(tables.promoCode.id, id));
	return c.json({ success: true }, 200);
});

const listPromoCodeRedemptions = createRoute({
	operationId: "admin_list_promo_code_redemptions",
	method: "get",
	path: "/promo-codes/{id}/redemptions",
	request: { params: z.object({ id: z.string() }) },
	responses: {
		200: {
			...json(
				z.object({
					redemptions: z.array(
						z.object({
							id: z.string(),
							organizationId: z.string(),
							organizationName: z.string(),
							userEmail: z.string().nullable(),
							amount: z.number(),
							createdAt: z.string(),
						}),
					),
				}),
			),
			description: "Redemptions of the code, newest first.",
		},
		404: { description: "Promo code not found." },
	},
});

adminMoney.openapi(listPromoCodeRedemptions, async (c) => {
	const { id } = c.req.valid("param");
	await promoCodeOrThrow(id);
	const redemption = tables.promoCodeRedemption;
	const rows = await db
		.select({
			id: redemption.id,
			organizationId: redemption.organizationId,
			organizationName: tables.organization.name,
			userEmail: tables.user.email,
			amount: redemption.amount,
			createdAt: redemption.createdAt,
		})
		.from(redemption)
		.innerJoin(
			tables.organization,
			eq(redemption.organizationId, tables.organization.id),
		)
		.leftJoin(tables.user, eq(redemption.userId, tables.user.id))
		.where(eq(redemption.promoCodeId, id))
		.orderBy(desc(redemption.createdAt), desc(redemption.id))
		.limit(1000);
	return c.json(
		{
			redemptions: rows.map((row) => ({
				...row,
				amount: Number(row.amount),
				createdAt: row.createdAt.toISOString(),
			})),
		},
		200,
	);
});

// ---------------------------------------------------------------------------
// Global ledger
// ---------------------------------------------------------------------------

const transactionTypes = tables.transaction.type.enumValues;
type TransactionType = (typeof transactionTypes)[number];

const ledgerFilters = {
	// One type or a comma-separated list.
	type: z
		.string()
		.transform((value) => value.split(",").map((t) => t.trim()))
		.refine(
			(types): types is TransactionType[] =>
				types.every((t) => (transactionTypes as readonly string[]).includes(t)),
			"Unknown transaction type",
		)
		.optional(),
	status: z.enum(["pending", "completed", "failed"]).optional(),
	organizationId: z.string().min(1).optional(),
	from: dateQuery("start").optional(),
	to: dateQuery("end").optional(),
	// Bounds on creditAmount, falling back to amount for rows without one.
	minAmount: z.coerce.number().optional(),
	maxAmount: z.coerce.number().optional(),
};

const ledgerQuerySchema = z.object(ledgerFilters);

function ledgerWhere(filters: z.infer<typeof ledgerQuerySchema>) {
	const t = tables.transaction;
	const value = sql`COALESCE(${t.creditAmount}, ${t.amount})`;
	return and(
		filters.type ? inArray(t.type, filters.type) : undefined,
		filters.status ? eq(t.status, filters.status) : undefined,
		filters.organizationId
			? eq(t.organizationId, filters.organizationId)
			: undefined,
		filters.from ? gte(t.createdAt, filters.from) : undefined,
		filters.to ? lte(t.createdAt, filters.to) : undefined,
		filters.minAmount === undefined
			? undefined
			: sql`${value} >= ${filters.minAmount}`,
		filters.maxAmount === undefined
			? undefined
			: sql`${value} <= ${filters.maxAmount}`,
	);
}

function ledgerQuery(where: SQL | undefined) {
	const t = tables.transaction;
	return db
		.select({
			id: t.id,
			createdAt: t.createdAt,
			organizationId: t.organizationId,
			organizationName: tables.organization.name,
			type: t.type,
			status: t.status,
			amount: t.amount,
			creditAmount: t.creditAmount,
			currency: t.currency,
			description: t.description,
			paymentMethod: t.paymentMethod,
		})
		.from(t)
		.innerJoin(
			tables.organization,
			eq(t.organizationId, tables.organization.id),
		)
		.where(where)
		.orderBy(desc(t.createdAt), desc(t.id));
}

type LedgerRow = Awaited<ReturnType<typeof ledgerQuery>>[number];

function toLedgerEntry(row: LedgerRow) {
	return {
		...row,
		createdAt: row.createdAt.toISOString(),
		amount: nullableNumber(row.amount),
		creditAmount: nullableNumber(row.creditAmount),
	};
}

const ledgerEntrySchema = z.object({
	id: z.string(),
	createdAt: z.string(),
	organizationId: z.string(),
	organizationName: z.string(),
	type: z.enum(transactionTypes),
	status: z.enum(["pending", "completed", "failed"]),
	amount: z.number().nullable(),
	creditAmount: z.number().nullable(),
	currency: z.string().nullable(),
	description: z.string().nullable(),
	paymentMethod: z.string().nullable(),
});

const listTransactions = createRoute({
	operationId: "admin_list_transactions",
	method: "get",
	path: "/transactions",
	request: {
		query: ledgerQuerySchema.extend({
			limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
			offset: z.coerce.number().int().min(0).default(0).optional(),
		}),
	},
	responses: {
		200: {
			...json(
				z.object({
					transactions: z.array(ledgerEntrySchema),
					total: z.number(),
				}),
			),
			description: "Transactions across all organizations, newest first.",
		},
	},
});

adminMoney.openapi(listTransactions, async (c) => {
	const { limit = 50, offset = 0, ...filters } = c.req.valid("query");
	const where = ledgerWhere(filters);
	const [rows, [countRow]] = await Promise.all([
		ledgerQuery(where).limit(limit).offset(offset),
		db
			.select({ count: sql<number>`COUNT(*)::int` })
			.from(tables.transaction)
			.where(where),
	]);
	return c.json(
		{
			transactions: rows.map(toLedgerEntry),
			total: Number(countRow?.count ?? 0),
		},
		200,
	);
});

const LEDGER_CSV_MAX_ROWS = 50_000;
const LEDGER_CSV_COLUMNS = [
	"id",
	"createdAt",
	"organizationId",
	"organizationName",
	"type",
	"status",
	"amount",
	"creditAmount",
	"currency",
	"paymentMethod",
	"description",
] as const;

const exportTransactionsCsv = createRoute({
	operationId: "admin_export_transactions_csv",
	method: "get",
	path: "/transactions.csv",
	request: { query: ledgerQuerySchema },
	responses: {
		200: {
			content: { "text/csv": { schema: z.string() } },
			description: `Matching transactions as CSV (newest ${LEDGER_CSV_MAX_ROWS}).`,
		},
	},
});

adminMoney.openapi(exportTransactionsCsv, async (c) => {
	const rows = await ledgerQuery(ledgerWhere(c.req.valid("query"))).limit(
		LEDGER_CSV_MAX_ROWS,
	);
	const entries = rows.map(toLedgerEntry);
	const csv = buildCsv(
		LEDGER_CSV_COLUMNS,
		entries.map((entry) => LEDGER_CSV_COLUMNS.map((column) => entry[column])),
	);
	return c.text(`${csv}\n`, 200, {
		"Content-Type": "text/csv; charset=utf-8",
		"Content-Disposition": 'attachment; filename="transactions.csv"',
	});
});

// ---------------------------------------------------------------------------
// Global API-key search
// ---------------------------------------------------------------------------

const searchApiKeys = createRoute({
	operationId: "admin_search_api_keys",
	method: "get",
	path: "/api-keys",
	request: {
		query: z.object({
			// Key id, token prefix, key name, organization name or id.
			search: z.string().trim().min(1).optional(),
			status: z.enum(["active", "inactive", "deleted"]).optional(),
			limit: z.coerce.number().int().min(1).max(100).default(25).optional(),
			offset: z.coerce.number().int().min(0).default(0).optional(),
		}),
	},
	responses: {
		200: {
			...json(
				z.object({
					apiKeys: z.array(
						z.object({
							id: z.string(),
							description: z.string().nullable(),
							tokenPrefix: z.string(),
							status: z.enum(["active", "inactive", "deleted"]),
							organizationId: z.string(),
							organizationName: z.string(),
							projectId: z.string(),
							projectName: z.string(),
							createdAt: z.string(),
							lastUsedAt: z.string().nullable(),
							usage: z.number().nullable(),
							usageLimit: z.number().nullable(),
						}),
					),
					total: z.number(),
				}),
			),
			description: "API keys across all organizations, newest first.",
		},
	},
});

// Token masks keep the first 12 characters of the key.
const TOKEN_PREFIX_CHARS = 12;

adminMoney.openapi(searchApiKeys, async (c) => {
	const { search, status, limit = 25, offset = 0 } = c.req.valid("query");
	const key = tables.apiKey;
	const where = and(
		search
			? or(
					eq(key.id, search),
					ilike(
						key.tokenMasked,
						`${escapeLike(search.slice(0, TOKEN_PREFIX_CHARS))}%`,
					),
					ilike(key.description, `%${escapeLike(search)}%`),
					ilike(tables.organization.name, `%${escapeLike(search)}%`),
					eq(tables.organization.id, search),
				)
			: undefined,
		status ? eq(key.status, status) : undefined,
	);
	const [rows, [countRow]] = await Promise.all([
		db
			.select({
				id: key.id,
				description: key.description,
				tokenPrefix: key.tokenMasked,
				status: key.status,
				organizationId: tables.organization.id,
				organizationName: tables.organization.name,
				projectId: tables.project.id,
				projectName: tables.project.name,
				createdAt: key.createdAt,
				usage: key.usage,
				usageLimit: key.usageLimit,
			})
			.from(key)
			.innerJoin(tables.project, eq(key.projectId, tables.project.id))
			.innerJoin(
				tables.organization,
				eq(tables.project.organizationId, tables.organization.id),
			)
			.where(where)
			.orderBy(desc(key.createdAt), desc(key.id))
			.limit(limit)
			.offset(offset),
		db
			.select({ count: sql<number>`COUNT(*)::int` })
			.from(key)
			.innerJoin(tables.project, eq(key.projectId, tables.project.id))
			.innerJoin(
				tables.organization,
				eq(tables.project.organizationId, tables.organization.id),
			)
			.where(where),
	]);

	const lastUsed = rows.length
		? await db
				.select({
					apiKeyId: apiKeyHourlyStats.apiKeyId,
					lastUsedAt: max(apiKeyHourlyStats.hourTimestamp),
				})
				.from(apiKeyHourlyStats)
				.where(
					and(
						inArray(
							apiKeyHourlyStats.apiKeyId,
							rows.map((row) => row.id),
						),
						sql`${apiKeyHourlyStats.requestCount} > 0`,
					),
				)
				.groupBy(apiKeyHourlyStats.apiKeyId)
		: [];
	const lastUsedByKey = new Map(
		lastUsed.map((row) => [row.apiKeyId, row.lastUsedAt]),
	);

	return c.json(
		{
			apiKeys: rows.map((row) => ({
				...row,
				status: row.status ?? "active",
				createdAt: row.createdAt.toISOString(),
				lastUsedAt: lastUsedByKey.get(row.id)?.toISOString() ?? null,
				usage: nullableNumber(row.usage),
				usageLimit: nullableNumber(row.usageLimit),
			})),
			total: Number(countRow?.count ?? 0),
		},
		200,
	);
});
