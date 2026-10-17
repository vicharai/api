import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { logAuditEvent } from "@vichar/audit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { apiAuth, deleteResendContact } from "@/auth/config.js";
import { tearDownSoleMemberOrganizations } from "@/lib/account-deletion.js";
import { isUserHighRisk } from "@/lib/account-risk.js";
import { adminMiddleware, isAdminEmail } from "@/middleware/admin.js";
import { createApiKeyForProject } from "@/routes/keys-api.js";

import {
	and,
	asc,
	db,
	eq,
	invalidateOrganizationsCache,
	ne,
	sql,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

import type { ServerTypes } from "@/vars.js";

export const adminUserManagement = new OpenAPIHono<ServerTypes>();

adminUserManagement.use("/*", adminMiddleware);

const successSchema = z.object({ success: z.literal(true) });
const memberRoleSchema = z.enum([
	"owner",
	"admin",
	"project_admin",
	"developer",
]);
const userParams = z.object({ userId: z.string() });
const memberParams = z.object({ orgId: z.string(), userId: z.string() });

const json = <T extends z.ZodTypeAny>(schema: T) => ({
	content: { "application/json": { schema } },
});

async function findUserOrThrow(userId: string) {
	const user = await db.query.user.findFirst({
		where: { id: { eq: userId } },
	});
	if (!user) {
		throw new HTTPException(404, { message: "User not found" });
	}
	return user;
}

async function isAdminUser(user: { id: string; email: string }) {
	if (isAdminEmail(user.email)) {
		return true;
	}
	const member = await db.query.adminMember.findFirst({
		where: { userId: { eq: user.id } },
		columns: { userId: true },
	});
	return member !== undefined;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const changeEmailRoute = createRoute({
	operationId: "admin_change_user_email",
	method: "patch",
	path: "/users/{userId}/email",
	request: {
		params: userParams,
		body: json(
			z.object({
				email: z.string().trim().toLowerCase().email(),
				markVerified: z.boolean().optional(),
			}),
		),
	},
	responses: {
		200: {
			...json(
				z.object({
					user: z.object({
						id: z.string(),
						email: z.string(),
						emailVerified: z.boolean(),
					}),
				}),
			),
			description: "Email changed. It stays unverified unless markVerified.",
		},
		400: { description: "Target is an admin." },
		409: { description: "Email already in use." },
	},
});

adminUserManagement.openapi(changeEmailRoute, async (c) => {
	const { userId } = c.req.valid("param");
	const { email, markVerified } = c.req.valid("json");
	const target = await findUserOrThrow(userId);
	if (await isAdminUser(target)) {
		throw new HTTPException(400, {
			message: "Admin emails cannot be changed from the admin panel",
		});
	}
	const taken = await db.query.user.findFirst({
		where: { email: { eq: email }, id: { ne: userId } },
		columns: { id: true },
	});
	if (taken) {
		throw new HTTPException(409, { message: "Email already in use" });
	}
	const [updated] = await db
		.update(tables.user)
		.set({ email, emailVerified: markVerified ?? false })
		.where(eq(tables.user.id, userId))
		.returning({
			id: tables.user.id,
			email: tables.user.email,
			emailVerified: tables.user.emailVerified,
		});
	return c.json({ user: updated }, 200);
});

const passwordResetRoute = createRoute({
	operationId: "admin_send_password_reset",
	method: "post",
	path: "/users/{userId}/password-reset",
	request: { params: userParams },
	responses: {
		200: {
			...json(z.object({ sent: z.literal(true) })),
			description: "Password reset email sent to the user.",
		},
	},
});

adminUserManagement.openapi(passwordResetRoute, async (c) => {
	const { userId } = c.req.valid("param");
	const target = await findUserOrThrow(userId);
	await apiAuth.api.requestPasswordReset({
		body: {
			email: target.email,
			redirectTo: `${process.env.UI_URL ?? "http://localhost:3002"}/reset-password`,
		},
	});
	return c.json({ sent: true as const }, 200);
});

const removePasskeysRoute = createRoute({
	operationId: "admin_remove_user_passkeys",
	method: "delete",
	path: "/users/{userId}/passkeys",
	request: { params: userParams },
	responses: {
		200: {
			...json(z.object({ deleted: z.number() })),
			description: "Passkeys removed.",
		},
	},
});

adminUserManagement.openapi(removePasskeysRoute, async (c) => {
	const { userId } = c.req.valid("param");
	await findUserOrThrow(userId);
	const deleted = await db
		.delete(tables.passkey)
		.where(eq(tables.passkey.userId, userId))
		.returning({ id: tables.passkey.id });
	return c.json({ deleted: deleted.length }, 200);
});

const deleteUserRoute = createRoute({
	operationId: "admin_delete_user",
	method: "delete",
	path: "/users/{userId}",
	request: {
		params: userParams,
		body: json(z.object({ reason: z.string().trim().min(1).max(500) })),
	},
	responses: {
		200: {
			...json(successSchema),
			description:
				"User deleted; organizations they were the last member of are closed and their subscriptions cancelled.",
		},
		400: { description: "Target is the caller or an admin." },
	},
});

adminUserManagement.openapi(deleteUserRoute, async (c) => {
	const admin = c.get("user")!;
	const { userId } = c.req.valid("param");
	const { reason } = c.req.valid("json");
	if (userId === admin.id) {
		throw new HTTPException(400, { message: "You cannot delete yourself" });
	}
	const target = await findUserOrThrow(userId);
	if (await isAdminUser(target)) {
		throw new HTTPException(400, {
			message: "Admins cannot be deleted. Remove their admin role first.",
		});
	}
	const closed = await tearDownSoleMemberOrganizations(userId);
	await db.delete(tables.user).where(eq(tables.user.id, userId));
	if (closed.length > 0) {
		await invalidateOrganizationsCache(closed.map((org) => org.id));
	}
	await deleteResendContact(target.email);
	logger.info("Admin deleted user", {
		userId,
		adminUserId: admin.id,
		reason,
		closedOrganizations: closed.length,
	});
	return c.json({ success: true as const }, 200);
});

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

async function findMembership(orgId: string, userId: string) {
	const membership = await db.query.userOrganization.findFirst({
		where: { organizationId: { eq: orgId }, userId: { eq: userId } },
	});
	if (!membership) {
		throw new HTTPException(404, { message: "Member not found" });
	}
	return membership;
}

async function assertNotLastOwner(orgId: string, userId: string) {
	const [row] = await db
		.select({ count: sql<number>`COUNT(*)::int` })
		.from(tables.userOrganization)
		.where(
			and(
				eq(tables.userOrganization.organizationId, orgId),
				eq(tables.userOrganization.role, "owner"),
				ne(tables.userOrganization.userId, userId),
			),
		);
	if (Number(row?.count ?? 0) === 0) {
		throw new HTTPException(400, {
			message: "An organization must keep at least one owner",
		});
	}
}

const updateMemberRoute = createRoute({
	operationId: "admin_update_organization_member",
	method: "patch",
	path: "/organizations/{orgId}/members/{userId}",
	request: {
		params: memberParams,
		body: json(z.object({ role: memberRoleSchema })),
	},
	responses: {
		200: {
			...json(
				z.object({
					member: z.object({ userId: z.string(), role: memberRoleSchema }),
				}),
			),
			description:
				"Role changed. Project grants of project-scoped roles are managed in the dashboard.",
		},
		400: { description: "Would leave the organization without an owner." },
		404: { description: "Member not found." },
	},
});

adminUserManagement.openapi(updateMemberRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId, userId } = c.req.valid("param");
	const { role } = c.req.valid("json");
	const membership = await findMembership(orgId, userId);
	if (membership.role === "owner" && role !== "owner") {
		await assertNotLastOwner(orgId, userId);
	}
	await db
		.update(tables.userOrganization)
		.set({
			role,
			...(role === "developer"
				? {}
				: { teamId: null, teamAssignmentSource: "manual" as const }),
		})
		.where(eq(tables.userOrganization.id, membership.id));
	if (membership.role !== role) {
		await logAuditEvent({
			organizationId: orgId,
			userId: admin.id,
			action: "team_member.update",
			resourceType: "team_member",
			resourceId: membership.id,
			metadata: {
				targetUserId: userId,
				source: "admin",
				changes: { role: { old: membership.role, new: role } },
			},
		});
	}
	return c.json({ member: { userId, role } }, 200);
});

const removeMemberRoute = createRoute({
	operationId: "admin_remove_organization_member",
	method: "delete",
	path: "/organizations/{orgId}/members/{userId}",
	request: { params: memberParams },
	responses: {
		200: { ...json(successSchema), description: "Member removed." },
		400: { description: "Would leave the organization without an owner." },
		404: { description: "Member not found." },
	},
});

adminUserManagement.openapi(removeMemberRoute, async (c) => {
	const admin = c.get("user")!;
	const { orgId, userId } = c.req.valid("param");
	const membership = await findMembership(orgId, userId);
	if (membership.role === "owner") {
		await assertNotLastOwner(orgId, userId);
	}
	await db
		.delete(tables.userOrganization)
		.where(eq(tables.userOrganization.id, membership.id));
	await logAuditEvent({
		organizationId: orgId,
		userId: admin.id,
		action: "team_member.remove",
		resourceType: "team_member",
		resourceId: membership.id,
		metadata: { targetUserId: userId, role: membership.role, source: "admin" },
	});
	return c.json({ success: true as const }, 200);
});

const createOrganizationRoute = createRoute({
	operationId: "admin_create_organization",
	method: "post",
	path: "/organizations",
	request: {
		body: json(
			z.object({
				name: z.string().trim().min(1).max(255),
				ownerEmail: z.string().trim().toLowerCase().email(),
				billingEmail: z.string().trim().email().optional(),
			}),
		),
	},
	responses: {
		200: {
			...json(
				z.object({
					organization: z.object({ id: z.string(), name: z.string() }),
				}),
			),
			description: "Organization created with the user as owner.",
		},
		404: { description: "Owner user not found." },
	},
});

adminUserManagement.openapi(createOrganizationRoute, async (c) => {
	const admin = c.get("user")!;
	const { name, ownerEmail, billingEmail } = c.req.valid("json");
	const owner = await db.query.user.findFirst({
		where: { email: { eq: ownerEmail } },
		columns: { id: true, email: true },
	});
	if (!owner) {
		throw new HTTPException(404, {
			message: "No user with that email. They must sign up first.",
		});
	}
	const riskFlagged = await isUserHighRisk(owner.id);
	const organization = await db.transaction(async (tx) => {
		const [org] = await tx
			.insert(tables.organization)
			.values({
				name,
				billingEmail: billingEmail ?? owner.email,
				riskFlagged,
			})
			.returning({
				id: tables.organization.id,
				name: tables.organization.name,
			});
		await tx.insert(tables.userOrganization).values({
			userId: owner.id,
			organizationId: org.id,
			role: "owner",
		});
		await tx.insert(tables.project).values({
			name: "Default Project",
			organizationId: org.id,
			mode: "hybrid",
		});
		return org;
	});
	await logAuditEvent({
		organizationId: organization.id,
		userId: admin.id,
		action: "organization.create",
		resourceType: "organization",
		resourceId: organization.id,
		metadata: { resourceName: name, source: "admin", ownerUserId: owner.id },
	});
	return c.json({ organization }, 200);
});

const createApiKeyRoute = createRoute({
	operationId: "admin_create_organization_api_key",
	method: "post",
	path: "/organizations/{orgId}/api-keys",
	request: {
		params: z.object({ orgId: z.string() }),
		body: json(
			z.object({
				projectId: z.string().optional(),
				description: z.string().trim().min(1).max(255),
				usageLimit: z
					.string()
					.regex(/^\d+(\.\d+)?$/, "Must be a non-negative amount")
					.nullable()
					.optional(),
			}),
		),
	},
	responses: {
		200: {
			...json(
				z.object({
					apiKey: z.object({
						id: z.string(),
						token: z.string().openapi({ description: "Shown only once." }),
						description: z.string(),
						projectId: z.string(),
					}),
				}),
			),
			description:
				"API key created on behalf of the organization's first owner (keys must belong to a member).",
		},
		400: { description: "Organization has no owner or the key limit is hit." },
		404: { description: "Organization or project not found." },
	},
});

adminUserManagement.openapi(createApiKeyRoute, async (c) => {
	const { orgId } = c.req.valid("param");
	const { projectId, description, usageLimit } = c.req.valid("json");
	const org = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
		columns: { id: true, status: true },
	});
	if (!org || org.status === "deleted") {
		throw new HTTPException(404, { message: "Organization not found" });
	}
	const [project] = await db
		.select({ id: tables.project.id })
		.from(tables.project)
		.where(
			and(
				eq(tables.project.organizationId, orgId),
				ne(tables.project.status, "deleted"),
				projectId ? eq(tables.project.id, projectId) : undefined,
			),
		)
		.orderBy(asc(tables.project.createdAt))
		.limit(1);
	if (!project) {
		throw new HTTPException(404, { message: "Project not found" });
	}
	const [owner] = await db
		.select({ userId: tables.userOrganization.userId })
		.from(tables.userOrganization)
		.where(
			and(
				eq(tables.userOrganization.organizationId, orgId),
				eq(tables.userOrganization.role, "owner"),
			),
		)
		.orderBy(asc(tables.userOrganization.createdAt))
		.limit(1);
	if (!owner) {
		throw new HTTPException(400, {
			message: "The organization has no owner to own the key",
		});
	}
	const { apiKey, token } = await createApiKeyForProject(
		project.id,
		owner.userId,
		{ description, usageLimit: usageLimit ?? null },
		{ skipAccessCheck: true },
	);
	return c.json(
		{
			apiKey: {
				id: apiKey.id,
				token,
				description: apiKey.description,
				projectId: apiKey.projectId,
			},
		},
		200,
	);
});
