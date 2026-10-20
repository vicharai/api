import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { resolveProjectLimit } from "@/lib/project-limit.js";
import { resolveSeatLimit } from "@/lib/seat-limit.js";
import { resolveApiKeyLimit } from "@/routes/keys-api.js";

import { db, getPlatformConfig } from "@llmgateway/db";
import { isMappingAllowedByOrgProviderAccess } from "@llmgateway/shared";
import { isOrganizationAdmin } from "@llmgateway/shared/organization-roles";

import type { ServerTypes } from "@/vars.js";

/** Read-only account details for the customer dashboard. */
export const organizationAccount = new OpenAPIHono<ServerTypes>();

async function requireMembership(userId: string | undefined, orgId: string) {
	if (!userId) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}
	const membership = await db.query.userOrganization.findFirst({
		where: { userId: { eq: userId }, organizationId: { eq: orgId } },
		with: { organization: true },
	});
	if (
		!membership?.organization ||
		membership.organization.status === "deleted"
	) {
		throw new HTTPException(403, {
			message: "You do not have access to this organization",
		});
	}
	return { role: membership.role, organization: membership.organization };
}

const usageSchema = z.object({
	used: z.number(),
	limit: z.number(),
});

const getPlanUsage = createRoute({
	method: "get",
	path: "/{id}/plan-usage",
	request: { params: z.object({ id: z.string() }) },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						seats: usageSchema,
						apiKeys: usageSchema,
						projects: usageSchema,
					}),
				},
			},
			description: "Seats, API keys and projects used against plan limits.",
		},
	},
});

organizationAccount.openapi(getPlanUsage, async (c) => {
	const { id } = c.req.valid("param");
	const { role, organization } = await requireMembership(c.get("user")?.id, id);
	if (!isOrganizationAdmin(role)) {
		throw new HTTPException(403, {
			message: "Only organization owners and admins can view plan usage",
		});
	}

	const [members, projects, config] = await Promise.all([
		db.query.userOrganization.findMany({
			where: { organizationId: { eq: id } },
			columns: { id: true },
		}),
		db.query.project.findMany({
			where: { organizationId: { eq: id }, status: { ne: "deleted" } },
			columns: { id: true },
		}),
		getPlatformConfig(),
	]);
	// Same population the key-creation cap counts.
	const apiKeys =
		projects.length > 0
			? await db.query.apiKey.findMany({
					where: {
						projectId: { in: projects.map((project) => project.id) },
						status: { eq: "active" },
						keyType: { eq: "user" },
						kind: { ne: "playground" },
					},
					columns: { id: true },
				})
			: [];

	return c.json({
		seats: {
			used: members.length,
			limit: resolveSeatLimit(
				id,
				organization.plan,
				organization.seats,
				config,
			),
		},
		apiKeys: {
			used: apiKeys.length,
			limit: resolveApiKeyLimit(
				id,
				organization.plan,
				organization.apiKeyLimit,
				config,
			),
		},
		projects: {
			used: projects.length,
			limit: resolveProjectLimit(
				id,
				organization.plan,
				organization.projectLimit,
				config,
			),
		},
	});
});

const getProviderAccess = createRoute({
	method: "get",
	path: "/{id}/provider-access",
	request: { params: z.object({ id: z.string() }) },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						restricted: z.boolean(),
						// Catalogue model ids no route can serve for this workspace.
						unavailableModels: z.array(z.string()),
					}),
				},
			},
			description:
				"Models the workspace's provider access policy excludes entirely.",
		},
	},
});

// Expressed in models only: upstream provider identities stay internal.
organizationAccount.openapi(getProviderAccess, async (c) => {
	const { id } = c.req.valid("param");
	const { organization } = await requireMembership(c.get("user")?.id, id);
	const mode = organization.providerAccessMode;
	if (mode !== "allow" && mode !== "deny") {
		return c.json({ restricted: false, unavailableModels: [] });
	}
	const policy = {
		mode,
		providers: organization.providerAccessProviders,
		models: organization.providerAccessModels,
		mappings: organization.providerAccessMappings,
	};

	const now = new Date();
	const mappings = await db.query.modelProviderMapping.findMany({
		where: { status: { eq: "active" } },
		columns: { modelId: true, providerId: true, deactivatedAt: true },
	});
	const servable = new Map<string, boolean>();
	for (const mapping of mappings) {
		if (mapping.deactivatedAt && mapping.deactivatedAt <= now) {
			continue;
		}
		const allowed = isMappingAllowedByOrgProviderAccess(
			policy,
			mapping.providerId,
			mapping.modelId,
		);
		servable.set(
			mapping.modelId,
			(servable.get(mapping.modelId) ?? false) || allowed,
		);
	}

	return c.json({
		restricted: true,
		unavailableModels: [...servable]
			.filter(([, allowed]) => !allowed)
			.map(([modelId]) => modelId)
			.sort(),
	});
});

export default organizationAccount;
