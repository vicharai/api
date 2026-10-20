import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, eq, inArray, tables } from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

const ORG_ID = "test-org-id";
const MODEL_OPEN = "acct-spec-open-model";
const MODEL_BLOCKED = "acct-spec-blocked-model";
const PROVIDER_OPEN = "acct-spec-open-provider";
const PROVIDER_BLOCKED = "acct-spec-blocked-provider";

async function clearCatalogFixtures() {
	await db
		.delete(tables.model)
		.where(inArray(tables.model.id, [MODEL_OPEN, MODEL_BLOCKED]));
	await db
		.delete(tables.provider)
		.where(inArray(tables.provider.id, [PROVIDER_OPEN, PROVIDER_BLOCKED]));
}

describe("organization account routes", () => {
	let token: string;

	async function get(path: string) {
		return await app.request(path, { headers: { Cookie: token } });
	}

	beforeEach(async () => {
		token = await createTestUser();
		await db.insert(tables.organization).values({
			id: ORG_ID,
			name: "Test Organization",
			billingEmail: "test@example.com",
		});
		await db.insert(tables.userOrganization).values({
			userId: "test-user-id",
			organizationId: ORG_ID,
			role: "owner",
		});
	});

	afterEach(async () => {
		await clearCatalogFixtures();
		await deleteAll();
	});

	test("GET /orgs/{id}/plan-usage counts seats, active keys and projects", async () => {
		await db.insert(tables.project).values([
			{ id: "p-live", name: "Live", organizationId: ORG_ID },
			{
				id: "p-gone",
				name: "Gone",
				organizationId: ORG_ID,
				status: "deleted",
			},
		]);
		await db.insert(tables.apiKey).values([
			{
				id: "key-active",
				...hashApiKeyForStorage("acct-active-token"),
				projectId: "p-live",
				description: "Active",
				createdBy: "test-user-id",
			},
			{
				id: "key-inactive",
				...hashApiKeyForStorage("acct-inactive-token"),
				projectId: "p-live",
				description: "Inactive",
				createdBy: "test-user-id",
				status: "inactive",
			},
		]);
		await db
			.update(tables.organization)
			.set({ seats: 7, apiKeyLimit: 3, projectLimit: 4 })
			.where(eq(tables.organization.id, ORG_ID));

		const res = await get(`/orgs/${ORG_ID}/plan-usage`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			seats: { used: 1, limit: 7 },
			apiKeys: { used: 1, limit: 3 },
			projects: { used: 1, limit: 4 },
		});
	});

	test("GET /orgs/{id}/plan-usage is limited to owners and admins", async () => {
		await db
			.update(tables.userOrganization)
			.set({ role: "developer" })
			.where(eq(tables.userOrganization.organizationId, ORG_ID));

		expect((await get(`/orgs/${ORG_ID}/plan-usage`)).status).toBe(403);
	});

	test("GET /orgs/{id}/provider-access is unrestricted by default", async () => {
		const res = await get(`/orgs/${ORG_ID}/provider-access`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			restricted: false,
			unavailableModels: [],
		});
	});

	test("GET /orgs/{id}/provider-access reports models without an allowed route", async () => {
		await db.insert(tables.provider).values([
			{ id: PROVIDER_OPEN, name: "Open", description: "test" },
			{ id: PROVIDER_BLOCKED, name: "Blocked", description: "test" },
		]);
		await db.insert(tables.model).values([
			{ id: MODEL_OPEN, family: "test" },
			{ id: MODEL_BLOCKED, family: "test" },
		]);
		await db.insert(tables.modelProviderMapping).values([
			{
				modelId: MODEL_OPEN,
				providerId: PROVIDER_OPEN,
				externalId: MODEL_OPEN,
			},
			{
				modelId: MODEL_OPEN,
				providerId: PROVIDER_BLOCKED,
				externalId: MODEL_OPEN,
			},
			{
				modelId: MODEL_BLOCKED,
				providerId: PROVIDER_BLOCKED,
				externalId: MODEL_BLOCKED,
			},
		]);
		await db
			.update(tables.organization)
			.set({
				providerAccessMode: "deny",
				providerAccessProviders: [PROVIDER_BLOCKED],
				providerAccessReason: "internal note",
			})
			.where(eq(tables.organization.id, ORG_ID));

		const res = await get(`/orgs/${ORG_ID}/provider-access`);
		const body = (await res.json()) as {
			restricted: boolean;
			unavailableModels: string[];
		};

		expect(res.status).toBe(200);
		expect(body.restricted).toBe(true);
		expect(body.unavailableModels).toContain(MODEL_BLOCKED);
		expect(body.unavailableModels).not.toContain(MODEL_OPEN);
		expect(JSON.stringify(body)).not.toContain(PROVIDER_BLOCKED);
		expect(JSON.stringify(body)).not.toContain("internal note");
	});

	test("GET /orgs/{id}/provider-access rejects non-members", async () => {
		await db
			.delete(tables.userOrganization)
			.where(eq(tables.userOrganization.organizationId, ORG_ID));

		expect((await get(`/orgs/${ORG_ID}/provider-access`)).status).toBe(403);
	});

	test("GET /orgs/{id}/discounts hides the admin reason and provider", async () => {
		await db.insert(tables.discount).values([
			{
				organizationId: ORG_ID,
				provider: "acct-secret-provider",
				model: "gpt-4o",
				discountPercent: "0.2",
				reason: "negotiated internally",
			},
			{
				organizationId: ORG_ID,
				model: null,
				discountPercent: "0.1",
				expiresAt: new Date(Date.now() - 60_000),
			},
		]);

		const res = await get(`/orgs/${ORG_ID}/discounts`);
		const body = (await res.json()) as {
			orgDiscounts: Record<string, unknown>[];
		};

		expect(res.status).toBe(200);
		expect(body.orgDiscounts).toHaveLength(1);
		expect(body.orgDiscounts[0]).toMatchObject({
			model: "gpt-4o",
			providerScoped: true,
			discountPercent: "0.2",
		});
		expect(JSON.stringify(body)).not.toContain("acct-secret-provider");
		expect(JSON.stringify(body)).not.toContain("negotiated internally");
	});
});
