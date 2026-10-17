import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { encryptProviderKeyForStorage } from "@llmgateway/actions";
import {
	db,
	eq,
	invalidateCacheTags,
	ROUTING_OVERRIDES_CACHE_TAG,
	systemSettingCacheTag,
	tables,
} from "@llmgateway/db";
import { getProviderEnvVar, providers } from "@llmgateway/models";
import { GATEWAY_MAINTENANCE_SETTING_ID } from "@llmgateway/shared";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

import { app } from "./app.js";
import { createGatewayApiTestHarness } from "./test-utils/gateway-api-test-harness.js";

// gpt-5.5 is served by openai and azure; azure wins on provider priority.
const MODEL = "gpt-5.5";
const TOKEN = "real-token-admin-controls";

describe("admin kill switch and maintenance mode", () => {
	const harness = createGatewayApiTestHarness();
	let mockServerUrl = "";

	beforeAll(() => {
		mockServerUrl = harness.mockServerUrl;
	});

	afterEach(async () => {
		await db.delete(tables.routingOverride);
		await invalidateCacheTags([
			ROUTING_OVERRIDES_CACHE_TAG,
			systemSettingCacheTag(GATEWAY_MAINTENANCE_SETTING_ID),
		]);
	});

	async function seedKeys() {
		await db.insert(tables.apiKey).values({
			id: "token-id-admin-controls",
			...hashApiKeyForStorage(TOKEN),
			projectId: "project-id",
			description: "Test API Key",
			createdBy: "user-id",
		});
		await db.insert(tables.providerKey).values([
			{
				id: "provider-key-ac-openai",
				...encryptProviderKeyForStorage(
					"sk-openai-test-key",
					"provider-key-ac-openai",
					"org-id",
				),
				provider: "openai",
				organizationId: "org-id",
				baseUrl: mockServerUrl,
			},
			{
				id: "provider-key-ac-azure",
				...encryptProviderKeyForStorage(
					"sk-azure-test-key",
					"provider-key-ac-azure",
					"org-id",
				),
				provider: "azure",
				organizationId: "org-id",
				baseUrl: mockServerUrl,
				options: { azure_deployment_type: "ai-foundry" },
			},
		]);
	}

	async function override(
		scope: "provider" | "model" | "mapping",
		target: string,
		expiresAt: Date | null = null,
	) {
		await db
			.insert(tables.routingOverride)
			.values({ scope, target, reason: "incident", expiresAt });
		await invalidateCacheTags([ROUTING_OVERRIDES_CACHE_TAG]);
	}

	async function chat(model: string, content: string) {
		return await app.request("/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({ model, messages: [{ role: "user", content }] }),
		});
	}

	function routed(json: {
		metadata?: { routing?: { provider: string }[] };
	}): string[] {
		return (json.metadata?.routing ?? []).map((attempt) => attempt.provider);
	}

	test("a provider kill switch removes it from routing", async () => {
		await seedKeys();
		await override("provider", "azure");

		const res = await chat(MODEL, "kill azure");
		expect(res.status).toBe(200);
		const providersTried = routed(await res.json());
		expect(providersTried[0]).toBe("openai");
		expect(providersTried).not.toContain("azure");
	});

	test("a pinned disabled mapping gets 503", async () => {
		await seedKeys();
		await override("mapping", "azure/gpt-5.5");

		const res = await chat("azure/gpt-5.5", "pinned to disabled mapping");
		expect(res.status).toBe(503);
		expect((await res.json()).error.message).toContain(
			"Provider 'azure' is temporarily unavailable",
		);
		expect((await chat("openai/gpt-5.5", "other mapping")).status).toBe(200);
	});

	test("a model kill switch makes the model unavailable", async () => {
		await seedKeys();
		await override("model", MODEL);

		const res = await chat(MODEL, "disabled model");
		expect(res.status).toBe(503);
		expect((await res.json()).error.message).toContain(
			`Model ${MODEL} is temporarily unavailable`,
		);
	});

	test("expired overrides are ignored", async () => {
		await seedKeys();
		await override("model", MODEL, new Date(Date.now() - 60_000));

		expect((await chat(MODEL, "expired override")).status).toBe(200);
	});

	test("maintenance mode answers 503 but keeps model discovery up", async () => {
		await seedKeys();
		await db.insert(tables.systemSetting).values({
			id: GATEWAY_MAINTENANCE_SETTING_ID,
			enabled: true,
			value: "Upgrading the database",
		});
		await invalidateCacheTags([
			systemSettingCacheTag(GATEWAY_MAINTENANCE_SETTING_ID),
		]);

		const res = await chat(MODEL, "during maintenance");
		expect(res.status).toBe(503);
		expect(res.headers.get("retry-after")).toBe("60");
		expect((await res.json()).error.message).toBe("Upgrading the database");
		expect((await app.request("/v1/models")).status).toBe(200);

		await db
			.update(tables.systemSetting)
			.set({ enabled: false })
			.where(eq(tables.systemSetting.id, GATEWAY_MAINTENANCE_SETTING_ID));
		await invalidateCacheTags([
			systemSettingCacheTag(GATEWAY_MAINTENANCE_SETTING_ID),
		]);
		expect((await chat(MODEL, "after maintenance")).status).toBe(200);
	});
});

describe("model discovery honours kill switches and provider access", () => {
	const harness = createGatewayApiTestHarness();
	const headers = { Authorization: "Bearer test-token" };
	const savedEnv: Record<string, string | undefined> = {};

	beforeAll(() => {
		for (const provider of providers) {
			const envVar = getProviderEnvVar(provider.id);
			if (envVar) {
				savedEnv[envVar] = process.env[envVar];
				process.env[envVar] = "sk-admin-controls-spec";
			}
		}
	});

	afterAll(() => {
		for (const [envVar, value] of Object.entries(savedEnv)) {
			if (value === undefined) {
				Reflect.deleteProperty(process.env, envVar);
			} else {
				process.env[envVar] = value;
			}
		}
	});

	afterEach(async () => {
		await db.delete(tables.routingOverride);
		await invalidateCacheTags([ROUTING_OVERRIDES_CACHE_TAG]);
	});

	async function mappedIds(): Promise<string[]> {
		await harness.setProjectMode("credits");
		const res = await app.request("/v1/models?mapped=true", { headers });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string }[] };
		return body.data.map((model) => model.id);
	}

	async function seedKey() {
		await db.insert(tables.apiKey).values({
			id: "models-key-admin-controls",
			...hashApiKeyForStorage("test-token"),
			projectId: "project-id",
			createdBy: "user-id",
			description: "Model discovery key",
		});
	}

	test("hides mappings disabled by a kill switch", async () => {
		await seedKey();
		const before = await mappedIds();
		expect(before).toContain("azure/gpt-5.5");
		expect(before).toContain("openai/gpt-5.5");

		await db
			.insert(tables.routingOverride)
			.values({ scope: "provider", target: "azure", reason: "incident" });
		await invalidateCacheTags([ROUTING_OVERRIDES_CACHE_TAG]);

		const after = await mappedIds();
		expect(after).not.toContain("azure/gpt-5.5");
		expect(after).toContain("openai/gpt-5.5");
	});

	test("hides mappings excluded by org provider access", async () => {
		await seedKey();
		await db
			.update(tables.organization)
			.set({
				providerAccessMode: "deny",
				providerAccessMappings: ["openai/gpt-5.5"],
			})
			.where(eq(tables.organization.id, "org-id"));

		const ids = await mappedIds();
		expect(ids).not.toContain("openai/gpt-5.5");
		expect(ids).toContain("azure/gpt-5.5");
	});
});
