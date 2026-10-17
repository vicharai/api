import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, eq, tables } from "@llmgateway/db";

import type * as LlmGatewayDb from "@llmgateway/db";

const { invalidateSpy } = vi.hoisted(() => ({ invalidateSpy: vi.fn() }));

vi.mock("@llmgateway/db", async (importOriginal) => {
	const actual = await importOriginal<typeof LlmGatewayDb>();
	return {
		...actual,
		invalidateOrganizationsCache: async (ids: string[]) => {
			invalidateSpy(ids);
			await actual.invalidateOrganizationsCache(ids);
		},
	};
});

const originalAdminEmails = process.env.ADMIN_EMAILS;
const ORG_ID = "provider-access-org";
const PATH = `/admin/organizations/${ORG_ID}/provider-access`;

describe("admin organization provider access", () => {
	let cookie: string;

	async function put(body: unknown, path = PATH) {
		return await app.request(path, {
			method: "PUT",
			headers: { Cookie: cookie, "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		invalidateSpy.mockClear();
		await db.insert(tables.organization).values({
			id: ORG_ID,
			name: "Provider Access Org",
			billingEmail: "access@test.example",
		});
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await deleteAll();
	});

	it("rejects non-admins", async () => {
		process.env.ADMIN_EMAILS = "someone-else@example.com";
		const res = await app.request(PATH, { headers: { Cookie: cookie } });
		expect(res.status).toBe(403);
		expect(
			(await put({ mode: "none", providers: [], models: [], mappings: [] }))
				.status,
		).toBe(403);
	});

	it("defaults to no policy", async () => {
		const res = await app.request(PATH, { headers: { Cookie: cookie } });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			mode: "none",
			providers: [],
			models: [],
			mappings: [],
			reason: null,
		});
	});

	it("stores the policy, invalidates the org cache and audits", async () => {
		const res = await put({
			mode: "deny",
			providers: ["deepseek", "deepseek", " moonshot "],
			models: ["gpt-4o"],
			mappings: ["openai/gpt-4o-mini"],
			reason: "Customer contract excludes these vendors",
		});
		expect(res.status).toBe(200);
		const expected = {
			mode: "deny",
			providers: ["deepseek", "moonshot"],
			models: ["gpt-4o"],
			mappings: ["openai/gpt-4o-mini"],
			reason: "Customer contract excludes these vendors",
		};
		expect(await res.json()).toEqual(expected);

		const org = await db.query.organization.findFirst({
			where: { id: { eq: ORG_ID } },
		});
		expect(org).toMatchObject({
			providerAccessMode: "deny",
			providerAccessProviders: ["deepseek", "moonshot"],
			providerAccessModels: ["gpt-4o"],
			providerAccessMappings: ["openai/gpt-4o-mini"],
			providerAccessReason: "Customer contract excludes these vendors",
		});
		expect(invalidateSpy).toHaveBeenCalledWith([ORG_ID]);

		const audit = await db
			.select()
			.from(tables.auditLog)
			.where(eq(tables.auditLog.organizationId, ORG_ID));
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({
			action: "organization.update",
			resourceType: "organization",
			resourceId: ORG_ID,
			userId: "test-user-id",
		});
		expect(audit[0].metadata?.changes).toMatchObject({
			providerAccess: { new: expected },
		});

		const get = await app.request(PATH, { headers: { Cookie: cookie } });
		expect(await get.json()).toEqual(expected);

		const cleared = await put({
			mode: "none",
			providers: [],
			models: [],
			mappings: [],
		});
		expect((await cleared.json()).reason).toBeNull();
	});

	it("rejects an allow policy that admits nothing", async () => {
		const res = await put({
			mode: "allow",
			providers: [],
			models: [],
			mappings: [],
		});
		expect(res.status).toBe(400);
		expect(invalidateSpy).not.toHaveBeenCalled();
	});

	it("rejects malformed mappings", async () => {
		const res = await put({
			mode: "deny",
			providers: [],
			models: [],
			mappings: ["gpt-4o"],
		});
		expect(res.status).toBe(400);
	});

	it("returns 404 for unknown or deleted organizations", async () => {
		const missing = await put(
			{ mode: "none", providers: [], models: [], mappings: [] },
			"/admin/organizations/does-not-exist/provider-access",
		);
		expect(missing.status).toBe(404);

		await db
			.update(tables.organization)
			.set({ status: "deleted" })
			.where(eq(tables.organization.id, ORG_ID));
		const deleted = await app.request(PATH, { headers: { Cookie: cookie } });
		expect(deleted.status).toBe(404);
	});
});
