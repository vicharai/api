import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import {
	adminMiddleware,
	getAdminEmails,
	isAdminEmail,
} from "@/middleware/admin.js";

import {
	adminRoles,
	and,
	asc,
	db,
	eq,
	inArray,
	sql,
	tables,
} from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const adminTeam = new OpenAPIHono<ServerTypes>();

adminTeam.use("/*", adminMiddleware);

const memberSchema = z.object({
	userId: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	role: z.enum(adminRoles),
	isOwner: z.boolean(),
	createdAt: z.string().nullable(),
});

type TeamMember = z.infer<typeof memberSchema>;

function isOwner(user: { email: string; emailVerified: boolean }): boolean {
	return user.emailVerified && isAdminEmail(user.email);
}

async function findMember(userId: string): Promise<TeamMember | null> {
	const [row] = await db
		.select({
			userId: tables.adminMember.userId,
			role: tables.adminMember.role,
			createdAt: tables.adminMember.createdAt,
			email: tables.user.email,
			name: tables.user.name,
		})
		.from(tables.adminMember)
		.innerJoin(tables.user, eq(tables.adminMember.userId, tables.user.id))
		.where(eq(tables.adminMember.userId, userId))
		.limit(1);
	if (!row) {
		return null;
	}
	return {
		userId: row.userId,
		email: row.email,
		name: row.name,
		role: row.role,
		isOwner: false,
		createdAt: row.createdAt.toISOString(),
	};
}

async function assertNotOwner(userId: string): Promise<void> {
	const user = await db.query.user.findFirst({
		where: { id: { eq: userId } },
		columns: { email: true, emailVerified: true },
	});
	if (user && isOwner(user)) {
		throw new HTTPException(400, {
			message: "Owners come from ADMIN_EMAILS and cannot be changed here",
		});
	}
}

const listTeamRoute = createRoute({
	operationId: "admin_list_team",
	method: "get",
	path: "/team",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ members: z.array(memberSchema) }),
				},
			},
			description: "Owners (from ADMIN_EMAILS) first, then granted members.",
		},
	},
});

adminTeam.openapi(listTeamRoute, async (c) => {
	const ownerEmails = getAdminEmails();
	const [owners, granted] = await Promise.all([
		ownerEmails.length
			? db
					.select({
						userId: tables.user.id,
						email: tables.user.email,
						name: tables.user.name,
					})
					.from(tables.user)
					.where(
						and(
							inArray(sql`lower(${tables.user.email})`, ownerEmails),
							eq(tables.user.emailVerified, true),
						),
					)
					.orderBy(asc(tables.user.email))
			: [],
		db
			.select({
				userId: tables.adminMember.userId,
				role: tables.adminMember.role,
				createdAt: tables.adminMember.createdAt,
				email: tables.user.email,
				name: tables.user.name,
			})
			.from(tables.adminMember)
			.innerJoin(tables.user, eq(tables.adminMember.userId, tables.user.id))
			.orderBy(asc(tables.adminMember.createdAt)),
	]);

	const ownerIds = new Set(owners.map((o) => o.userId));
	const members: TeamMember[] = [
		...owners.map((o) => ({
			...o,
			role: "admin" as const,
			isOwner: true,
			createdAt: null,
		})),
		...granted
			.filter((m) => !ownerIds.has(m.userId))
			.map((m) => ({
				userId: m.userId,
				email: m.email,
				name: m.name,
				role: m.role,
				isOwner: false,
				createdAt: m.createdAt.toISOString(),
			})),
	];

	return c.json({ members });
});

const grantRoute = createRoute({
	operationId: "admin_grant_team_role",
	method: "post",
	path: "/team",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						email: z.string().trim().email(),
						role: z.enum(adminRoles),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ member: memberSchema }) },
			},
			description: "Role granted (or changed if already granted).",
		},
		400: { description: "The user's email is not verified." },
		404: { description: "No user with that email." },
		409: { description: "The user is an owner." },
	},
});

adminTeam.openapi(grantRoute, async (c) => {
	const admin = c.get("user")!;
	const { email, role } = c.req.valid("json");

	const [user] = await db
		.select({
			id: tables.user.id,
			email: tables.user.email,
			emailVerified: tables.user.emailVerified,
		})
		.from(tables.user)
		.where(sql`lower(${tables.user.email}) = ${email.toLowerCase()}`)
		.limit(1);
	if (!user) {
		throw new HTTPException(404, { message: "No user with that email" });
	}
	if (isOwner(user)) {
		throw new HTTPException(409, {
			message: "This user is already an owner via ADMIN_EMAILS",
		});
	}
	if (!user.emailVerified) {
		throw new HTTPException(400, {
			message: "The user must verify their email first",
		});
	}

	await db
		.insert(tables.adminMember)
		.values({ userId: user.id, role, createdBy: admin.id })
		.onConflictDoUpdate({
			target: tables.adminMember.userId,
			set: { role },
		});

	return c.json({ member: (await findMember(user.id))! });
});

const updateRoute = createRoute({
	operationId: "admin_update_team_role",
	method: "patch",
	path: "/team/{userId}",
	request: {
		params: z.object({ userId: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({ role: z.enum(adminRoles) }),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ member: memberSchema }) },
			},
			description: "Role changed.",
		},
		400: { description: "Owners cannot be changed." },
		404: { description: "Not a team member." },
	},
});

adminTeam.openapi(updateRoute, async (c) => {
	const { userId } = c.req.valid("param");
	const { role } = c.req.valid("json");
	await assertNotOwner(userId);

	const updated = await db
		.update(tables.adminMember)
		.set({ role })
		.where(eq(tables.adminMember.userId, userId))
		.returning({ userId: tables.adminMember.userId });
	if (updated.length === 0) {
		throw new HTTPException(404, { message: "Not a team member" });
	}

	return c.json({ member: (await findMember(userId))! });
});

const removeRoute = createRoute({
	operationId: "admin_remove_team_member",
	method: "delete",
	path: "/team/{userId}",
	request: { params: z.object({ userId: z.string() }) },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ success: z.literal(true) }),
				},
			},
			description: "Admin access revoked.",
		},
		400: { description: "Owners cannot be removed." },
		404: { description: "Not a team member." },
	},
});

adminTeam.openapi(removeRoute, async (c) => {
	const { userId } = c.req.valid("param");
	await assertNotOwner(userId);

	const deleted = await db
		.delete(tables.adminMember)
		.where(eq(tables.adminMember.userId, userId))
		.returning({ userId: tables.adminMember.userId });
	if (deleted.length === 0) {
		throw new HTTPException(404, { message: "Not a team member" });
	}

	return c.json({ success: true as const });
});
