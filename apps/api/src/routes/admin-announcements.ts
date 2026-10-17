import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { normalizeAdminTag } from "@/lib/admin-tags.js";
import { adminMiddleware } from "@/middleware/admin.js";

import {
	and,
	db,
	desc,
	eq,
	inArray,
	ne,
	tables,
	type AnnouncementSegment,
	type SQL,
} from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const adminAnnouncements = new OpenAPIHono<ServerTypes>();

adminAnnouncements.use("/*", adminMiddleware);

const INSERT_BATCH_SIZE = 1000;

const segmentSchema = z
	.object({
		type: z.enum(["all", "plan", "kind", "organizations", "tag"]),
		value: z.union([z.string(), z.array(z.string())]).optional(),
	})
	.superRefine((segment, ctx) => {
		const values = segmentValues(segment);
		if (segment.type !== "all" && values.length === 0) {
			ctx.addIssue({
				code: "custom",
				message: `A ${segment.type} segment needs a value`,
				path: ["value"],
			});
		}
		if (
			segment.type === "plan" &&
			!values.every((v) => ["free", "pro", "enterprise"].includes(v))
		) {
			ctx.addIssue({
				code: "custom",
				message: "Plan must be free, pro or enterprise",
				path: ["value"],
			});
		}
		if (
			segment.type === "kind" &&
			!values.every((v) => ["default", "devpass", "chat"].includes(v))
		) {
			ctx.addIssue({
				code: "custom",
				message: "Kind must be default, devpass or chat",
				path: ["value"],
			});
		}
	});

const announcementSchema = z.object({
	id: z.string(),
	title: z.string(),
	message: z.string(),
	href: z.string().nullable(),
	segment: z.object({
		type: z.enum(["all", "plan", "kind", "organizations", "tag"]),
		value: z.union([z.string(), z.array(z.string())]).optional(),
	}),
	recipientCount: z.number(),
	emailSent: z.boolean(),
	createdAt: z.string(),
	createdByEmail: z.string(),
});

function segmentValues(segment: AnnouncementSegment): string[] {
	const raw = Array.isArray(segment.value)
		? segment.value
		: (segment.value?.split(",") ?? []);
	return [...new Set(raw.map((v) => v.trim()).filter(Boolean))];
}

async function memberUserIds(orgFilter: SQL | undefined): Promise<string[]> {
	const rows = await db
		.selectDistinct({ userId: tables.userOrganization.userId })
		.from(tables.userOrganization)
		.innerJoin(
			tables.organization,
			eq(tables.organization.id, tables.userOrganization.organizationId),
		)
		.innerJoin(tables.user, eq(tables.user.id, tables.userOrganization.userId))
		.where(
			and(
				ne(tables.user.status, "deactivated"),
				ne(tables.organization.status, "deleted"),
				orgFilter,
			),
		);
	return rows.map((row) => row.userId);
}

/** Active users an announcement segment reaches. */
export async function resolveSegmentUserIds(
	segment: AnnouncementSegment,
): Promise<string[]> {
	const values = segmentValues(segment);
	const org = tables.organization;
	switch (segment.type) {
		case "all": {
			const rows = await db
				.select({ id: tables.user.id })
				.from(tables.user)
				.where(ne(tables.user.status, "deactivated"));
			return rows.map((row) => row.id);
		}
		case "plan":
			return await memberUserIds(
				inArray(org.plan, values as ("free" | "pro" | "enterprise")[]),
			);
		case "kind":
			return await memberUserIds(
				inArray(org.kind, values as ("default" | "devpass" | "chat")[]),
			);
		case "organizations":
			return await memberUserIds(inArray(org.id, values));
		case "tag": {
			const tags = values.map(normalizeAdminTag);
			const tagged = await db
				.select({
					targetType: tables.adminTag.targetType,
					targetId: tables.adminTag.targetId,
				})
				.from(tables.adminTag)
				.where(inArray(tables.adminTag.tag, tags));
			const orgIds = tagged
				.filter((t) => t.targetType === "organization")
				.map((t) => t.targetId);
			const taggedUserIds = tagged
				.filter((t) => t.targetType === "user")
				.map((t) => t.targetId);
			const activeTaggedUsers =
				taggedUserIds.length > 0
					? await db
							.select({ id: tables.user.id })
							.from(tables.user)
							.where(
								and(
									inArray(tables.user.id, taggedUserIds),
									ne(tables.user.status, "deactivated"),
								),
							)
					: [];
			const members =
				orgIds.length > 0 ? await memberUserIds(inArray(org.id, orgIds)) : [];
			return [...new Set([...activeTaggedUsers.map((u) => u.id), ...members])];
		}
	}
}

const listRoute = createRoute({
	operationId: "admin_list_announcements",
	method: "get",
	path: "/announcements",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ announcements: z.array(announcementSchema) }),
				},
			},
			description: "Broadcast history, newest first.",
		},
	},
});

adminAnnouncements.openapi(listRoute, async (c) => {
	const rows = await db
		.select()
		.from(tables.adminAnnouncement)
		.orderBy(desc(tables.adminAnnouncement.createdAt))
		.limit(200);
	return c.json(
		{
			announcements: rows.map((row) => ({
				id: row.id,
				title: row.title,
				message: row.message,
				href: row.href,
				segment: row.segment,
				recipientCount: row.recipientCount,
				emailSent: row.emailSent,
				createdAt: row.createdAt.toISOString(),
				createdByEmail: row.createdByEmail,
			})),
		},
		200,
	);
});

const previewRoute = createRoute({
	operationId: "admin_preview_announcement",
	method: "get",
	path: "/announcements/preview",
	request: {
		query: z.object({
			type: z.enum(["all", "plan", "kind", "organizations", "tag"]),
			value: z
				.string()
				.optional()
				.openapi({ description: "Comma-separated for several values." }),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ recipientCount: z.number() }),
				},
			},
			description: "How many active users the segment reaches.",
		},
	},
});

adminAnnouncements.openapi(previewRoute, async (c) => {
	const query = c.req.valid("query");
	const parsed = segmentSchema.safeParse(query);
	if (!parsed.success) {
		throw new HTTPException(400, {
			message: parsed.error.issues[0]?.message ?? "Invalid segment",
		});
	}
	const userIds = await resolveSegmentUserIds(parsed.data);
	return c.json({ recipientCount: userIds.length }, 200);
});

const createAnnouncementRoute = createRoute({
	operationId: "admin_create_announcement",
	method: "post",
	path: "/announcements",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						title: z.string().trim().min(1).max(200),
						message: z.string().trim().min(1).max(5000),
						href: z
							.string()
							.trim()
							.max(500)
							.refine(
								(value) => value.startsWith("/") || /^https:\/\//.test(value),
								{ message: "Use a dashboard path or an https URL" },
							)
							.optional(),
						segment: segmentSchema,
						sendEmail: z.boolean(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ announcement: announcementSchema }),
				},
			},
			description:
				"In-app notifications created for the segment; emails are delivered by the worker.",
		},
	},
});

adminAnnouncements.openapi(createAnnouncementRoute, async (c) => {
	const admin = c.get("user")!;
	const body = c.req.valid("json");
	const segment: AnnouncementSegment = {
		type: body.segment.type,
		...(body.segment.type === "all"
			? {}
			: { value: segmentValues(body.segment) }),
	};
	const userIds = await resolveSegmentUserIds(segment);

	const optOuts = await db
		.select({
			userId: tables.notificationPreference.userId,
			inApp: tables.notificationPreference.inApp,
			email: tables.notificationPreference.email,
		})
		.from(tables.notificationPreference)
		.where(eq(tables.notificationPreference.type, "announcement"));
	const preferenceByUser = new Map(optOuts.map((p) => [p.userId, p]));

	const [announcement] = await db
		.insert(tables.adminAnnouncement)
		.values({
			title: body.title,
			message: body.message,
			href: body.href ?? null,
			segment,
			recipientCount: 0,
			emailSent: body.sendEmail,
			createdBy: admin.id,
			createdByEmail: admin.email,
		})
		.returning();

	const rows = userIds.flatMap((userId) => {
		const preference = preferenceByUser.get(userId);
		const inApp = preference?.inApp ?? true;
		const email = body.sendEmail && (preference?.email ?? true);
		return inApp || email
			? [
					{
						userId,
						type: "announcement" as const,
						eventKey: `announcement:${announcement.id}`,
						title: body.title,
						message: body.message,
						href: body.href ?? "",
						inApp,
						email,
					},
				]
			: [];
	});
	for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
		await db
			.insert(tables.notification)
			.values(rows.slice(i, i + INSERT_BATCH_SIZE))
			.onConflictDoNothing();
	}

	const [updated] = await db
		.update(tables.adminAnnouncement)
		.set({ recipientCount: rows.length })
		.where(eq(tables.adminAnnouncement.id, announcement.id))
		.returning();

	return c.json(
		{
			announcement: {
				id: updated.id,
				title: updated.title,
				message: updated.message,
				href: updated.href,
				segment: updated.segment,
				recipientCount: updated.recipientCount,
				emailSent: updated.emailSent,
				createdAt: updated.createdAt.toISOString(),
				createdByEmail: updated.createdByEmail,
			},
		},
		200,
	);
});
