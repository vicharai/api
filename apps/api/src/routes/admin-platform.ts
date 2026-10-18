import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import {
	getPlatformControls,
	ipRuleSchema,
	updatePlatformControls,
} from "@/lib/platform-controls.js";
import { adminMiddleware } from "@/middleware/admin.js";

import {
	and,
	db,
	desc,
	eq,
	inArray,
	isNotNull,
	lt,
	ne,
	tables,
} from "@llmgateway/db";
import {
	ADMIN_DIGEST_SETTING_ID,
	adminDigestSettingsSchema,
	PAID_TRANSACTION_TYPES,
	parseAdminDigestSettings,
	SIGNUP_MODES,
} from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";

export const adminPlatform = new OpenAPIHono<ServerTypes>();

adminPlatform.use("/*", adminMiddleware);

// --- Platform controls ---

const platformControlsSchema = z
	.object({
		signupMode: z.enum(SIGNUP_MODES),
		blockedSignupIps: z.array(z.string()),
		maintenance: z.object({
			enabled: z.boolean(),
			message: z.string().nullable(),
		}),
	})
	.openapi({});

const getPlatformControlsRoute = createRoute({
	operationId: "admin_get_platform_controls",
	method: "get",
	path: "/settings/platform-controls",
	request: {},
	responses: {
		200: {
			content: { "application/json": { schema: platformControlsSchema } },
			description: "Signup mode, blocked signup IPs and gateway maintenance.",
		},
	},
});

const updatePlatformControlsRoute = createRoute({
	operationId: "admin_update_platform_controls",
	method: "put",
	path: "/settings/platform-controls",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z
						.object({
							signupMode: z.enum(SIGNUP_MODES).optional(),
							blockedSignupIps: z.array(ipRuleSchema).max(1000).optional(),
							maintenance: z
								.object({
									enabled: z.boolean(),
									message: z.string().trim().max(500).nullable().optional(),
								})
								.optional(),
						})
						.openapi({}),
				},
			},
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: platformControlsSchema } },
			description: "Updated platform controls.",
		},
	},
});

adminPlatform.openapi(getPlatformControlsRoute, async (c) => {
	return c.json(await getPlatformControls());
});

adminPlatform.openapi(updatePlatformControlsRoute, async (c) => {
	return c.json(await updatePlatformControls(c.req.valid("json")));
});

// --- Daily admin digest ---

const adminDigestSchema = adminDigestSettingsSchema.openapi({});

const getAdminDigestRoute = createRoute({
	operationId: "admin_get_admin_digest",
	method: "get",
	path: "/settings/admin-digest",
	request: {},
	responses: {
		200: {
			content: { "application/json": { schema: adminDigestSchema } },
			description: "Daily admin digest email settings.",
		},
	},
});

const updateAdminDigestRoute = createRoute({
	operationId: "admin_update_admin_digest",
	method: "put",
	path: "/settings/admin-digest",
	request: {
		body: { content: { "application/json": { schema: adminDigestSchema } } },
	},
	responses: {
		200: {
			content: { "application/json": { schema: adminDigestSchema } },
			description: "Updated daily admin digest settings.",
		},
	},
});

adminPlatform.openapi(getAdminDigestRoute, async (c) => {
	const setting = await db.query.systemSetting.findFirst({
		where: { id: ADMIN_DIGEST_SETTING_ID },
	});
	return c.json(parseAdminDigestSettings(setting?.value));
});

adminPlatform.openapi(updateAdminDigestRoute, async (c) => {
	const settings = c.req.valid("json");
	const value = JSON.stringify(settings);
	await db
		.insert(tables.systemSetting)
		.values({ id: ADMIN_DIGEST_SETTING_ID, enabled: settings.enabled, value })
		.onConflictDoUpdate({
			target: tables.systemSetting.id,
			set: { enabled: settings.enabled, value, updatedAt: new Date() },
		});
	return c.json(settings);
});

// --- Activity feed ---

const activityEventTypes = [
	"signup",
	"payment",
	"credit_change",
	"block",
	"flag",
	"admin_action",
] as const;

interface ActivityEvent {
	id: string;
	type: (typeof activityEventTypes)[number];
	title: string;
	detail: string | null;
	organizationId: string | null;
	userId: string | null;
	amount: number | null;
	createdAt: string;
}

const activityEventSchema = z.object({
	id: z.string(),
	type: z.enum(activityEventTypes),
	title: z.string(),
	detail: z.string().nullable(),
	organizationId: z.string().nullable(),
	userId: z.string().nullable(),
	amount: z.number().nullable(),
	createdAt: z.string(),
});

const getActivityFeedRoute = createRoute({
	operationId: "admin_get_activity_feed",
	method: "get",
	path: "/activity-feed",
	request: {
		query: z.object({
			limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
			before: z.string().datetime().optional(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z
						.object({ events: z.array(activityEventSchema) })
						.openapi({}),
				},
			},
			description:
				"Newest-first signups, payments, credit changes, blocks, flags and admin actions. Page with `before` set to the last event's createdAt.",
		},
	},
});

const CREDIT_CHANGE_TYPES = [
	"credit_gift",
	"credit_adjustment",
	"promo_credit",
	"credit_refund",
] as const;
const BLOCK_PATH = /\/(?:block|unblock|bulk-block|status)$/;
const FLAG_PATH = /\/risk-flag$/;

function adminActionReason(summary: Record<string, unknown> | null) {
	const body = summary?.body;
	if (body && typeof body === "object" && "reason" in body) {
		const reason = (body as { reason: unknown }).reason;
		return typeof reason === "string" ? reason : null;
	}
	return null;
}

function toNumber(value: string | null): number | null {
	return value === null ? null : Number(value);
}

adminPlatform.openapi(getActivityFeedRoute, async (c) => {
	const query = c.req.valid("query");
	const limit = query.limit ?? 50;
	const before = query.before ? new Date(query.before) : new Date();
	if (Number.isNaN(before.getTime())) {
		throw new HTTPException(400, { message: "Invalid before timestamp" });
	}
	const { user, transaction, organization, adminActionLog } = tables;

	const [signups, flags, transactions, actions] = await Promise.all([
		db
			.select({
				id: user.id,
				email: user.email,
				name: user.name,
				createdAt: user.createdAt,
			})
			.from(user)
			.where(lt(user.createdAt, before))
			.orderBy(desc(user.createdAt))
			.limit(limit),
		db
			.select({
				id: user.id,
				email: user.email,
				riskFlaggedAt: user.riskFlaggedAt,
				riskFlagSource: user.riskFlagSource,
				riskFlagIp: user.riskFlagIp,
			})
			.from(user)
			.where(
				and(
					ne(user.riskStatus, "none"),
					isNotNull(user.riskFlaggedAt),
					lt(user.riskFlaggedAt, before),
				),
			)
			.orderBy(desc(user.riskFlaggedAt))
			.limit(limit),
		db
			.select({
				id: transaction.id,
				type: transaction.type,
				amount: transaction.amount,
				creditAmount: transaction.creditAmount,
				description: transaction.description,
				organizationId: transaction.organizationId,
				organizationName: organization.name,
				createdAt: transaction.createdAt,
			})
			.from(transaction)
			.innerJoin(organization, eq(organization.id, transaction.organizationId))
			.where(
				and(
					eq(transaction.status, "completed"),
					inArray(transaction.type, [
						...PAID_TRANSACTION_TYPES,
						...CREDIT_CHANGE_TYPES,
					]),
					lt(transaction.createdAt, before),
				),
			)
			.orderBy(desc(transaction.createdAt))
			.limit(limit),
		db
			.select()
			.from(adminActionLog)
			.where(lt(adminActionLog.createdAt, before))
			.orderBy(desc(adminActionLog.createdAt))
			.limit(limit),
	]);

	const events: ActivityEvent[] = [];
	for (const row of signups) {
		events.push({
			id: `signup:${row.id}`,
			type: "signup",
			title: `${row.email} signed up`,
			detail: row.name,
			organizationId: null,
			userId: row.id,
			amount: null,
			createdAt: row.createdAt.toISOString(),
		});
	}
	for (const row of flags) {
		events.push({
			id: `flag:${row.id}`,
			type: "flag",
			title: `${row.email} flagged as high risk`,
			detail:
				[row.riskFlagSource, row.riskFlagIp].filter(Boolean).join(" · ") ||
				null,
			organizationId: null,
			userId: row.id,
			amount: null,
			createdAt: row.riskFlaggedAt!.toISOString(),
		});
	}
	for (const row of transactions) {
		const isPayment = (PAID_TRANSACTION_TYPES as readonly string[]).includes(
			row.type,
		);
		const amount = isPayment
			? toNumber(row.amount)
			: toNumber(row.creditAmount ?? row.amount);
		events.push({
			id: `transaction:${row.id}`,
			type: isPayment ? "payment" : "credit_change",
			title: `${row.organizationName}: ${row.type.replaceAll("_", " ")}`,
			detail: row.description,
			organizationId: row.organizationId,
			userId: null,
			amount,
			createdAt: row.createdAt.toISOString(),
		});
	}
	for (const row of actions) {
		const type = FLAG_PATH.test(row.path)
			? "flag"
			: BLOCK_PATH.test(row.path)
				? "block"
				: "admin_action";
		events.push({
			id: `admin_action:${row.id}`,
			type,
			title: `${row.method} ${row.path}`,
			detail: [
				row.adminEmail,
				String(row.statusCode),
				adminActionReason(row.requestSummary),
			]
				.filter(Boolean)
				.join(" · "),
			organizationId: row.targetOrganizationId,
			userId: row.targetUserId,
			amount: null,
			createdAt: row.createdAt.toISOString(),
		});
	}

	events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return c.json({ events: events.slice(0, limit) });
});
