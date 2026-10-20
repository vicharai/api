import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { encryptProviderKeyForStorage } from "@llmgateway/actions";
import {
	and,
	CATALOG_DELETIONS_CACHE_TAG,
	db,
	eq,
	invalidateCacheTags,
	tables,
} from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";
import { randomToken } from "@llmgateway/shared/random";

import { app } from "./app.js";
import { createGatewayApiTestHarness } from "./test-utils/gateway-api-test-harness.js";

// gpt-5.5 is served by openai and azure.
const MODEL = "gpt-5.5";
const TOKEN = "catalog-deletion-token";
const CARRIER = "acme-deleted";
const MANAGED_MODEL = "acme-deleted-1";

async function remove(scope: "provider" | "model", target: string) {
	await db.insert(tables.catalogDeletion).values({ scope, target });
	await invalidateCacheTags([CATALOG_DELETIONS_CACHE_TAG]);
}

async function restore(scope: "provider" | "model", target: string) {
	await db
		.delete(tables.catalogDeletion)
		.where(
			and(
				eq(tables.catalogDeletion.scope, scope),
				eq(tables.catalogDeletion.target, target),
			),
		);
	await invalidateCacheTags([CATALOG_DELETIONS_CACHE_TAG]);
}

async function chat(model: string, extra: Record<string, unknown> = {}) {
	return await app.request("/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${TOKEN}`,
		},
		body: JSON.stringify({
			model,
			messages: [{ role: "user", content: `hi ${randomToken()}` }],
			...extra,
		}),
	});
}

/** Bare and provider-qualified ids from /v1/models. */
async function listedIds(authenticated = true): Promise<string[]> {
	const ids: string[] = [];
	for (const query of ["", "?mapped=true"]) {
		const res = await app.request(`/v1/models${query}`, {
			headers: authenticated ? { Authorization: `Bearer ${TOKEN}` } : {},
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string }[] };
		ids.push(...body.data.map((model) => model.id));
	}
	return ids;
}

function routed(json: {
	metadata?: { routing?: { provider: string }[] };
}): string[] {
	return (json.metadata?.routing ?? []).map((attempt) => attempt.provider);
}

describe("admin catalogue deletions", () => {
	const harness = createGatewayApiTestHarness();
	let upstream: Server;
	let upstreamUrl = "";
	let managedCalls = 0;

	beforeAll(async () => {
		upstream = createServer((req, res) => {
			req.resume();
			req.on("end", () => {
				managedCalls++;
				res.writeHead(200, { "content-type": "application/json" });
				res.end(
					JSON.stringify({
						id: "chatcmpl-deleted",
						object: "chat.completion",
						model: MANAGED_MODEL,
						choices: [
							{
								index: 0,
								message: { role: "assistant", content: "hi" },
								finish_reason: "stop",
							},
						],
						usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
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

	afterAll(async () => {
		await new Promise<void>((resolve, reject) => {
			upstream.close((err) => (err ? reject(err) : resolve()));
		});
	});

	async function seedKeys() {
		await db.insert(tables.apiKey).values({
			id: `${TOKEN}-id`,
			...hashApiKeyForStorage(TOKEN),
			projectId: "project-id",
			description: "Catalog deletion key",
			createdBy: "user-id",
		});
		await db.insert(tables.providerKey).values([
			{
				id: `${TOKEN}-openai`,
				...encryptProviderKeyForStorage(
					"sk-openai-test-key",
					`${TOKEN}-openai`,
					"org-id",
				),
				provider: "openai",
				organizationId: "org-id",
				baseUrl: harness.mockServerUrl,
			},
			{
				id: `${TOKEN}-azure`,
				...encryptProviderKeyForStorage(
					"sk-azure-test-key",
					`${TOKEN}-azure`,
					"org-id",
				),
				provider: "azure",
				organizationId: "org-id",
				baseUrl: harness.mockServerUrl,
				options: { azure_deployment_type: "ai-foundry" },
			},
		]);
	}

	/** The rows /admin/catalog writes for a custom provider + managed model. */
	async function seedManagedModel() {
		managedCalls = 0;
		await harness.setProjectMode("credits");
		await db
			.update(tables.user)
			.set({ emailVerified: true })
			.where(eq(tables.user.id, "user-id"));
		await db.insert(tables.providerCompany).values({
			id: "platform-catalog",
			name: "Platform catalog",
			paymentStatus: "paid",
		});
		await db
			.insert(tables.provider)
			.values({ id: CARRIER, name: "Acme Deleted", description: "" })
			.onConflictDoNothing();
		await db.insert(tables.providerClaim).values({
			providerCompanyId: "platform-catalog",
			providerId: CARRIER,
			kind: "custom",
			matchedDomain: "localhost",
			customName: "Acme Deleted",
			customBaseUrl: upstreamUrl,
			status: "active",
		});
		await db.insert(tables.providerKey).values({
			id: `${TOKEN}-managed`,
			managed: true,
			organizationId: null,
			provider: CARRIER,
			...encryptProviderKeyForStorage("mock-key", `${TOKEN}-managed`, null),
		});
		await db.insert(tables.model).values({
			id: MANAGED_MODEL,
			name: "Acme Deleted",
			family: "acme",
			free: true,
			output: ["text"],
		});
		await db.insert(tables.modelProviderMapping).values({
			modelId: MANAGED_MODEL,
			providerId: CARRIER,
			externalId: `${MANAGED_MODEL}-upstream`,
			source: "airside",
			status: "active",
			inputPrice: "0",
			outputPrice: "0",
			contextSize: 64000,
			streaming: true,
		});
	}

	test("a deleted built-in model is unknown and unlisted until restored", async () => {
		await seedKeys();
		expect(await listedIds()).toContain(MODEL);

		await remove("model", MODEL);
		const res = await chat(MODEL);
		expect(res.status).toBe(400);
		expect((await res.json()).error.message).toContain(
			`Unsupported model: ${MODEL}`,
		);
		expect((await chat(`openai/${MODEL}`)).status).toBe(400);
		const ids = await listedIds();
		expect(ids).not.toContain(MODEL);
		expect(ids).not.toContain(`openai/${MODEL}`);

		await restore("model", MODEL);
		expect((await chat(MODEL)).status).toBe(200);
		expect(await listedIds()).toContain(MODEL);
	});

	test("a deleted provider stops routing; other providers keep serving", async () => {
		await seedKeys();
		await remove("provider", "azure");

		const res = await chat(MODEL);
		expect(res.status).toBe(200);
		expect(routed(await res.json())).not.toContain("azure");

		const pinned = await chat(`azure/${MODEL}`);
		expect(pinned.status).toBe(400);
		expect((await pinned.json()).error.message).toContain(
			"Unsupported provider: azure",
		);
		const ids = await listedIds();
		expect(ids).not.toContain(`azure/${MODEL}`);
		expect(ids).toContain(`openai/${MODEL}`);

		await restore("provider", "azure");
		expect((await chat(`azure/${MODEL}`)).status).toBe(200);
		expect(await listedIds()).toContain(`azure/${MODEL}`);
	});

	test("a model whose every provider is deleted becomes unknown", async () => {
		await seedKeys();
		await remove("provider", "azure");
		await remove("provider", "openai");

		const res = await chat(MODEL);
		expect(res.status).toBe(400);
		expect((await res.json()).error.message).toContain(
			`Unsupported model: ${MODEL}`,
		);
		expect(await listedIds()).not.toContain(MODEL);
	});

	test("a deleted managed model is unknown, unlisted and out of the auto pool", async () => {
		await seedManagedModel();
		await seedKeys();
		expect(await listedIds(false)).toContain(MANAGED_MODEL);
		expect((await chat(`${CARRIER}/${MANAGED_MODEL}`)).status).toBe(200);
		expect(managedCalls).toBe(1);
		expect((await chat("auto", { free_models_only: true })).status).toBe(200);
		expect(managedCalls).toBe(2);

		await remove("model", MANAGED_MODEL);
		const res = await chat(`${CARRIER}/${MANAGED_MODEL}`);
		expect(res.status).toBe(400);
		expect((await res.json()).error.message).toContain("Unsupported model");
		expect((await chat(MANAGED_MODEL)).status).toBe(400);
		const ids = await listedIds(false);
		expect(ids).not.toContain(MANAGED_MODEL);
		expect(ids).not.toContain(`${CARRIER}/${MANAGED_MODEL}`);

		await chat("auto", { free_models_only: true });
		expect(managedCalls).toBe(2);

		await restore("model", MANAGED_MODEL);
		expect((await chat(`${CARRIER}/${MANAGED_MODEL}`)).status).toBe(200);
		expect(managedCalls).toBe(3);
	});

	test("other endpoints reject a deleted model", async () => {
		await seedKeys();
		const embed = () =>
			app.request("/v1/embeddings", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${TOKEN}`,
				},
				body: JSON.stringify({
					model: "text-embedding-3-small",
					input: `embed ${randomToken()}`,
				}),
			});
		expect((await embed()).status).toBe(200);

		await remove("model", "text-embedding-3-small");
		const res = await embed();
		expect(res.status).toBe(400);
		expect((await res.json()).error.message).toContain("Unsupported model");
	});

	test("a deleted custom provider's models are not routed", async () => {
		await seedManagedModel();
		await seedKeys();
		await remove("provider", CARRIER);

		const res = await chat(`${CARRIER}/${MANAGED_MODEL}`);
		expect(res.status).toBe(400);
		expect(managedCalls).toBe(0);
		expect(await listedIds(false)).not.toContain(`${CARRIER}/${MANAGED_MODEL}`);
	});
});
