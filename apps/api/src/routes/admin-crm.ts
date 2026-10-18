import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { adminMiddleware } from "@/middleware/admin.js";

import {
	and,
	asc,
	crmStages,
	db,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	ne,
	notInArray,
	projectHourlyStats,
	sql,
	tables,
} from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const adminCrm = new OpenAPIHono<ServerTypes>();

adminCrm.use("/*", adminMiddleware);

const THIRTY_DAYS_MS = 30 * 86_400_000;
const CLOSED_STAGES = ["won", "lost"] as const;
const REVENUE_TRANSACTION_TYPES = [
	"credit_topup",
	"credit_manual_payment",
	"enterprise_license_fee",
] as const;

const stageSchema = z.enum(crmStages);
const segmentSchema = z.enum(["smb", "mid_market", "enterprise"]);
const prioritySchema = z.enum(["low", "medium", "high"]);
const activityTypeSchema = z.enum(["note", "call", "email", "meeting", "task"]);

const moneyInputSchema = z
	.union([z.number(), z.string().trim()])
	.transform((value) => String(value))
	.refine((value) => /^\d+(\.\d+)?$/.test(value), {
		message: "Must be a non-negative amount",
	});
const dateInputSchema = z
	.string()
	.refine((value) => !Number.isNaN(Date.parse(value)), {
		message: "Not a valid date",
	});

const accountSchema = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string().nullable(),
	segment: segmentSchema,
	stage: stageSchema,
	priority: prioritySchema,
	dealValue: z.string().nullable(),
	annualContractValue: z.string().nullable(),
	expectedCloseDate: z.string().nullable(),
	ownerUserId: z.string().nullable(),
	ownerEmail: z.string().nullable(),
	notes: z.string().nullable(),
	organizationIds: z.array(z.string()),
	createdAt: z.string(),
	updatedAt: z.string(),
	openTaskCount: z.number(),
	overdueTaskCount: z.number(),
	lastActivityAt: z.string().nullable(),
	last30dSpend: z.number(),
});

const contactSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().nullable(),
	title: z.string().nullable(),
	phone: z.string().nullable(),
});

const activitySchema = z.object({
	id: z.string(),
	accountId: z.string(),
	type: activityTypeSchema,
	body: z.string(),
	dueAt: z.string().nullable(),
	doneAt: z.string().nullable(),
	createdAt: z.string(),
	createdByEmail: z.string().nullable(),
});

const accountBodySchema = z.object({
	name: z.string().trim().min(1).max(200),
	domain: z.string().trim().max(253).nullable().optional(),
	segment: segmentSchema.optional(),
	stage: stageSchema.optional(),
	priority: prioritySchema.optional(),
	dealValue: moneyInputSchema.nullable().optional(),
	annualContractValue: moneyInputSchema.nullable().optional(),
	expectedCloseDate: dateInputSchema.nullable().optional(),
	ownerUserId: z.string().nullable().optional(),
	notes: z.string().max(10_000).nullable().optional(),
	organizationIds: z.array(z.string()).max(100).optional(),
});

type AccountBody = Partial<z.infer<typeof accountBodySchema>>;
type Account = z.infer<typeof accountSchema>;
type AccountRow = typeof tables.crmAccount.$inferSelect;

const idParamsSchema = z.object({ id: z.string() });
const errorSchema = z.object({ message: z.string() });
const successSchema = z.object({ success: z.literal(true) });

const jsonContent = <T extends z.ZodTypeAny>(schema: T) => ({
	content: { "application/json": { schema } },
});

function iso(date: Date | null): string | null {
	return date ? date.toISOString() : null;
}

function normalizeDomain(domain: string | null | undefined) {
	if (domain === undefined) {
		return undefined;
	}
	const cleaned = domain
		?.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/^@/, "")
		.replace(/\/.*$/, "");
	return cleaned || null;
}

async function orgSpendSince(
	organizationIds: string[],
	since: Date,
): Promise<Map<string, number>> {
	if (organizationIds.length === 0) {
		return new Map();
	}
	const rows = await db
		.select({
			organizationId: tables.project.organizationId,
			spend: sql<number>`COALESCE(SUM(${projectHourlyStats.cost}), 0)::float8`,
		})
		.from(projectHourlyStats)
		.innerJoin(
			tables.project,
			eq(tables.project.id, projectHourlyStats.projectId),
		)
		.where(
			and(
				inArray(tables.project.organizationId, organizationIds),
				gte(projectHourlyStats.hourTimestamp, since),
			),
		)
		.groupBy(tables.project.organizationId);
	return new Map(rows.map((row) => [row.organizationId, Number(row.spend)]));
}

async function summarizeAccounts(rows: AccountRow[]): Promise<Account[]> {
	if (rows.length === 0) {
		return [];
	}
	const now = new Date();
	const accountIds = rows.map((row) => row.id);
	const ownerIds = [
		...new Set(
			rows.flatMap((row) => (row.ownerUserId ? [row.ownerUserId] : [])),
		),
	];
	const organizationIds = [
		...new Set(rows.flatMap((row) => row.organizationIds)),
	];
	const activity = tables.crmActivity;

	const [activityRows, owners, spendByOrg] = await Promise.all([
		db
			.select({
				accountId: activity.accountId,
				openTasks: sql<number>`COUNT(*) FILTER (WHERE ${activity.type} = 'task' AND ${activity.doneAt} IS NULL)::int`,
				overdueTasks: sql<number>`COUNT(*) FILTER (WHERE ${activity.type} = 'task' AND ${activity.doneAt} IS NULL AND ${activity.dueAt} < ${now.toISOString()}::timestamp)::int`,
				lastActivityAt:
					sql<Date | null>`MAX(GREATEST(${activity.createdAt}, ${activity.doneAt}))`.mapWith(
						activity.createdAt,
					),
			})
			.from(activity)
			.where(inArray(activity.accountId, accountIds))
			.groupBy(activity.accountId),
		ownerIds.length > 0
			? db
					.select({ id: tables.user.id, email: tables.user.email })
					.from(tables.user)
					.where(inArray(tables.user.id, ownerIds))
			: Promise.resolve([]),
		orgSpendSince(organizationIds, new Date(now.getTime() - THIRTY_DAYS_MS)),
	]);

	const activityByAccount = new Map(activityRows.map((r) => [r.accountId, r]));
	const ownerEmails = new Map(owners.map((owner) => [owner.id, owner.email]));

	return rows.map((row) => {
		const stats = activityByAccount.get(row.id);
		return {
			id: row.id,
			name: row.name,
			domain: row.domain,
			segment: row.segment,
			stage: row.stage,
			priority: row.priority,
			dealValue: row.dealValue,
			annualContractValue: row.annualContractValue,
			expectedCloseDate: iso(row.expectedCloseDate),
			ownerUserId: row.ownerUserId,
			ownerEmail: row.ownerUserId
				? (ownerEmails.get(row.ownerUserId) ?? null)
				: null,
			notes: row.notes,
			organizationIds: row.organizationIds,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
			openTaskCount: Number(stats?.openTasks ?? 0),
			overdueTaskCount: Number(stats?.overdueTasks ?? 0),
			lastActivityAt: iso(stats?.lastActivityAt ?? null),
			last30dSpend: row.organizationIds.reduce(
				(sum, orgId) => sum + (spendByOrg.get(orgId) ?? 0),
				0,
			),
		};
	});
}

function computeKpis(accounts: Account[]) {
	const attentionCutoff = Date.now() - THIRTY_DAYS_MS;
	const isOpen = (account: Account) =>
		!(CLOSED_STAGES as readonly string[]).includes(account.stage);
	let contractedAcv = 0;
	let openPipeline = 0;
	let needsAttention = 0;
	for (const account of accounts) {
		if (account.stage === "won") {
			contractedAcv += Number(account.annualContractValue ?? 0);
		}
		if (!isOpen(account)) {
			continue;
		}
		openPipeline += Number(account.dealValue ?? 0);
		const lastTouch = Date.parse(account.lastActivityAt ?? account.createdAt);
		if (account.overdueTaskCount > 0 || lastTouch < attentionCutoff) {
			needsAttention++;
		}
	}
	return {
		contractedAcv,
		openPipeline,
		trials: accounts.filter((a) => a.stage === "trial").length,
		leads: accounts.filter((a) => a.stage === "lead").length,
		needsAttention,
	};
}

async function findAccountRow(id: string): Promise<AccountRow> {
	const [row] = await db
		.select()
		.from(tables.crmAccount)
		.where(eq(tables.crmAccount.id, id))
		.limit(1);
	if (!row) {
		throw new HTTPException(404, { message: "CRM account not found" });
	}
	return row;
}

async function loadAccount(id: string): Promise<Account> {
	const [account] = await summarizeAccounts([await findAccountRow(id)]);
	return account;
}

async function assertReferencesExist(body: AccountBody): Promise<void> {
	if (body.ownerUserId) {
		const owner = await db.query.user.findFirst({
			where: { id: { eq: body.ownerUserId } },
			columns: { id: true },
		});
		if (!owner) {
			throw new HTTPException(400, { message: "Owner user not found" });
		}
	}
	const orgIds = [...new Set(body.organizationIds ?? [])];
	if (orgIds.length > 0) {
		const found = await db
			.select({ id: tables.organization.id })
			.from(tables.organization)
			.where(inArray(tables.organization.id, orgIds));
		const foundIds = new Set(found.map((org) => org.id));
		const missing = orgIds.filter((id) => !foundIds.has(id));
		if (missing.length > 0) {
			throw new HTTPException(400, {
				message: `Unknown organization ids: ${missing.join(", ")}`,
			});
		}
	}
}

function toAccountValues(body: AccountBody) {
	return {
		name: body.name,
		domain: normalizeDomain(body.domain),
		segment: body.segment,
		stage: body.stage,
		priority: body.priority,
		dealValue: body.dealValue,
		annualContractValue: body.annualContractValue,
		expectedCloseDate:
			body.expectedCloseDate === undefined
				? undefined
				: body.expectedCloseDate === null
					? null
					: new Date(body.expectedCloseDate),
		ownerUserId: body.ownerUserId,
		notes: body.notes,
		organizationIds: body.organizationIds
			? [...new Set(body.organizationIds)]
			: undefined,
	};
}

async function listAllAccounts(): Promise<Account[]> {
	const rows = await db
		.select()
		.from(tables.crmAccount)
		.orderBy(desc(tables.crmAccount.updatedAt));
	return await summarizeAccounts(rows);
}

const listAccounts = createRoute({
	operationId: "admin_list_crm_accounts",
	method: "get",
	path: "/crm/accounts",
	request: {
		query: z.object({
			stage: stageSchema.optional(),
			segment: segmentSchema.optional(),
			search: z.string().trim().max(200).optional(),
		}),
	},
	responses: {
		200: {
			...jsonContent(
				z.object({
					accounts: z.array(accountSchema),
					kpis: z.object({
						contractedAcv: z.number(),
						openPipeline: z.number(),
						trials: z.number(),
						leads: z.number(),
						needsAttention: z.number(),
					}),
				}),
			),
			description:
				"CRM accounts matching the filters. KPIs always cover every account.",
		},
	},
});

adminCrm.openapi(listAccounts, async (c) => {
	const { stage, segment, search } = c.req.valid("query");
	const all = await listAllAccounts();
	const needle = search?.toLowerCase();
	const accounts = all.filter(
		(account) =>
			(!stage || account.stage === stage) &&
			(!segment || account.segment === segment) &&
			(!needle ||
				[account.name, account.domain, account.notes, account.ownerEmail].some(
					(value) => value?.toLowerCase().includes(needle),
				)),
	);
	return c.json({ accounts, kpis: computeKpis(all) }, 200);
});

const CSV_COLUMNS = [
	"id",
	"name",
	"domain",
	"segment",
	"stage",
	"priority",
	"dealValue",
	"annualContractValue",
	"expectedCloseDate",
	"ownerEmail",
	"organizationIds",
	"openTaskCount",
	"overdueTaskCount",
	"lastActivityAt",
	"last30dSpend",
	"createdAt",
	"updatedAt",
] as const satisfies readonly (keyof Account)[];

function csvCell(value: unknown): string {
	const text = Array.isArray(value) ? value.join(";") : String(value ?? "");
	const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
	return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const exportAccountsCsv = createRoute({
	operationId: "admin_export_crm_accounts_csv",
	method: "get",
	path: "/crm/accounts.csv",
	responses: {
		200: {
			content: { "text/csv": { schema: z.string() } },
			description: "Every CRM account as CSV.",
		},
	},
});

adminCrm.openapi(exportAccountsCsv, async (c) => {
	const accounts = await listAllAccounts();
	const lines = [
		CSV_COLUMNS.join(","),
		...accounts.map((account) =>
			CSV_COLUMNS.map((column) => csvCell(account[column])).join(","),
		),
	];
	return c.text(`${lines.join("\n")}\n`, 200, {
		"Content-Type": "text/csv; charset=utf-8",
		"Content-Disposition": 'attachment; filename="crm-accounts.csv"',
	});
});

const createAccount = createRoute({
	operationId: "admin_create_crm_account",
	method: "post",
	path: "/crm/accounts",
	request: { body: jsonContent(accountBodySchema) },
	responses: {
		200: {
			...jsonContent(z.object({ account: accountSchema })),
			description: "Created account.",
		},
		400: { ...jsonContent(errorSchema), description: "Invalid reference." },
	},
});

adminCrm.openapi(createAccount, async (c) => {
	const body = c.req.valid("json");
	await assertReferencesExist(body);
	const [row] = await db
		.insert(tables.crmAccount)
		.values({ ...toAccountValues(body), name: body.name })
		.returning();
	const [account] = await summarizeAccounts([row]);
	return c.json({ account }, 200);
});

const getAccount = createRoute({
	operationId: "admin_get_crm_account",
	method: "get",
	path: "/crm/accounts/{id}",
	request: { params: idParamsSchema },
	responses: {
		200: {
			...jsonContent(
				z.object({
					account: accountSchema,
					contacts: z.array(contactSchema),
					activities: z.array(activitySchema),
					organizations: z.array(
						z.object({
							id: z.string(),
							name: z.string(),
							plan: z.string(),
							credits: z.number(),
							last30dSpend: z.number(),
							totalRevenue: z.number().nullable().openapi({
								description: "Null unless the caller has the admin role.",
							}),
						}),
					),
					inbound: z.array(
						z.object({
							id: z.string(),
							name: z.string().nullable(),
							email: z.string(),
							company: z.string().nullable(),
							createdAt: z.string(),
						}),
					),
				}),
			),
			description: "Account detail with contacts, timeline and linked usage.",
		},
		404: { ...jsonContent(errorSchema), description: "Account not found." },
	},
});

async function orgRevenue(
	organizationIds: string[],
): Promise<Map<string, number>> {
	if (organizationIds.length === 0) {
		return new Map();
	}
	const tx = tables.transaction;
	const rows = await db
		.select({
			organizationId: tx.organizationId,
			revenue: sql<number>`COALESCE(SUM(CAST(${tx.amount} AS NUMERIC)), 0)::float8`,
		})
		.from(tx)
		.where(
			and(
				inArray(tx.organizationId, organizationIds),
				eq(tx.status, "completed"),
				inArray(tx.type, [...REVENUE_TRANSACTION_TYPES]),
				sql`CAST(${tx.amount} AS NUMERIC) > 0`,
			),
		)
		.groupBy(tx.organizationId);
	return new Map(rows.map((row) => [row.organizationId, Number(row.revenue)]));
}

adminCrm.openapi(getAccount, async (c) => {
	const { id } = c.req.valid("param");
	const account = await loadAccount(id);
	const showRevenue = c.get("adminRole") === "admin";
	const activity = tables.crmActivity;
	const submission = tables.enterpriseContactSubmission;
	const domain = account.domain;

	const [contacts, activities, orgRows, spend, revenue, inbound] =
		await Promise.all([
			db
				.select({
					id: tables.crmContact.id,
					name: tables.crmContact.name,
					email: tables.crmContact.email,
					title: tables.crmContact.title,
					phone: tables.crmContact.phone,
				})
				.from(tables.crmContact)
				.where(eq(tables.crmContact.accountId, id))
				.orderBy(asc(tables.crmContact.createdAt)),
			db
				.select({
					id: activity.id,
					accountId: activity.accountId,
					type: activity.type,
					body: activity.body,
					dueAt: activity.dueAt,
					doneAt: activity.doneAt,
					createdAt: activity.createdAt,
					createdByEmail: tables.user.email,
				})
				.from(activity)
				.leftJoin(tables.user, eq(tables.user.id, activity.createdBy))
				.where(eq(activity.accountId, id))
				.orderBy(desc(activity.createdAt)),
			account.organizationIds.length > 0
				? db
						.select({
							id: tables.organization.id,
							name: tables.organization.name,
							plan: tables.organization.plan,
							credits: tables.organization.credits,
						})
						.from(tables.organization)
						.where(inArray(tables.organization.id, account.organizationIds))
				: Promise.resolve([]),
			orgSpendSince(
				account.organizationIds,
				new Date(Date.now() - THIRTY_DAYS_MS),
			),
			showRevenue
				? orgRevenue(account.organizationIds)
				: Promise.resolve(new Map<string, number>()),
			domain
				? db
						.select({
							id: submission.id,
							name: submission.name,
							email: submission.email,
							createdAt: submission.createdAt,
						})
						.from(submission)
						.where(
							and(
								ne(submission.spamFilterStatus, "rejected"),
								sql`(lower(split_part(${submission.email}, '@', 2)) = ${domain} OR lower(split_part(${submission.email}, '@', 2)) LIKE ${`%.${domain}`})`,
							),
						)
						.orderBy(desc(submission.createdAt))
						.limit(100)
				: Promise.resolve([]),
		]);

	return c.json(
		{
			account,
			contacts,
			activities: activities.map((row) => ({
				...row,
				dueAt: iso(row.dueAt),
				doneAt: iso(row.doneAt),
				createdAt: row.createdAt.toISOString(),
				createdByEmail: row.createdByEmail ?? null,
			})),
			organizations: orgRows.map((org) => ({
				id: org.id,
				name: org.name,
				plan: org.plan,
				credits: Number(org.credits),
				last30dSpend: spend.get(org.id) ?? 0,
				totalRevenue: showRevenue ? (revenue.get(org.id) ?? 0) : null,
			})),
			inbound: inbound.map((row) => ({
				id: row.id,
				name: row.name,
				email: row.email,
				company: null,
				createdAt: row.createdAt.toISOString(),
			})),
		},
		200,
	);
});

const updateAccount = createRoute({
	operationId: "admin_update_crm_account",
	method: "patch",
	path: "/crm/accounts/{id}",
	request: {
		params: idParamsSchema,
		body: jsonContent(accountBodySchema.partial()),
	},
	responses: {
		200: {
			...jsonContent(z.object({ account: accountSchema })),
			description: "Updated account.",
		},
		400: { ...jsonContent(errorSchema), description: "Invalid reference." },
		404: { ...jsonContent(errorSchema), description: "Account not found." },
	},
});

adminCrm.openapi(updateAccount, async (c) => {
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	await findAccountRow(id);
	await assertReferencesExist(body);
	await db
		.update(tables.crmAccount)
		.set({ ...toAccountValues(body), updatedAt: new Date() })
		.where(eq(tables.crmAccount.id, id));
	return c.json({ account: await loadAccount(id) }, 200);
});

const deleteAccount = createRoute({
	operationId: "admin_delete_crm_account",
	method: "delete",
	path: "/crm/accounts/{id}",
	request: { params: idParamsSchema },
	responses: {
		200: { ...jsonContent(successSchema), description: "Deleted." },
		404: { ...jsonContent(errorSchema), description: "Account not found." },
	},
});

adminCrm.openapi(deleteAccount, async (c) => {
	const { id } = c.req.valid("param");
	await findAccountRow(id);
	await db.delete(tables.crmAccount).where(eq(tables.crmAccount.id, id));
	return c.json({ success: true as const }, 200);
});

const replaceContacts = createRoute({
	operationId: "admin_replace_crm_contacts",
	method: "put",
	path: "/crm/accounts/{id}/contacts",
	request: {
		params: idParamsSchema,
		body: jsonContent(
			z.object({
				contacts: z
					.array(
						z.object({
							id: z.string().optional(),
							name: z.string().trim().min(1).max(200),
							email: z.string().trim().email().nullable().optional(),
							title: z.string().trim().max(200).nullable().optional(),
							phone: z.string().trim().max(50).nullable().optional(),
						}),
					)
					.max(200),
			}),
		),
	},
	responses: {
		200: {
			...jsonContent(z.object({ contacts: z.array(contactSchema) })),
			description: "The account's full contact list after the replace.",
		},
		404: { ...jsonContent(errorSchema), description: "Account not found." },
	},
});

adminCrm.openapi(replaceContacts, async (c) => {
	const { id } = c.req.valid("param");
	const { contacts } = c.req.valid("json");
	await findAccountRow(id);
	const contact = tables.crmContact;

	const result = await db.transaction(async (tx) => {
		const existing = await tx
			.select({ id: contact.id })
			.from(contact)
			.where(eq(contact.accountId, id));
		const existingIds = new Set(existing.map((row) => row.id));
		const keptIds = contacts.flatMap((entry) =>
			entry.id && existingIds.has(entry.id) ? [entry.id] : [],
		);

		await tx
			.delete(contact)
			.where(
				and(
					eq(contact.accountId, id),
					keptIds.length > 0 ? notInArray(contact.id, keptIds) : undefined,
				),
			);

		const saved = [];
		for (const entry of contacts) {
			const values = {
				name: entry.name,
				email: entry.email || null,
				title: entry.title || null,
				phone: entry.phone || null,
			};
			if (entry.id && existingIds.has(entry.id)) {
				const [row] = await tx
					.update(contact)
					.set(values)
					.where(eq(contact.id, entry.id))
					.returning();
				saved.push(row);
			} else {
				const [row] = await tx
					.insert(contact)
					.values({ ...values, accountId: id })
					.returning();
				saved.push(row);
			}
		}
		await tx
			.update(tables.crmAccount)
			.set({ updatedAt: new Date() })
			.where(eq(tables.crmAccount.id, id));
		return saved;
	});

	return c.json(
		{
			contacts: result.map((row) => ({
				id: row.id,
				name: row.name,
				email: row.email,
				title: row.title,
				phone: row.phone,
			})),
		},
		200,
	);
});

async function loadActivity(id: string) {
	const activity = tables.crmActivity;
	const [row] = await db
		.select({
			id: activity.id,
			accountId: activity.accountId,
			type: activity.type,
			body: activity.body,
			dueAt: activity.dueAt,
			doneAt: activity.doneAt,
			createdAt: activity.createdAt,
			createdByEmail: tables.user.email,
		})
		.from(activity)
		.leftJoin(tables.user, eq(tables.user.id, activity.createdBy))
		.where(eq(activity.id, id))
		.limit(1);
	if (!row) {
		throw new HTTPException(404, { message: "CRM activity not found" });
	}
	return {
		...row,
		dueAt: iso(row.dueAt),
		doneAt: iso(row.doneAt),
		createdAt: row.createdAt.toISOString(),
		createdByEmail: row.createdByEmail ?? null,
	};
}

const createActivity = createRoute({
	operationId: "admin_create_crm_activity",
	method: "post",
	path: "/crm/accounts/{id}/activities",
	request: {
		params: idParamsSchema,
		body: jsonContent(
			z.object({
				type: activityTypeSchema,
				body: z.string().trim().min(1).max(10_000),
				dueAt: dateInputSchema.nullable().optional(),
			}),
		),
	},
	responses: {
		200: {
			...jsonContent(z.object({ activity: activitySchema })),
			description: "Created activity.",
		},
		404: { ...jsonContent(errorSchema), description: "Account not found." },
	},
});

adminCrm.openapi(createActivity, async (c) => {
	const user = c.get("user");
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	await findAccountRow(id);
	const [row] = await db
		.insert(tables.crmActivity)
		.values({
			accountId: id,
			type: body.type,
			body: body.body,
			dueAt: body.dueAt ? new Date(body.dueAt) : null,
			createdBy: user?.id ?? null,
		})
		.returning({ id: tables.crmActivity.id });
	return c.json({ activity: await loadActivity(row.id) }, 200);
});

const updateActivity = createRoute({
	operationId: "admin_update_crm_activity",
	method: "patch",
	path: "/crm/activities/{id}",
	request: {
		params: idParamsSchema,
		body: jsonContent(
			z.object({
				body: z.string().trim().min(1).max(10_000).optional(),
				dueAt: dateInputSchema.nullable().optional(),
				done: z.boolean().optional(),
			}),
		),
	},
	responses: {
		200: {
			...jsonContent(z.object({ activity: activitySchema })),
			description: "Updated activity.",
		},
		404: { ...jsonContent(errorSchema), description: "Activity not found." },
	},
});

adminCrm.openapi(updateActivity, async (c) => {
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	const current = await loadActivity(id);
	await db
		.update(tables.crmActivity)
		.set({
			body: body.body,
			dueAt:
				body.dueAt === undefined
					? undefined
					: body.dueAt === null
						? null
						: new Date(body.dueAt),
			doneAt:
				body.done === undefined
					? undefined
					: body.done
						? current.doneAt
							? new Date(current.doneAt)
							: new Date()
						: null,
		})
		.where(eq(tables.crmActivity.id, id));
	return c.json({ activity: await loadActivity(id) }, 200);
});

const deleteActivity = createRoute({
	operationId: "admin_delete_crm_activity",
	method: "delete",
	path: "/crm/activities/{id}",
	request: { params: idParamsSchema },
	responses: {
		200: { ...jsonContent(successSchema), description: "Deleted." },
		404: { ...jsonContent(errorSchema), description: "Activity not found." },
	},
});

adminCrm.openapi(deleteActivity, async (c) => {
	const { id } = c.req.valid("param");
	const [deleted] = await db
		.delete(tables.crmActivity)
		.where(eq(tables.crmActivity.id, id))
		.returning({ id: tables.crmActivity.id });
	if (!deleted) {
		throw new HTTPException(404, { message: "CRM activity not found" });
	}
	return c.json({ success: true as const }, 200);
});

const listTasks = createRoute({
	operationId: "admin_list_crm_tasks",
	method: "get",
	path: "/crm/tasks",
	responses: {
		200: {
			...jsonContent(
				z.object({
					tasks: z.array(
						z.object({
							id: z.string(),
							accountId: z.string(),
							accountName: z.string(),
							body: z.string(),
							dueAt: z.string().nullable(),
							createdAt: z.string(),
						}),
					),
				}),
			),
			description: "Open tasks, earliest due first; undated tasks last.",
		},
	},
});

adminCrm.openapi(listTasks, async (c) => {
	const activity = tables.crmActivity;
	const rows = await db
		.select({
			id: activity.id,
			accountId: activity.accountId,
			accountName: tables.crmAccount.name,
			body: activity.body,
			dueAt: activity.dueAt,
			createdAt: activity.createdAt,
		})
		.from(activity)
		.innerJoin(tables.crmAccount, eq(tables.crmAccount.id, activity.accountId))
		.where(and(eq(activity.type, "task"), isNull(activity.doneAt)))
		.orderBy(sql`${activity.dueAt} ASC NULLS LAST`, asc(activity.createdAt));
	return c.json(
		{
			tasks: rows.map((row) => ({
				...row,
				dueAt: iso(row.dueAt),
				createdAt: row.createdAt.toISOString(),
			})),
		},
		200,
	);
});
