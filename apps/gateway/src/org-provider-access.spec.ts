import { beforeAll, describe, expect, test } from "vitest";

import { encryptProviderKeyForStorage } from "@llmgateway/actions";
import { db, eq, tables } from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

import { app } from "./app.js";
import { createGatewayApiTestHarness } from "./test-utils/gateway-api-test-harness.js";

// gpt-5.5 is served by openai and azure; azure wins routing on provider
// priority, so a request that never touches azure proves the policy filtered it.
const MODEL = "gpt-5.5";
const TOKEN = "real-token-org-provider-access";

describe("operator-set organization provider access", () => {
	const harness = createGatewayApiTestHarness();
	let mockServerUrl = "";

	beforeAll(() => {
		mockServerUrl = harness.mockServerUrl;
	});

	async function seed(policy: {
		mode: "allow" | "deny";
		providers?: string[];
		models?: string[];
		mappings?: string[];
	}) {
		await db
			.update(tables.organization)
			.set({
				providerAccessMode: policy.mode,
				providerAccessProviders: policy.providers ?? [],
				providerAccessModels: policy.models ?? [],
				providerAccessMappings: policy.mappings ?? [],
			})
			.where(eq(tables.organization.id, "org-id"));
		await db.insert(tables.apiKey).values({
			id: "token-id-org-provider-access",
			...hashApiKeyForStorage(TOKEN),
			projectId: "project-id",
			description: "Test API Key",
			createdBy: "user-id",
		});
		await db.insert(tables.providerKey).values([
			{
				id: "provider-key-opa-openai",
				...encryptProviderKeyForStorage(
					"sk-openai-test-key",
					"provider-key-opa-openai",
					"org-id",
				),
				provider: "openai",
				organizationId: "org-id",
				baseUrl: mockServerUrl,
			},
			{
				id: "provider-key-opa-azure",
				...encryptProviderKeyForStorage(
					"sk-azure-test-key",
					"provider-key-opa-azure",
					"org-id",
				),
				provider: "azure",
				organizationId: "org-id",
				baseUrl: mockServerUrl,
				options: { azure_deployment_type: "ai-foundry" },
			},
		]);
	}

	async function post(path: string, body: Record<string, unknown>) {
		return await app.request(path, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify(body),
		});
	}

	function chat(model: string, content: string) {
		return post("/v1/chat/completions", {
			model,
			messages: [{ role: "user", content }],
		});
	}

	function routedProviders(json: {
		metadata?: { routing?: { provider: string }[] };
	}): string[] {
		return (json.metadata?.routing ?? []).map((attempt) => attempt.provider);
	}

	test("deny mode drops the provider from routing", async () => {
		await seed({ mode: "deny", providers: ["azure"] });

		const res = await chat(MODEL, "deny azure");
		expect(res.status).toBe(200);
		const providers = routedProviders(await res.json());
		expect(providers[0]).toBe("openai");
		expect(providers).not.toContain("azure");
	});

	test("deny mode rejects a request pinned to a denied provider", async () => {
		await seed({ mode: "deny", mappings: ["azure/gpt-5.5"] });

		const res = await chat("azure/gpt-5.5", "pinned to denied mapping");
		expect(res.status).toBe(403);
		const json = await res.json();
		expect(json.error.message).toContain(
			"Provider 'azure' is not available to your organization",
		);

		const allowed = await chat("openai/gpt-5.5", "pinned to allowed mapping");
		expect(allowed.status).toBe(200);
	});

	test("deny mode on a model blocks it entirely", async () => {
		await seed({ mode: "deny", models: [MODEL] });

		const res = await chat(MODEL, "denied model");
		expect(res.status).toBe(403);
		const json = await res.json();
		expect(json.error.message).toContain(
			`No provider for model ${MODEL} is available to your organization`,
		);
	});

	test("allow mode keeps only listed providers", async () => {
		await seed({ mode: "allow", providers: ["openai"] });

		const res = await chat(MODEL, "allow openai");
		expect(res.status).toBe(200);
		const providers = routedProviders(await res.json());
		expect(providers[0]).toBe("openai");
		expect(providers).not.toContain("azure");

		const pinned = await chat("azure/gpt-5.5", "pinned outside allow list");
		expect(pinned.status).toBe(403);
	});

	test("allow mode admits exact mappings and rejects unlisted models", async () => {
		await seed({ mode: "allow", mappings: ["openai/gpt-5.5"] });

		const ok = await chat(MODEL, "allow mapping");
		expect(ok.status).toBe(200);
		expect(routedProviders(await ok.json())).not.toContain("azure");

		const other = await chat("openai/gpt-4o", "model not on the list");
		expect(other.status).toBe(403);
	});

	test("single-provider endpoints enforce the policy", async () => {
		await seed({ mode: "deny", providers: ["openai"] });

		const res = await post("/v1/embeddings", {
			input: "hello",
			model: "text-embedding-3-small",
		});
		expect(res.status).toBe(403);
		const json = await res.json();
		expect(json.error.message).toContain(
			"Provider 'openai' is not available to your organization",
		);
	});
});
