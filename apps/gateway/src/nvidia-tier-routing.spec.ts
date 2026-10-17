import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { encryptProviderKeyForStorage } from "@llmgateway/actions";
import { db, eq, tables } from "@llmgateway/db";
import { models, type ModelDefinition } from "@llmgateway/models";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

import { app } from "./app.js";
import { isOrganizationPaid } from "./lib/cached-queries.js";
import { createGatewayApiTestHarness } from "./test-utils/gateway-api-test-harness.js";
import { requestLogs, waitForLogs } from "./test-utils/test-helpers.js";

/**
 * Tier routing: free orgs prefer the stealth nvidia leg (score boost −0.9),
 * paid orgs never see it unless it is the only eligible mapping.
 */

const MODEL = "glm-5.3-flash";
const FREE_MODEL = "nv-tier-test-free-model";

// A free model whose nvidia leg is the pricier one: only the free-org boost,
// not the list price, can make nvidia win here.
const FREE_TEST_MODEL: ModelDefinition = {
	id: FREE_MODEL,
	name: "NV tier test model",
	family: "test",
	releasedAt: new Date("2026-01-01"),
	free: true,
	providers: [
		{
			providerId: "cloudflare",
			externalId: "cf/free-test",
			inputPrice: "0.5e-6",
			outputPrice: "1e-6",
			requestPrice: "0",
			contextSize: 8192,
			streaming: true,
			jsonOutput: true,
		},
		{
			providerId: "nvidia",
			externalId: "nv/free-test",
			inputPrice: "1e-6",
			outputPrice: "2e-6",
			requestPrice: "0",
			contextSize: 8192,
			streaming: true,
			jsonOutput: true,
		},
	],
};

async function seedKeys(harness: {
	mockServerUrl: string;
	setRoutingMetrics: (
		m: string,
		p: string,
		metrics: { uptime: number },
	) => Promise<void>;
}) {
	await db.insert(tables.apiKey).values({
		id: "token-id-nvidia-tier",
		...hashApiKeyForStorage("test-token-nvidia-tier"),
		projectId: "project-id",
		createdBy: "user-id",
		description: "tier routing test key",
	});
	for (const provider of ["nvidia", "cloudflare"] as const) {
		const keyId = `provider-key-nvidia-tier-${provider}`;
		await db.insert(tables.providerKey).values({
			id: keyId,
			...encryptProviderKeyForStorage("sk-test-key", keyId, "org-id"),
			provider,
			organizationId: "org-id",
			baseUrl: `${harness.mockServerUrl}/v1`,
		});
		await harness.setRoutingMetrics(MODEL, provider, { uptime: 100 });
	}
}

async function markPaid() {
	await db.insert(tables.transaction).values({
		id: "txn-nvidia-tier-paid",
		organizationId: "org-id",
		type: "credit_topup",
		status: "completed",
		amount: "10",
		creditAmount: "10",
	});
}

async function send(content: string) {
	const res = await app.request("/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: "Bearer test-token-nvidia-tier",
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: "user", content }],
		}),
	});
	return { res, json: await res.json() };
}

describe("nvidia tier routing", () => {
	const harness = createGatewayApiTestHarness();
	const originalNvidiaTimeout = process.env.LLM_NVIDIA_TIMEOUT_MS;

	beforeAll(() => {});

	afterEach(async () => {
		vi.restoreAllMocks();
		if (originalNvidiaTimeout === undefined) {
			delete process.env.LLM_NVIDIA_TIMEOUT_MS;
		} else {
			process.env.LLM_NVIDIA_TIMEOUT_MS = originalNvidiaTimeout;
		}
		await db
			.delete(tables.transaction)
			.where(eq(tables.transaction.id, "txn-nvidia-tier-paid"));
	});

	test("free org routes to nvidia", async () => {
		await seedKeys(harness);
		const { res, json } = await send("tier check a1");
		expect(res.status, JSON.stringify(json)).toBe(200);
		expect(json.metadata.used_provider).toBe("nvidia");
	});

	test("free org falls back to cloudflare on nvidia 5xx", async () => {
		await seedKeys(harness);
		const { res, json } = await send("TRIGGER_STATUS_500 tier check b1");
		// Both providers 500: the request fails, and the log shows the last
		// attempt went to cloudflare — i.e. nvidia was tried first.
		expect(res.status, JSON.stringify(json)).toBe(500);
		const logs = requestLogs(await waitForLogs(1));
		expect(logs[0]?.usedProvider).toBe("cloudflare");
	});

	test("free org falls back to cloudflare on nvidia timeout", async () => {
		process.env.LLM_NVIDIA_TIMEOUT_MS = "50";
		await seedKeys(harness);
		const { res, json } = await send("TRIGGER_TIMEOUT_5000 tier check c1");
		expect(res.status, JSON.stringify(json)).toBe(200);
		const routing = json.metadata?.routing ?? [];
		expect(routing[0]?.provider).toBe("nvidia");
		expect(routing[1]?.provider).toBe("cloudflare");
		expect(json.metadata.used_provider).toBe("cloudflare");
	});

	test("paid org routes to cloudflare despite the free-org boost", async () => {
		await seedKeys(harness);
		await markPaid();
		const { res, json } = await send("tier check d1");
		expect(res.status, JSON.stringify(json)).toBe(200);
		expect(json.metadata.used_provider).toBe("cloudflare");
	});

	test("paid org pinning nvidia explicitly is still served", async () => {
		await seedKeys(harness);
		await markPaid();
		const res = await app.request("/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer test-token-nvidia-tier",
			},
			body: JSON.stringify({
				model: `nvidia/${MODEL}`,
				messages: [{ role: "user", content: "tier check e1" }],
			}),
		});
		const json = await res.json();
		expect(res.status, JSON.stringify(json)).toBe(200);
		expect(json.metadata.used_provider).toBe("nvidia");
	});

	test("poor nvidia uptime lets cloudflare win for a free org", async () => {
		await seedKeys(harness);
		await harness.setRoutingMetrics(MODEL, "nvidia", { uptime: 30 });
		const { res, json } = await send("tier check f1");
		expect(res.status, JSON.stringify(json)).toBe(200);
		expect(json.metadata.used_provider).toBe("cloudflare");
	});

	test("$0 org can call a free model and routes nvidia-first", async () => {
		// Credits mode resolves platform credentials from env vars, not BYOK
		// rows — point both stealth providers at the mock via their base-url
		// overrides.
		const saved = {
			LLM_NVIDIA_API_KEY: process.env.LLM_NVIDIA_API_KEY,
			LLM_NVIDIA_BASE_URL: process.env.LLM_NVIDIA_BASE_URL,
			LLM_CLOUDFLARE_API_KEY: process.env.LLM_CLOUDFLARE_API_KEY,
			LLM_CLOUDFLARE_BASE_URL: process.env.LLM_CLOUDFLARE_BASE_URL,
		};
		process.env.LLM_NVIDIA_API_KEY = "sk-test-key";
		process.env.LLM_NVIDIA_BASE_URL = `${harness.mockServerUrl}/v1`;
		process.env.LLM_CLOUDFLARE_API_KEY = "sk-test-key";
		process.env.LLM_CLOUDFLARE_BASE_URL = `${harness.mockServerUrl}/v1`;
		(models as ModelDefinition[]).push(FREE_TEST_MODEL);
		try {
			await harness.setProjectMode("credits");
			await harness.setOrganizationCredits("0");
			await db
				.update(tables.user)
				.set({ emailVerified: true })
				.where(eq(tables.user.id, "user-id"));
			// Free model + $0 credits only works with retention off — storage
			// is billed separately even when inference is free.
			await db
				.update(tables.organization)
				.set({ retentionLevel: "none" })
				.where(eq(tables.organization.id, "org-id"));
			await db.insert(tables.apiKey).values({
				id: "token-id-nvidia-tier",
				...hashApiKeyForStorage("test-token-nvidia-tier"),
				projectId: "project-id",
				createdBy: "user-id",
				description: "tier routing test key",
			});
			await harness.setRoutingMetrics(FREE_MODEL, "nvidia", {
				uptime: 100,
			});
			await harness.setRoutingMetrics(FREE_MODEL, "cloudflare", {
				uptime: 100,
			});
			const res = await app.request("/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer test-token-nvidia-tier",
				},
				body: JSON.stringify({
					model: FREE_MODEL,
					messages: [{ role: "user", content: "free tier check g1" }],
				}),
			});
			const json = await res.json();
			expect(res.status, JSON.stringify(json)).toBe(200);
			expect(json.metadata.used_provider).toBe("nvidia");
		} finally {
			models.splice((models as ModelDefinition[]).indexOf(FREE_TEST_MODEL), 1);
			for (const [key, value] of Object.entries(saved)) {
				if (value === undefined) {
					Reflect.deleteProperty(process.env, key);
				} else {
					process.env[key] = value;
				}
			}
		}
	});

	test("isOrganizationPaid reflects a completed credit_topup", async () => {
		await markPaid();
		expect(await isOrganizationPaid("org-id")).toBe(true);
	});
});
