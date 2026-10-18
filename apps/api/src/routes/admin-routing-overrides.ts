import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { adminMiddleware } from "@/middleware/admin.js";

import {
	db,
	desc,
	eq,
	invalidateCacheTags,
	ROUTING_OVERRIDES_CACHE_TAG,
	routingOverrideScopes,
	tables,
} from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const adminRoutingOverrides = new OpenAPIHono<ServerTypes>();

adminRoutingOverrides.use("/*", adminMiddleware);

const overrideSchema = z.object({
	id: z.string(),
	scope: z.enum(routingOverrideScopes),
	target: z.string(),
	reason: z.string(),
	expiresAt: z.string().nullable(),
	createdAt: z.string(),
	createdByEmail: z.string().nullable(),
	active: z.boolean(),
});

const createOverrideSchema = z
	.object({
		scope: z.enum(routingOverrideScopes),
		target: z.string().trim().min(1).max(300),
		reason: z.string().trim().min(1).max(500),
		expiresAt: z
			.string()
			.refine((value) => !Number.isNaN(Date.parse(value)), {
				message: "Not a valid date",
			})
			.nullable()
			.optional(),
	})
	.refine(
		(body) =>
			body.scope === "mapping"
				? /^[^/\s]+\/\S+$/.test(body.target)
				: !/\s/.test(body.target),
		{
			message: "Mapping targets look like provider/model; others are bare ids",
			path: ["target"],
		},
	);

async function listOverrides(id?: string) {
	const o = tables.routingOverride;
	const rows = await db
		.select({
			id: o.id,
			scope: o.scope,
			target: o.target,
			reason: o.reason,
			expiresAt: o.expiresAt,
			createdAt: o.createdAt,
			createdByEmail: tables.user.email,
		})
		.from(o)
		.leftJoin(tables.user, eq(tables.user.id, o.createdBy))
		.where(id ? eq(o.id, id) : undefined)
		.orderBy(desc(o.createdAt));
	const now = Date.now();
	return rows.map((row) => ({
		...row,
		expiresAt: row.expiresAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		createdByEmail: row.createdByEmail ?? null,
		active: !row.expiresAt || row.expiresAt.getTime() > now,
	}));
}

const listRoute = createRoute({
	operationId: "admin_list_routing_overrides",
	method: "get",
	path: "/routing-overrides",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ overrides: z.array(overrideSchema) }),
				},
			},
			description: "Admin routing kill switches, newest first.",
		},
	},
});

adminRoutingOverrides.openapi(listRoute, async (c) => {
	return c.json({ overrides: await listOverrides() }, 200);
});

const createOverrideRoute = createRoute({
	operationId: "admin_create_routing_override",
	method: "post",
	path: "/routing-overrides",
	request: {
		body: {
			content: { "application/json": { schema: createOverrideSchema } },
		},
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ override: overrideSchema }) },
			},
			description:
				"Kill switch created; the gateway stops routing to matching mappings within seconds.",
		},
	},
});

adminRoutingOverrides.openapi(createOverrideRoute, async (c) => {
	const user = c.get("user");
	const body = c.req.valid("json");
	const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
	if (expiresAt && expiresAt.getTime() <= Date.now()) {
		throw new HTTPException(400, {
			message: "Expiry must be in the future",
		});
	}
	const [row] = await db
		.insert(tables.routingOverride)
		.values({
			scope: body.scope,
			target: body.target,
			reason: body.reason,
			expiresAt,
			createdBy: user?.id ?? null,
		})
		.returning({ id: tables.routingOverride.id });
	await invalidateCacheTags([ROUTING_OVERRIDES_CACHE_TAG]);
	const [override] = await listOverrides(row.id);
	return c.json({ override }, 200);
});

const deleteOverrideRoute = createRoute({
	operationId: "admin_delete_routing_override",
	method: "delete",
	path: "/routing-overrides/{id}",
	request: { params: z.object({ id: z.string() }) },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ success: z.literal(true) }),
				},
			},
			description: "Kill switch removed.",
		},
		404: { description: "Override not found." },
	},
});

adminRoutingOverrides.openapi(deleteOverrideRoute, async (c) => {
	const { id } = c.req.valid("param");
	const [deleted] = await db
		.delete(tables.routingOverride)
		.where(eq(tables.routingOverride.id, id))
		.returning({ id: tables.routingOverride.id });
	if (!deleted) {
		throw new HTTPException(404, { message: "Routing override not found" });
	}
	await invalidateCacheTags([ROUTING_OVERRIDES_CACHE_TAG]);
	return c.json({ success: true as const }, 200);
});
