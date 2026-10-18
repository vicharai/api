import { createServer, type Server } from "node:http";

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
	vi,
} from "vitest";

import { encryptProviderKeyForStorage } from "@llmgateway/actions";
import { and, db, eq, tables } from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

import { app } from "./app.js";
import { resetModelAllowlistCacheForTests } from "./lib/model-allowlist.js";
import { createGatewayApiTestHarness } from "./test-utils/gateway-api-test-harness.js";
import {
	clearCache,
	waitForLogByRequestId,
} from "./test-utils/test-helpers.js";

interface CapturedRequest {
	url: string;
	headers: Record<string, string | string[] | undefined>;
	body: Record<string, unknown>;
}

const TOKEN = "managed-models-token";
const CARRIER = "acme-managed";
const MODEL = "acme-large-1";
const EMBED_MODEL = "acme-embed-1";

/**
 * Models and providers created through the admin catalog live only in the DB
 * (`source: "airside"` mappings, custom providers as active claims). These
 * tests seed rows the way /admin/catalog writes them and drive the gateway
 * against a mock OpenAI-compatible upstream.
 */
describe("admin-managed models", () => {
	createGatewayApiTestHarness();

	let upstream: Server;
	let upstreamUrl = "";
	let captured: CapturedRequest[] = [];

	beforeAll(async () => {
		upstream = createServer((req, res) => {
			let body = "";
			req.on("data", (chunk) => (body += chunk));
			req.on("end", () => {
				const parsed = JSON.parse(body || "{}") as Record<string, unknown>;
				captured.push({
					url: req.url ?? "",
					headers: req.headers,
					body: parsed,
				});
				res.writeHead(200, { "content-type": "application/json" });
				if (req.url === "/v1/embeddings") {
					res.end(
						JSON.stringify({
							object: "list",
							model: parsed.model,
							data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
							usage: { prompt_tokens: 1000, total_tokens: 1000 },
						}),
					);
					return;
				}
				res.end(
					JSON.stringify({
						id: "chatcmpl-managed-1",
						object: "chat.completion",
						model: parsed.model,
						choices: [
							{
								index: 0,
								message: { role: "assistant", content: "Hello from Acme" },
								finish_reason: "stop",
							},
						],
						usage: {
							prompt_tokens: 1000,
							completion_tokens: 500,
							total_tokens: 1500,
						},
					}),
				);
			});
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

	afterEach(() => {
		vi.unstubAllEnvs();
		resetModelAllowlistCacheForTests();
	});

	afterAll(async () => {
		await new Promise<void>((resolve, reject) => {
			upstream.close((err) => (err ? reject(err) : resolve()));
		});
	});

	/** The rows POST /admin/catalog/providers and /models write. */
	async function seedManagedCatalog(
		options: {
			free?: boolean;
			deactivatedAt?: Date;
			embedding?: boolean;
			reasoningEfforts?: string[];
		} = {},
	) {
		captured = [];
		await db.insert(tables.apiKey).values({
			id: `${TOKEN}-id`,
			...hashApiKeyForStorage(TOKEN),
			projectId: "project-id",
			description: "Managed models test key",
			createdBy: "user-id",
		});
		await db
			.update(tables.project)
			.set({ mode: "credits" })
			.where(eq(tables.project.id, "project-id"));
		await db.insert(tables.providerCompany).values({
			id: "platform-catalog",
			name: "Platform catalog",
			paymentStatus: "paid",
		});
		await db
			.insert(tables.provider)
			.values({ id: CARRIER, name: "Acme Managed", description: "" })
			.onConflictDoNothing();
		await db.insert(tables.providerClaim).values({
			providerCompanyId: "platform-catalog",
			providerId: CARRIER,
			kind: "custom",
			matchedDomain: "localhost",
			customName: "Acme Managed",
			customBaseUrl: upstreamUrl,
			status: "active",
		});
		await db.insert(tables.providerKey).values({
			id: `${TOKEN}-managed-key`,
			managed: true,
			organizationId: null,
			provider: CARRIER,
			...encryptProviderKeyForStorage(
				"mock-acme-managed-key",
				`${TOKEN}-managed-key`,
				null,
			),
		});
		const modelId = options.embedding ? EMBED_MODEL : MODEL;
		await db.insert(tables.model).values({
			id: modelId,
			name: "Acme Large",
			family: "acme",
			free: options.free ?? false,
			output: [options.embedding ? "embedding" : "text"],
		});
		await db.insert(tables.modelProviderMapping).values({
			modelId,
			providerId: CARRIER,
			externalId: `${modelId}-upstream`,
			source: "airside",
			status: "active",
			inputPrice: options.free ? "0" : "3e-6",
			outputPrice: options.free ? "0" : "9e-6",
			contextSize: 64000,
			streaming: true,
			tools: true,
			reasoning: options.reasoningEfforts ? true : null,
			reasoningEfforts: options.reasoningEfforts ?? null,
			deactivatedAt: options.deactivatedAt ?? null,
		});
		await clearCache();
	}

	async function chat(model: string, extra: Record<string, unknown> = {}) {
		return await app.request("/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${TOKEN}`,
				"x-no-fallback": "true",
				"x-request-id": `managed-${model}-${Date.now()}`,
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: `Say hi ${Date.now()}` }],
				...extra,
			}),
		});
	}

	test("lists a DB-only model and bills it at the DB price", async () => {
		await seedManagedCatalog();

		const models = await app.request("/v1/models?mapped=true");
		const { data } = (await models.json()) as { data: { id: string }[] };
		expect(data.some((m) => m.id === `${CARRIER}/${MODEL}`)).toBe(true);

		const res = await chat(`${CARRIER}/${MODEL}`);
		expect(res.status).toBe(200);
		expect(captured).toHaveLength(1);
		expect(captured[0].url).toBe("/v1/chat/completions");
		expect(captured[0].body.model).toBe(`${MODEL}-upstream`);
		expect(captured[0].headers.authorization).toBe(
			"Bearer mock-acme-managed-key",
		);

		const requestId = res.headers.get("x-request-id")!;
		const log = await waitForLogByRequestId(requestId);
		expect(log?.usedProvider).toBe(CARRIER);
		// 1000 tokens at $3/M in + 500 tokens at $9/M out.
		expect(Number(log?.inputCost)).toBeCloseTo(0.003, 6);
		expect(Number(log?.outputCost)).toBeCloseTo(0.0045, 6);
	});

	test("managed models bypass the deployment allowlist", async () => {
		vi.stubEnv("GATEWAY_MODEL_ALLOWLIST", "gpt-4o");
		resetModelAllowlistCacheForTests();
		await seedManagedCatalog();
		const models = await app.request("/v1/models");
		const { data } = (await models.json()) as { data: { id: string }[] };
		expect(data.some((m) => m.id === MODEL)).toBe(true);
		const res = await chat(`${CARRIER}/${MODEL}`);
		expect(res.status).toBe(200);
	});

	test("builds the request from the DB mapping's capabilities", async () => {
		await seedManagedCatalog({ reasoningEfforts: ["none", "low"] });
		const res = await chat(`${CARRIER}/${MODEL}`, { reasoning_effort: "none" });
		expect(res.status, await res.clone().text()).toBe(200);
		// Only forwarded when the mapping declares "none" as an accepted effort.
		expect(captured[0].body.reasoning_effort).toBe("none");
	});

	test("does not route a deactivated managed mapping", async () => {
		await seedManagedCatalog({ deactivatedAt: new Date(Date.now() - 60_000) });
		const res = await chat(`${CARRIER}/${MODEL}`);
		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(res.status).toBeLessThan(500);
		expect(captured).toHaveLength(0);
	});

	test("an inactive provider takes its models offline", async () => {
		await seedManagedCatalog();
		await db
			.update(tables.providerClaim)
			.set({ status: "revoked" })
			.where(eq(tables.providerClaim.providerId, CARRIER));
		await clearCache();
		const res = await chat(`${CARRIER}/${MODEL}`);
		expect(res.status).toBe(400);
		expect(captured).toHaveLength(0);
	});

	test("auto routing can select a DB-only model", async () => {
		await seedManagedCatalog({ free: true });
		// Free models require a verified email.
		await db
			.update(tables.user)
			.set({ emailVerified: true })
			.where(eq(tables.user.id, "user-id"));
		await clearCache();
		const res = await chat("auto", { free_models_only: true });
		expect(res.status, await res.clone().text()).toBe(200);
		expect(captured).toHaveLength(1);
		expect(captured[0].url).toBe("/v1/chat/completions");
		expect(captured[0].body.model).toBe(`${MODEL}-upstream`);
		const log = await waitForLogByRequestId(res.headers.get("x-request-id")!);
		expect(log?.usedProvider).toBe(CARRIER);
	});

	test("routes a managed embedding model through /v1/embeddings", async () => {
		await seedManagedCatalog({ embedding: true });
		const requestId = "managed-embedding-req";
		const res = await app.request("/v1/embeddings", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${TOKEN}`,
				"x-request-id": requestId,
			},
			body: JSON.stringify({
				model: `${CARRIER}/${EMBED_MODEL}`,
				input: "embed me",
			}),
		});
		expect(res.status).toBe(200);
		expect(captured).toHaveLength(1);
		expect(captured[0].url).toBe("/v1/embeddings");
		expect(captured[0].body.model).toBe(`${EMBED_MODEL}-upstream`);
		const log = await waitForLogByRequestId(requestId);
		expect(log?.usedProvider).toBe(CARRIER);
		// 1000 tokens at $3/M.
		expect(Number(log?.inputCost)).toBeCloseTo(0.003, 6);
	});

	test("an override row's price wins over the static mapping", async () => {
		await seedManagedCatalog();
		await db
			.update(tables.project)
			.set({ mode: "api-keys" })
			.where(eq(tables.project.id, "project-id"));
		await db.insert(tables.providerKey).values({
			id: `${TOKEN}-mistral-key`,
			organizationId: "org-id",
			provider: "mistral",
			baseUrl: upstreamUrl,
			...encryptProviderKeyForStorage(
				"mock-mistral-key",
				`${TOKEN}-mistral-key`,
				"org-id",
			),
		});
		await db
			.insert(tables.provider)
			.values({ id: "mistral", name: "Mistral AI", description: "" })
			.onConflictDoNothing();
		await db
			.insert(tables.model)
			.values({
				id: "mistral-small-2506",
				name: "Mistral Small",
				family: "mistral",
			})
			.onConflictDoNothing();
		await db.insert(tables.modelProviderMapping).values({
			modelId: "mistral-small-2506",
			providerId: "mistral",
			externalId: "mistral-small-2506",
			source: "airside",
			status: "active",
			inputPrice: "7e-6",
			outputPrice: "11e-6",
			contextSize: 128000,
			streaming: true,
		});
		await clearCache();

		const res = await chat("mistral/mistral-small-2506");
		expect(res.status, await res.clone().text()).toBe(200);
		const log = await waitForLogByRequestId(res.headers.get("x-request-id")!);
		expect(log?.usedProvider).toBe("mistral");
		expect(Number(log?.inputCost)).toBeCloseTo(0.007, 6);
		expect(Number(log?.outputCost)).toBeCloseTo(0.0055, 6);

		// Retiring the override takes the pair offline instead of reverting to
		// the static price.
		await db
			.update(tables.modelProviderMapping)
			.set({ deactivatedAt: new Date(Date.now() - 60_000) })
			.where(
				and(
					eq(tables.modelProviderMapping.modelId, "mistral-small-2506"),
					eq(tables.modelProviderMapping.providerId, "mistral"),
				),
			);
		await clearCache();
		captured = [];
		const retired = await chat("mistral/mistral-small-2506");
		expect(retired.status).toBeGreaterThanOrEqual(400);
		expect(captured).toHaveLength(0);
	});
});
