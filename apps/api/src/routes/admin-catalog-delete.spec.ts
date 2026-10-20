import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { and, db, eq, inArray, tables } from "@llmgateway/db";

const PROVIDER_ID = "acme-delete";
const MODEL_ID = "acme-delete-1";
const PASSWORD_HASH =
	"c11ef27a7f9264be08db228ebb650888:a4d985a9c6bd98608237fd507534424950aa7fc255930d972242b81cbe78594f8568feb0d067e95ddf7be242ad3e9d013f695f4414fce68bfff091079f1dc460";

interface Listed {
	id: string;
	deleted: boolean;
	deletedAt: string | null;
	deletedByEmail: string | null;
	deletionReason: string | null;
}

async function request(
	cookie: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<Response> {
	return await app.request(`/admin/catalog${path}`, {
		method,
		headers: {
			Cookie: cookie,
			...(body === undefined ? {} : { "Content-Type": "application/json" }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

describe("admin catalog deletion", () => {
	let cookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
	});

	afterEach(async () => {
		await db
			.delete(tables.modelProviderMapping)
			.where(eq(tables.modelProviderMapping.modelId, MODEL_ID));
		await db.delete(tables.model).where(eq(tables.model.id, MODEL_ID));
		await deleteAll();
		await db.delete(tables.provider).where(eq(tables.provider.id, PROVIDER_ID));
	});

	const call = (method: string, path: string, body?: unknown) =>
		request(cookie, method, path, body);

	async function list(
		kind: "models" | "providers",
		deleted?: string,
	): Promise<Listed[]> {
		const res = await call(
			"GET",
			`/${kind}${deleted ? `?deleted=${deleted}` : ""}`,
		);
		expect(res.status).toBe(200);
		const json = (await res.json()) as Record<string, Listed[]>;
		return json[kind];
	}

	async function createManagedModel() {
		expect(
			(
				await call("POST", "/providers", {
					id: PROVIDER_ID,
					name: "Acme Delete",
					baseUrl: "https://api.acme-delete.example.com",
					apiKey: "sk-acme-delete-key",
				})
			).status,
		).toBe(201);
		expect(
			(
				await call("POST", "/models", {
					id: MODEL_ID,
					name: "Acme Delete 1",
					family: "acme",
					output: "text",
					mappings: [
						{
							providerId: PROVIDER_ID,
							externalId: "acme-upstream",
							inputPrice: "1e-6",
							outputPrice: "2e-6",
							streaming: true,
						},
					],
				})
			).status,
		).toBe(201);
	}

	async function mappingStatuses() {
		const rows = await db.query.modelProviderMapping.findMany({
			where: { modelId: { eq: MODEL_ID } },
		});
		return rows.map((row) => row.status);
	}

	test("soft-deletes and restores a built-in model", async () => {
		const res = await call("DELETE", "/models/gpt-4o", {
			reason: "retired upstream",
		});
		expect(res.status).toBe(200);

		expect((await list("models")).some((m) => m.id === "gpt-4o")).toBe(false);
		const [deleted] = (await list("models", "only")).filter(
			(m) => m.id === "gpt-4o",
		);
		expect(deleted).toMatchObject({
			deleted: true,
			deletedByEmail: "admin@example.com",
			deletionReason: "retired upstream",
		});
		expect(deleted?.deletedAt).toBeTruthy();
		expect((await list("models", "only")).every((m) => m.deleted)).toBe(true);
		const included = await list("models", "include");
		expect(included.some((m) => m.id === "gpt-4o" && m.deleted)).toBe(true);
		expect(included.some((m) => !m.deleted)).toBe(true);

		expect((await call("DELETE", "/models/gpt-4o", {})).status).toBe(409);
		expect((await call("POST", "/models/gpt-4o/restore")).status).toBe(200);
		expect((await call("POST", "/models/gpt-4o/restore")).status).toBe(409);
		expect((await list("models")).some((m) => m.id === "gpt-4o")).toBe(true);

		const logged = await db.query.adminActionLog.findMany({
			where: { path: { eq: "/admin/catalog/models/gpt-4o" } },
		});
		expect(logged.some((row) => row.method === "DELETE")).toBe(true);
	});

	test("deleting a managed model deactivates its mappings until restored", async () => {
		await createManagedModel();
		expect(await mappingStatuses()).toEqual(["active"]);

		expect((await call("DELETE", `/models/${MODEL_ID}`, {})).status).toBe(200);
		expect(await mappingStatuses()).toEqual(["inactive"]);

		expect((await call("POST", `/models/${MODEL_ID}/restore`)).status).toBe(
			200,
		);
		expect(await mappingStatuses()).toEqual(["active"]);
	});

	test("refuses reserved and unknown model ids", async () => {
		expect((await call("DELETE", "/models/auto", {})).status).toBe(400);
		expect((await call("DELETE", "/models/no-such-model", {})).status).toBe(
			404,
		);
	});

	test("bulk deletes and restores models", async () => {
		await createManagedModel();
		const res = await call("POST", "/models/bulk-delete", {
			ids: ["gpt-4o", MODEL_ID, "auto", "no-such-model", "gpt-4o"],
			reason: "cleanup",
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			deleted: string[];
			skipped: { id: string; reason: string }[];
		};
		expect(body.deleted.sort()).toEqual([MODEL_ID, "gpt-4o"].sort());
		expect(body.skipped).toEqual([
			{ id: "auto", reason: "reserved id" },
			{ id: "no-such-model", reason: "unknown model" },
		]);
		expect(await mappingStatuses()).toEqual(["inactive"]);

		const again = (await (
			await call("POST", "/models/bulk-delete", { ids: ["gpt-4o"] })
		).json()) as { deleted: string[]; skipped: { reason: string }[] };
		expect(again.deleted).toEqual([]);
		expect(again.skipped).toEqual([
			{ id: "gpt-4o", reason: "already deleted" },
		]);

		const restored = (await (
			await call("POST", "/models/bulk-restore", {
				ids: ["gpt-4o", MODEL_ID, "gpt-4o-mini"],
			})
		).json()) as { restored: string[]; skipped: { id: string }[] };
		expect(restored.restored.sort()).toEqual([MODEL_ID, "gpt-4o"].sort());
		expect(restored.skipped).toEqual([
			{ id: "gpt-4o-mini", reason: "not deleted" },
		]);
		expect(await mappingStatuses()).toEqual(["active"]);

		expect(
			(await call("POST", "/models/bulk-delete", { ids: [] })).status,
		).toBe(400);
		expect(
			(
				await call("POST", "/models/bulk-delete", {
					ids: Array.from({ length: 501 }, (_, i) => `m-${i}`),
				})
			).status,
		).toBe(400);
	});

	test("soft-deletes built-in providers and refuses reserved ids", async () => {
		expect(
			(await call("DELETE", "/providers/openai", { reason: "offboarded" }))
				.status,
		).toBe(200);
		expect((await list("providers")).some((p) => p.id === "openai")).toBe(
			false,
		);
		expect(
			(await list("providers", "only")).map((p) => [p.id, p.deletionReason]),
		).toEqual([["openai", "offboarded"]]);

		for (const id of ["custom", "auto", "dynamic", "smart", "llmgateway"]) {
			expect((await call("DELETE", `/providers/${id}`, {})).status, id).toBe(
				400,
			);
		}
		expect((await call("DELETE", "/providers/nope-provider", {})).status).toBe(
			404,
		);

		expect((await call("POST", "/providers/openai/restore")).status).toBe(200);
		expect((await list("providers", "only")).length).toBe(0);
	});

	test("deleting a custom provider revokes it and restore brings it back", async () => {
		await createManagedModel();
		expect((await call("DELETE", `/providers/${PROVIDER_ID}`, {})).status).toBe(
			200,
		);
		const claim = await db.query.providerClaim.findFirst({
			where: { providerId: { eq: PROVIDER_ID } },
		});
		expect(claim?.status).toBe("revoked");
		expect(
			(
				await call("POST", "/providers", {
					id: PROVIDER_ID,
					name: "Again",
					baseUrl: "https://api.acme-delete.example.com",
					apiKey: "sk-acme-delete-key",
				})
			).status,
		).toBe(409);

		const res = await call("POST", "/providers/bulk-restore", {
			ids: [PROVIDER_ID, "openai"],
		});
		expect(await res.json()).toEqual({
			restored: [PROVIDER_ID],
			skipped: [{ id: "openai", reason: "not deleted" }],
		});
		const restored = await db.query.providerClaim.findFirst({
			where: {
				providerId: { eq: PROVIDER_ID },
				status: { eq: "active" },
			},
		});
		expect(restored).toBeTruthy();
		const provider = (await list("providers")).find(
			(p) => p.id === PROVIDER_ID,
		);
		expect(provider).toMatchObject({ deleted: false });
	});

	test("bulk deletes providers", async () => {
		const res = await call("POST", "/providers/bulk-delete", {
			ids: ["openai", "anthropic", "custom", "nope-provider"],
		});
		expect(await res.json()).toEqual({
			deleted: ["openai", "anthropic"],
			skipped: [
				{ id: "custom", reason: "reserved id" },
				{ id: "nope-provider", reason: "unknown provider" },
			],
		});
		const rows = await db.query.catalogDeletion.findMany({
			where: { scope: { eq: "provider" } },
		});
		expect(rows.map((row) => row.target).sort()).toEqual([
			"anthropic",
			"openai",
		]);
	});

	describe.each(["support", "viewer"] as const)("%s role", (role) => {
		test("may read but not delete or restore", async () => {
			await db.insert(tables.user).values({
				id: "staff-user",
				name: "staff",
				email: "staff@example.com",
				emailVerified: true,
			});
			await db.insert(tables.account).values({
				id: "staff-account",
				providerId: "credential",
				accountId: "staff-account",
				userId: "staff-user",
				password: PASSWORD_HASH,
			});
			await db
				.insert(tables.adminMember)
				.values({ userId: "staff-user", role });
			const signIn = await app.request("/auth/sign-in/email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "staff@example.com",
					password: "admin@example.com1A",
				}),
			});
			expect(signIn.status).toBe(200);
			const staff = signIn.headers.get("set-cookie")!;

			expect((await request(staff, "GET", "/models")).status).toBe(200);
			for (const [method, path, body] of [
				["DELETE", "/models/gpt-4o", {}],
				["POST", "/models/gpt-4o/restore", undefined],
				["POST", "/models/bulk-delete", { ids: ["gpt-4o"] }],
				["POST", "/models/bulk-restore", { ids: ["gpt-4o"] }],
				["DELETE", "/providers/openai", {}],
				["POST", "/providers/openai/restore", undefined],
				["POST", "/providers/bulk-delete", { ids: ["openai"] }],
				["POST", "/providers/bulk-restore", { ids: ["openai"] }],
			] as const) {
				expect(
					(await request(staff, method, path, body)).status,
					`${method} ${path}`,
				).toBe(403);
			}
			expect(
				await db
					.select()
					.from(tables.catalogDeletion)
					.where(
						and(
							eq(tables.catalogDeletion.scope, "model"),
							inArray(tables.catalogDeletion.target, ["gpt-4o"]),
						),
					),
			).toEqual([]);
		});
	});
});
