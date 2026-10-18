import { createServer, type Server } from "node:http";

import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { readProviderKey } from "@llmgateway/actions";
import { and, db, drizzleCache, eq, inArray, tables } from "@llmgateway/db";

const PROVIDER_ID = "acme-catalog";
const MODEL_ID = "acme-large-1";
const EMBED_MODEL_ID = "acme-embed-1";

interface CatalogMapping {
	providerId: string;
	externalId: string;
	inputPrice: string | null;
	outputPrice: string | null;
	contextSize: number | null;
	vision: boolean | null;
	managed: boolean;
	overridesBuiltin: boolean;
	deactivatedAt: string | null;
}

interface CatalogModel {
	id: string;
	managed: boolean;
	status: string;
	output: string[];
	mappings: CatalogMapping[];
}

interface CatalogProvider {
	id: string;
	kind: string;
	baseUrl: string | null;
	status: string;
	credentialCount: number;
	modelCount: number;
}

describe("admin catalog", () => {
	let cookie: string;
	let upstream: Server;
	let upstreamUrl = "";
	let seededBuiltinRows: { model: boolean; provider: boolean };

	beforeAll(async () => {
		upstream = createServer((req, res) => {
			if (req.url === "/v1/models") {
				res.writeHead(200, { "content-type": "application/json" });
				res.end(
					JSON.stringify({
						data: [{ id: "acme-large-upstream" }, { id: "acme-embed" }],
					}),
				);
				return;
			}
			res.writeHead(404);
			res.end();
		});
		upstreamUrl = await new Promise<string>((resolve) => {
			upstream.listen(0, () => {
				const address = upstream.address();
				resolve(
					`http://localhost:${typeof address === "object" && address ? address.port : 0}`,
				);
			});
		});
	});

	afterAll(async () => {
		await new Promise<void>((resolve, reject) => {
			upstream.close((err) => (err ? reject(err) : resolve()));
		});
	});

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		seededBuiltinRows = {
			model: Boolean(
				await db.query.model.findFirst({ where: { id: { eq: "gpt-4o" } } }),
			),
			provider: Boolean(
				await db.query.provider.findFirst({ where: { id: { eq: "openai" } } }),
			),
		};
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		await db
			.delete(tables.modelProviderMapping)
			.where(
				inArray(tables.modelProviderMapping.modelId, [
					MODEL_ID,
					EMBED_MODEL_ID,
				]),
			);
		await db
			.delete(tables.modelProviderMapping)
			.where(
				and(
					eq(tables.modelProviderMapping.modelId, "gpt-4o"),
					eq(tables.modelProviderMapping.source, "airside"),
				),
			);
		await db
			.delete(tables.model)
			.where(inArray(tables.model.id, [MODEL_ID, EMBED_MODEL_ID]));
		if (!seededBuiltinRows.model) {
			await db.delete(tables.model).where(eq(tables.model.id, "gpt-4o"));
		}
		if (!seededBuiltinRows.provider) {
			await db.delete(tables.provider).where(eq(tables.provider.id, "openai"));
		}
		await deleteAll();
		await db.delete(tables.provider).where(eq(tables.provider.id, PROVIDER_ID));
	});

	async function request(
		method: string,
		path: string,
		body?: Record<string, unknown>,
	) {
		return await app.request(`/admin/catalog${path}`, {
			method,
			headers: { Cookie: cookie, "Content-Type": "application/json" },
			body: body ? JSON.stringify(body) : undefined,
		});
	}

	async function createProvider(overrides: Record<string, unknown> = {}) {
		return await request("POST", "/providers", {
			id: PROVIDER_ID,
			name: "Acme Catalog",
			baseUrl: upstreamUrl,
			apiKey: "sk-acme-catalog-key",
			...overrides,
		});
	}

	async function listModels(query = ""): Promise<CatalogModel[]> {
		const res = await request("GET", `/models${query}`);
		expect(res.status).toBe(200);
		return ((await res.json()) as { models: CatalogModel[] }).models;
	}

	const mapping = {
		providerId: PROVIDER_ID,
		externalId: "acme-large-upstream",
		inputPrice: "1.5e-6",
		outputPrice: "6e-6",
		contextSize: 64000,
		streaming: true,
		tools: true,
	};

	test("requires authentication", async () => {
		const res = await app.request("/admin/catalog/providers");
		expect(res.status).toBe(401);
	});

	test("creates a custom provider with a platform credential", async () => {
		const res = await createProvider();
		expect(res.status).toBe(201);
		const { provider } = (await res.json()) as { provider: CatalogProvider };
		expect(provider).toMatchObject({
			id: PROVIDER_ID,
			kind: "custom",
			baseUrl: upstreamUrl,
			status: "active",
			credentialCount: 1,
		});

		const claim = await db.query.providerClaim.findFirst({
			where: { providerId: { eq: PROVIDER_ID } },
		});
		expect(claim).toMatchObject({ kind: "custom", status: "active" });
		const credential = await db.query.providerKey.findFirst({
			where: { provider: { eq: PROVIDER_ID }, managed: { eq: true } },
		});
		expect(credential).toBeTruthy();
		expect(readProviderKey(credential!)).toBe("sk-acme-catalog-key");

		const list = await request("GET", "/providers");
		const { providers } = (await list.json()) as {
			providers: CatalogProvider[];
		};
		expect(
			providers.some((p) => p.id === "openai" && p.kind === "builtin"),
		).toBe(true);
		expect(providers.some((p) => p.id === PROVIDER_ID)).toBe(true);
	});

	test("rejects reserved, catalogue and duplicate provider ids", async () => {
		expect((await createProvider({ id: "openai" })).status).toBe(409);
		expect((await createProvider({ id: "auto" })).status).toBe(409);
		expect((await createProvider({ id: "Bad Id!" })).status).toBe(400);
		expect((await createProvider()).status).toBe(201);
		expect((await createProvider()).status).toBe(409);
	});

	test("rejects unsafe base URLs", async () => {
		vi.stubEnv("ALLOW_INSECURE_PROVIDER_URLS", "false");
		for (const baseUrl of [
			"http://api.example.com",
			"https://169.254.169.254",
			"https://localhost",
			"https://10.0.0.5/v1",
		]) {
			const res = await createProvider({ baseUrl });
			expect(res.status, baseUrl).toBe(400);
		}
		expect(
			await db.query.providerClaim.findFirst({
				where: { providerId: { eq: PROVIDER_ID } },
			}),
		).toBeUndefined();
	});

	test("updates, rotates the key of and deactivates a custom provider", async () => {
		await createProvider();
		const patched = await request("PATCH", `/providers/${PROVIDER_ID}`, {
			name: "Acme Renamed",
			apiKey: "sk-acme-rotated",
		});
		expect(patched.status).toBe(200);
		const keys = await db.query.providerKey.findMany({
			where: { provider: { eq: PROVIDER_ID } },
		});
		expect(keys.filter((key) => key.status === "active")).toHaveLength(1);
		expect(readProviderKey(keys.find((key) => key.status === "active")!)).toBe(
			"sk-acme-rotated",
		);

		const removed = await request("DELETE", `/providers/${PROVIDER_ID}`);
		expect(removed.status).toBe(200);
		const claim = await db.query.providerClaim.findFirst({
			where: { providerId: { eq: PROVIDER_ID } },
		});
		expect(claim?.status).toBe("revoked");

		const reactivated = await request("PATCH", `/providers/${PROVIDER_ID}`, {
			status: "active",
		});
		expect(reactivated.status).toBe(200);
		expect(
			((await reactivated.json()) as { provider: CatalogProvider }).provider
				.status,
		).toBe("active");

		expect(
			(await request("PATCH", "/providers/openai", { name: "x" })).status,
		).toBe(400);
	});

	test("probes a custom provider's model list", async () => {
		await createProvider();
		const res = await request("POST", `/providers/${PROVIDER_ID}/test`);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			ok: true,
			models: ["acme-large-upstream", "acme-embed"],
			error: null,
		});
	});

	test("creates a managed model and lists it", async () => {
		await createProvider();
		const res = await request("POST", "/models", {
			id: MODEL_ID,
			name: "Acme Large",
			family: "acme",
			output: "text",
			mappings: [mapping],
		});
		expect(res.status).toBe(201);
		const { model } = (await res.json()) as { model: CatalogModel };
		expect(model).toMatchObject({
			id: MODEL_ID,
			managed: true,
			status: "active",
		});
		expect(model.mappings[0]).toMatchObject({
			providerId: PROVIDER_ID,
			inputPrice: "1.5e-6",
			managed: true,
			overridesBuiltin: false,
		});

		const row = await db.query.modelProviderMapping.findFirst({
			where: { modelId: { eq: MODEL_ID } },
		});
		expect(row).toMatchObject({ source: "airside", status: "active" });

		const publicCatalogue = await app.request("/internal/models");
		const { models: catalogue } = (await publicCatalogue.json()) as {
			models: { id: string; mappings: { inputPrice: string | null }[] }[];
		};
		const listed = catalogue.find((m) => m.id === MODEL_ID);
		expect(Number(listed?.mappings[0]?.inputPrice)).toBeCloseTo(1.5e-6);

		const managed = await listModels("?managed=true");
		expect(managed.some((m) => m.id === MODEL_ID)).toBe(true);
		expect(managed.some((m) => m.id === "gpt-4o")).toBe(false);

		const providers = (await (await request("GET", "/providers")).json()) as {
			providers: CatalogProvider[];
		};
		expect(
			providers.providers.find((p) => p.id === PROVIDER_ID)?.modelCount,
		).toBe(1);
	});

	test("validates model input", async () => {
		await createProvider();
		const base = {
			id: MODEL_ID,
			name: "Acme Large",
			family: "acme",
			output: "text",
		};
		const negative = await request("POST", "/models", {
			...base,
			mappings: [{ ...mapping, inputPrice: "-1e-6" }],
		});
		expect(negative.status).toBe(400);
		const garbage = await request("POST", "/models", {
			...base,
			mappings: [{ ...mapping, outputPrice: "cheap" }],
		});
		expect(garbage.status).toBe(400);
		const builtinId = await request("POST", "/models", {
			...base,
			id: "gpt-4o",
			mappings: [],
		});
		expect(builtinId.status).toBe(409);
		const unknownProvider = await request("POST", "/models", {
			...base,
			mappings: [{ ...mapping, providerId: "nope-provider" }],
		});
		expect(unknownProvider.status).toBe(400);
		expect(
			await db.query.model.findFirst({ where: { id: { eq: MODEL_ID } } }),
		).toBeUndefined();
	});

	test("overrides a built-in mapping's price and evicts caches", async () => {
		const onMutate = vi.spyOn(drizzleCache, "onMutate");
		const res = await request("PUT", "/models/gpt-4o/mappings/openai", {
			externalId: "gpt-4o",
			inputPrice: "2e-6",
			outputPrice: "8e-6",
			streaming: true,
		});
		expect(res.status).toBe(200);
		const { mapping: saved } = (await res.json()) as {
			mapping: CatalogMapping;
		};
		// Fields the request left out keep the static mapping's values.
		expect(saved).toMatchObject({
			inputPrice: "2e-6",
			outputPrice: "8e-6",
			contextSize: 128000,
			vision: true,
			managed: true,
			overridesBuiltin: true,
		});
		expect(onMutate).toHaveBeenCalledWith(
			expect.objectContaining({
				tables: expect.arrayContaining(["model_provider_mapping"]),
			}),
		);

		const gpt4o = (await listModels("?search=gpt-4o")).find(
			(m) => m.id === "gpt-4o",
		);
		expect(gpt4o?.managed).toBe(false);
		const openai = gpt4o?.mappings.filter((m) => m.providerId === "openai");
		expect(openai).toHaveLength(1);
		expect(openai?.[0]).toMatchObject({ inputPrice: "2e-6", managed: true });
	});

	test("deactivates mappings without deleting rows", async () => {
		await createProvider();
		await request("POST", "/models", {
			id: MODEL_ID,
			name: "Acme Large",
			family: "acme",
			output: "text",
			mappings: [mapping],
		});
		const res = await request(
			"DELETE",
			`/models/${MODEL_ID}/mappings/${PROVIDER_ID}`,
		);
		expect(res.status).toBe(200);
		const row = await db.query.modelProviderMapping.findFirst({
			where: { modelId: { eq: MODEL_ID } },
		});
		expect(row?.deactivatedAt).toBeInstanceOf(Date);

		// A built-in pair is retired through a deactivated override row.
		const builtin = await request("DELETE", "/models/gpt-4o/mappings/openai");
		expect(builtin.status).toBe(200);
		const override = await db.query.modelProviderMapping.findFirst({
			where: {
				modelId: { eq: "gpt-4o" },
				providerId: { eq: "openai" },
				region: { isNull: true },
			},
		});
		expect(override).toMatchObject({ source: "airside" });
		expect(override?.deactivatedAt).toBeInstanceOf(Date);
		expect(Number(override?.inputPrice)).toBeCloseTo(2.5e-6);
	});

	test("model status cascades to its mappings; built-ins are read-only", async () => {
		await createProvider();
		await request("POST", "/models", {
			id: EMBED_MODEL_ID,
			name: "Acme Embed",
			family: "acme",
			output: "embedding",
			mappings: [{ ...mapping, externalId: "acme-embed", outputPrice: "0" }],
		});
		const res = await request("PATCH", `/models/${EMBED_MODEL_ID}`, {
			status: "inactive",
		});
		expect(res.status).toBe(200);
		const { model } = (await res.json()) as { model: CatalogModel };
		expect(model).toMatchObject({ status: "inactive", output: ["embedding"] });
		const row = await db.query.modelProviderMapping.findFirst({
			where: { modelId: { eq: EMBED_MODEL_ID } },
		});
		expect(row?.status).toBe("inactive");

		expect(
			(await request("PATCH", "/models/gpt-4o", { name: "Renamed" })).status,
		).toBe(400);
	});
});
