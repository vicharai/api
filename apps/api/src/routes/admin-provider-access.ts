import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { logAuditEvent } from "@vichar/audit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { adminMiddleware } from "@/middleware/admin.js";

import { db, eq, invalidateOrganizationsCache, tables } from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const adminProviderAccess = new OpenAPIHono<ServerTypes>();

adminProviderAccess.use("/*", adminMiddleware);

const idListSchema = z
	.array(z.string().trim().min(1).max(200))
	.max(500)
	.transform((values) => Array.from(new Set(values)));

const providerAccessSchema = z.object({
	mode: z.enum(["none", "allow", "deny"]),
	providers: idListSchema,
	models: idListSchema,
	mappings: z
		.array(
			z
				.string()
				.trim()
				.regex(/^[^/\s]+\/\S+$/, "Mappings must look like provider/model"),
		)
		.max(500)
		.transform((values) => Array.from(new Set(values))),
	reason: z.string().trim().max(1000).nullable(),
});

const providerAccessBodySchema = providerAccessSchema
	.extend({ reason: providerAccessSchema.shape.reason.optional() })
	.refine(
		(body) =>
			body.mode !== "allow" ||
			body.providers.length + body.models.length + body.mappings.length > 0,
		{
			message:
				"Allow mode needs at least one provider, model or mapping, otherwise every request is blocked",
			path: ["mode"],
		},
	);

const orgParamsSchema = z.object({ orgId: z.string() });

const errorSchema = z.object({ message: z.string() });

type ProviderAccess = z.infer<typeof providerAccessSchema>;

function toProviderAccess(
	org: Pick<
		typeof tables.organization.$inferSelect,
		| "providerAccessMode"
		| "providerAccessProviders"
		| "providerAccessModels"
		| "providerAccessMappings"
		| "providerAccessReason"
	>,
): ProviderAccess {
	return {
		mode: org.providerAccessMode,
		providers: org.providerAccessProviders,
		models: org.providerAccessModels,
		mappings: org.providerAccessMappings,
		reason: org.providerAccessReason,
	};
}

async function findActiveOrganization(orgId: string) {
	const org = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
	});
	if (!org || org.status === "deleted") {
		throw new HTTPException(404, { message: "Organization not found" });
	}
	return org;
}

const getProviderAccess = createRoute({
	operationId: "admin_get_organization_provider_access",
	method: "get",
	path: "/organizations/{orgId}/provider-access",
	request: { params: orgParamsSchema },
	responses: {
		200: {
			content: { "application/json": { schema: providerAccessSchema } },
			description: "The organization's operator-set provider access policy.",
		},
		404: {
			content: { "application/json": { schema: errorSchema } },
			description: "Organization not found.",
		},
	},
});

adminProviderAccess.openapi(getProviderAccess, async (c) => {
	const { orgId } = c.req.valid("param");
	const org = await findActiveOrganization(orgId);
	return c.json(toProviderAccess(org), 200);
});

const putProviderAccess = createRoute({
	operationId: "admin_update_organization_provider_access",
	method: "put",
	path: "/organizations/{orgId}/provider-access",
	request: {
		params: orgParamsSchema,
		body: {
			content: { "application/json": { schema: providerAccessBodySchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: providerAccessSchema } },
			description: "Updated provider access policy.",
		},
		404: {
			content: { "application/json": { schema: errorSchema } },
			description: "Organization not found.",
		},
	},
});

adminProviderAccess.openapi(putProviderAccess, async (c) => {
	const user = c.get("user");
	const { orgId } = c.req.valid("param");
	const body = c.req.valid("json");
	const org = await findActiveOrganization(orgId);

	const next: ProviderAccess = {
		mode: body.mode,
		providers: body.providers,
		models: body.models,
		mappings: body.mappings,
		reason: body.reason || null,
	};

	const [updated] = await db
		.update(tables.organization)
		.set({
			providerAccessMode: next.mode,
			providerAccessProviders: next.providers,
			providerAccessModels: next.models,
			providerAccessMappings: next.mappings,
			providerAccessReason: next.reason,
		})
		.where(eq(tables.organization.id, orgId))
		.returning();

	await invalidateOrganizationsCache([orgId]);

	await logAuditEvent({
		organizationId: orgId,
		userId: user!.id,
		action: "organization.update",
		resourceType: "organization",
		resourceId: orgId,
		metadata: {
			resourceName: org.name,
			source: "admin",
			changes: {
				providerAccess: { old: toProviderAccess(org), new: next },
			},
		},
	});

	return c.json(toProviderAccess(updated), 200);
});
