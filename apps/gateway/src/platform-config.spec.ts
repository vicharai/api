import { afterEach, describe, expect, test, vi } from "vitest";

import { app } from "@/app.js";
import { getCachedPlatformConfig } from "@/lib/cached-queries.js";
import { createGatewayApiTestHarness } from "@/test-utils/gateway-api-test-harness.js";

import {
	db,
	invalidateCacheTags,
	mergeStoredPlatformConfig,
	PLATFORM_CONFIG_CACHE_TAG,
	tables,
} from "@llmgateway/db";
import { PLATFORM_CONFIG_SETTING_ID } from "@llmgateway/shared";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

describe("platform config in the gateway", () => {
	createGatewayApiTestHarness();

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function insertApiKey() {
		await db.insert(tables.apiKey).values({
			id: "token-id",
			...hashApiKeyForStorage("real-token"),
			projectId: "project-id",
			description: "Test API Key",
			createdBy: "user-id",
		});
	}

	async function listModelIds(): Promise<string[]> {
		const res = await app.request("/v1/models");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string }[] };
		return body.data.map((model) => model.id);
	}

	test("serves the cached value until the tag is evicted", async () => {
		expect((await getCachedPlatformConfig())["gateway.sameKeyMaxRetries"]).toBe(
			2,
		);

		// A write that bypasses the admin API leaves the cached row in place.
		await db.insert(tables.systemSetting).values({
			id: PLATFORM_CONFIG_SETTING_ID,
			enabled: true,
			value: JSON.stringify({ "gateway.sameKeyMaxRetries": 5 }),
		});
		expect((await getCachedPlatformConfig())["gateway.sameKeyMaxRetries"]).toBe(
			2,
		);

		await invalidateCacheTags([PLATFORM_CONFIG_CACHE_TAG]);
		expect((await getCachedPlatformConfig())["gateway.sameKeyMaxRetries"]).toBe(
			5,
		);
	});

	test("applies a changed model allowlist on the next request", async () => {
		// The listing only shows models whose provider has a credential.
		vi.stubEnv("LLM_OPENAI_API_KEY", "sk-test");
		const before = await listModelIds();
		expect(before).toContain("gpt-4o-mini");
		expect(before).toContain("gpt-4o");

		await mergeStoredPlatformConfig({
			"gateway.modelAllowlist": ["gpt-4o-mini"],
		});
		expect(await listModelIds()).toEqual(["gpt-4o-mini"]);

		await mergeStoredPlatformConfig({ "gateway.modelAllowlist": [] });
		expect(await listModelIds()).toContain("gpt-4o");
	});

	test("rejects a model outside the allowlist", async () => {
		await insertApiKey();
		await mergeStoredPlatformConfig({
			"gateway.modelAllowlist": ["gpt-4o-mini"],
		});

		const res = await app.request("/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer real-token",
			},
			body: JSON.stringify({
				model: "gpt-4o",
				messages: [{ role: "user", content: "hi" }],
			}),
		});
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("Unsupported model");
	});

	test("enforces an endpoint RPM set in the admin config", async () => {
		await insertApiKey();
		const getKey = async () =>
			await app.request("/v1/key", {
				headers: { Authorization: "Bearer real-token" },
			});

		expect((await getKey()).status).toBe(200);
		expect((await getKey()).status).toBe(200);

		await mergeStoredPlatformConfig({
			"gateway.rateLimitsEnabled": true,
			"gateway.rpm.key": 2,
		});
		const limited = await getKey();
		expect(limited.status).toBe(429);
		expect(limited.headers.get("Retry-After")).toBeTruthy();

		await mergeStoredPlatformConfig({ "gateway.rpm.key": 0 });
		expect((await getKey()).status).toBe(200);
	});
});
