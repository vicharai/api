import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { normalizeAdminTag } from "@/lib/admin-tags.js";
import { adminMiddleware } from "@/middleware/admin.js";

import {
	adminTargetTypes,
	and,
	db,
	desc,
	eq,
	notInArray,
	sql,
	tables,
	type AdminTargetType,
	type SQL,
} from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const adminNotes = new OpenAPIHono<ServerTypes>();

adminNotes.use("/*", adminMiddleware);

const targetTypeSchema = z.enum(adminTargetTypes);
const targetSchema = z.object({
	targetType: targetTypeSchema,
	targetId: z.string().min(1),
});

const noteSchema = z.object({
	id: z.string(),
	body: z.string(),
	pinned: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string(),
	authorEmail: z.string().nullable(),
});

const successSchema = z.object({ success: z.literal(true) });

const tagSchema = z
	.string()
	.transform(normalizeAdminTag)
	.pipe(
		z
			.string()
			.min(1)
			.max(40)
			.regex(
				/^[a-z0-9][a-z0-9_:.-]*$/,
				"Tags use letters, digits, '-', '_', ':' or '.'",
			),
	);

async function assertTargetExists(
	targetType: AdminTargetType,
	targetId: string,
): Promise<void> {
	const table =
		targetType === "organization" ? tables.organization : tables.user;
	const [row] = await db
		.select({ id: table.id })
		.from(table)
		.where(eq(table.id, targetId))
		.limit(1);
	if (!row) {
		throw new HTTPException(404, { message: `${targetType} not found` });
	}
}

async function selectNotes(where: SQL | undefined) {
	const n = tables.adminNote;
	const rows = await db
		.select({
			id: n.id,
			body: n.body,
			pinned: n.pinned,
			createdAt: n.createdAt,
			updatedAt: n.updatedAt,
			authorEmail: tables.user.email,
		})
		.from(n)
		.leftJoin(tables.user, eq(tables.user.id, n.authorUserId))
		.where(where)
		.orderBy(desc(n.pinned), desc(n.createdAt));
	return rows.map((row) => ({
		...row,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		authorEmail: row.authorEmail ?? null,
	}));
}

async function loadNote(id: string) {
	const [note] = await selectNotes(eq(tables.adminNote.id, id));
	if (!note) {
		throw new HTTPException(404, { message: "Note not found" });
	}
	return note;
}

const listNotesRoute = createRoute({
	operationId: "admin_list_notes",
	method: "get",
	path: "/notes",
	request: { query: targetSchema },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ notes: z.array(noteSchema) }),
				},
			},
			description: "Internal notes on an organization or user, pinned first.",
		},
	},
});

adminNotes.openapi(listNotesRoute, async (c) => {
	const { targetType, targetId } = c.req.valid("query");
	const notes = await selectNotes(
		and(
			eq(tables.adminNote.targetType, targetType),
			eq(tables.adminNote.targetId, targetId),
		),
	);
	return c.json({ notes }, 200);
});

const createNoteRoute = createRoute({
	operationId: "admin_create_note",
	method: "post",
	path: "/notes",
	request: {
		body: {
			content: {
				"application/json": {
					schema: targetSchema.extend({
						body: z.string().trim().min(1).max(10_000),
						pinned: z.boolean().optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ note: noteSchema }) },
			},
			description: "Created note.",
		},
		404: { description: "Target not found." },
	},
});

adminNotes.openapi(createNoteRoute, async (c) => {
	const user = c.get("user");
	const body = c.req.valid("json");
	await assertTargetExists(body.targetType, body.targetId);
	const [row] = await db
		.insert(tables.adminNote)
		.values({
			targetType: body.targetType,
			targetId: body.targetId,
			body: body.body,
			pinned: body.pinned ?? false,
			authorUserId: user?.id ?? null,
		})
		.returning({ id: tables.adminNote.id });
	return c.json({ note: await loadNote(row.id) }, 200);
});

const updateNoteRoute = createRoute({
	operationId: "admin_update_note",
	method: "patch",
	path: "/notes/{id}",
	request: {
		params: z.object({ id: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						body: z.string().trim().min(1).max(10_000).optional(),
						pinned: z.boolean().optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ note: noteSchema }) },
			},
			description: "Updated note.",
		},
		404: { description: "Note not found." },
	},
});

adminNotes.openapi(updateNoteRoute, async (c) => {
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	await loadNote(id);
	await db
		.update(tables.adminNote)
		.set({ body: body.body, pinned: body.pinned, updatedAt: new Date() })
		.where(eq(tables.adminNote.id, id));
	return c.json({ note: await loadNote(id) }, 200);
});

const deleteNoteRoute = createRoute({
	operationId: "admin_delete_note",
	method: "delete",
	path: "/notes/{id}",
	request: { params: z.object({ id: z.string() }) },
	responses: {
		200: {
			content: { "application/json": { schema: successSchema } },
			description: "Deleted.",
		},
		404: { description: "Note not found." },
	},
});

adminNotes.openapi(deleteNoteRoute, async (c) => {
	const { id } = c.req.valid("param");
	const [deleted] = await db
		.delete(tables.adminNote)
		.where(eq(tables.adminNote.id, id))
		.returning({ id: tables.adminNote.id });
	if (!deleted) {
		throw new HTTPException(404, { message: "Note not found" });
	}
	return c.json({ success: true as const }, 200);
});

async function readTags(targetType: AdminTargetType, targetId: string) {
	const rows = await db
		.select({ tag: tables.adminTag.tag })
		.from(tables.adminTag)
		.where(
			and(
				eq(tables.adminTag.targetType, targetType),
				eq(tables.adminTag.targetId, targetId),
			),
		)
		.orderBy(tables.adminTag.tag);
	return rows.map((row) => row.tag);
}

const tagsResponse = z.object({ tags: z.array(z.string()) });

const getTagsRoute = createRoute({
	operationId: "admin_get_tags",
	method: "get",
	path: "/tags",
	request: { query: targetSchema },
	responses: {
		200: {
			content: { "application/json": { schema: tagsResponse } },
			description: "Tags on an organization or user.",
		},
	},
});

adminNotes.openapi(getTagsRoute, async (c) => {
	const { targetType, targetId } = c.req.valid("query");
	return c.json({ tags: await readTags(targetType, targetId) }, 200);
});

const putTagsRoute = createRoute({
	operationId: "admin_set_tags",
	method: "put",
	path: "/tags",
	request: {
		body: {
			content: {
				"application/json": {
					schema: targetSchema.extend({ tags: z.array(tagSchema).max(30) }),
				},
			},
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: tagsResponse } },
			description: "The target's full tag set after the replace.",
		},
		404: { description: "Target not found." },
	},
});

adminNotes.openapi(putTagsRoute, async (c) => {
	const user = c.get("user");
	const { targetType, targetId, tags } = c.req.valid("json");
	await assertTargetExists(targetType, targetId);
	const unique = [...new Set(tags)];
	const t = tables.adminTag;
	await db.transaction(async (tx) => {
		await tx
			.delete(t)
			.where(
				and(
					eq(t.targetType, targetType),
					eq(t.targetId, targetId),
					unique.length > 0 ? notInArray(t.tag, unique) : undefined,
				),
			);
		if (unique.length > 0) {
			await tx
				.insert(t)
				.values(
					unique.map((tag) => ({
						targetType,
						targetId,
						tag,
						createdBy: user?.id ?? null,
					})),
				)
				.onConflictDoNothing();
		}
	});
	return c.json({ tags: await readTags(targetType, targetId) }, 200);
});

const allTagsRoute = createRoute({
	operationId: "admin_list_all_tags",
	method: "get",
	path: "/tags/all",
	request: {
		query: z.object({ targetType: targetTypeSchema.optional() }),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						tags: z.array(z.object({ tag: z.string(), count: z.number() })),
					}),
				},
			},
			description: "Every tag in use with how many targets carry it.",
		},
	},
});

adminNotes.openapi(allTagsRoute, async (c) => {
	const { targetType } = c.req.valid("query");
	const t = tables.adminTag;
	const countExpr = sql<number>`COUNT(*)::int`;
	const rows = await db
		.select({ tag: t.tag, count: countExpr })
		.from(t)
		.where(targetType ? eq(t.targetType, targetType) : undefined)
		.groupBy(t.tag)
		.orderBy(desc(countExpr), t.tag);
	return c.json({ tags: rows }, 200);
});
