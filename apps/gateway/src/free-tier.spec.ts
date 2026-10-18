import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { redisClient } from "@llmgateway/cache";
import { db, eq, tables } from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

import { app } from "./app.js";
import { createGatewayApiTestHarness } from "./test-utils/gateway-api-test-harness.js";
import { waitForLogByRequestId } from "./test-utils/test-helpers.js";

const TEST_ORGANIZATION_ID = "org-id";
const TOP_UP = "Top up $20 for unlimited access to full-speed models.";

// Every env credential the free pools read. The pools share the harness mock
// server except where a test swaps a base URL at the dedicated failing one.
const POOL_ENV = [
	"LLM_NVIDIA_FREE_API_KEY",
	"LLM_NVIDIA_FREE_BASE_URL",
	"LLM_OPENROUTER_FREE_API_KEY",
	"LLM_OPENROUTER_FREE_BASE_URL",
	"LLM_KILO_FREE_API_KEY",
	"LLM_KILO_FREE_BASE_URL",
	"LLM_OPENCODE_FREE_API_KEY",
	"LLM_OPENCODE_FREE_BASE_URL",
	"LLM_GROQ_API_KEY",
	"LLM_GROQ_FREE_BASE_URL",
	"LLM_GOOGLE_AI_STUDIO_API_KEY",
	"LLM_GOOGLE_FREE_BASE_URL",
] as const;

describe("free tier", () => {
	const harness = createGatewayApiTestHarness();

	let failingServer: Server;
	let failingServerUrl = "";
	let okBaseUrl = "";
	const savedEnv: Record<string, string | undefined> = {};

	beforeAll(async () => {
		failingServer = createServer((_req, res) => {
			res.writeHead(500, { "content-type": "application/json" });
			res.end(JSON.stringify({ error: { message: "pool is down" } }));
		});
		await new Promise<void>((resolve) => {
			failingServer.listen(0, "127.0.0.1", resolve);
		});
		const address = failingServer.address();
		if (!address || typeof address === "string") {
			throw new Error("Failed to bind failing mock server");
		}
		failingServerUrl = `http://127.0.0.1:${address.port}/v1`;
		okBaseUrl = `${harness.mockServerUrl}/v1`;

		for (const key of POOL_ENV) {
			savedEnv[key] = process.env[key];
		}
		process.env.LLM_NVIDIA_FREE_API_KEY = "free-test-key";
		process.env.LLM_NVIDIA_FREE_BASE_URL = okBaseUrl;
		process.env.LLM_OPENROUTER_FREE_API_KEY = "free-test-key";
		process.env.LLM_OPENROUTER_FREE_BASE_URL = okBaseUrl;
		process.env.LLM_KILO_FREE_API_KEY = "free-test-key";
		process.env.LLM_KILO_FREE_BASE_URL = okBaseUrl;
		process.env.LLM_OPENCODE_FREE_API_KEY = "free-test-key";
		process.env.LLM_OPENCODE_FREE_BASE_URL = okBaseUrl;
		process.env.LLM_GROQ_API_KEY = "free-test-key";
		process.env.LLM_GROQ_FREE_BASE_URL = okBaseUrl;
		process.env.LLM_GOOGLE_AI_STUDIO_API_KEY = "free-test-key";
		process.env.LLM_GOOGLE_FREE_BASE_URL = okBaseUrl;
	});

	afterAll(async () => {
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value !== undefined) {
				process.env[key] = value;
			} else {
				Reflect.deleteProperty(process.env, key);
			}
		}
		await new Promise<void>((resolve, reject) => {
			failingServer.close((err) => (err ? reject(err) : resolve()));
		});
	});

	async function setupFreeOrg(token: string, credits = "0") {
		await harness.setProjectMode("credits");
		await harness.setOrganizationCredits(credits);
		// Free models require a verified email address.
		await db
			.update(tables.user)
			.set({ emailVerified: true })
			.where(eq(tables.user.id, "user-id"));
		await db.insert(tables.apiKey).values({
			id: `${token}-id`,
			...hashApiKeyForStorage(token),
			projectId: "project-id",
			description: "Free tier test key",
			createdBy: "user-id",
		});
	}

	function postFreeCompletion(
		token: string,
		model: string,
		content: string,
		extra: Record<string, unknown> = {},
		requestId = content.slice(0, 64),
	) {
		return app.request("/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
				"x-request-id": requestId,
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content }],
				...extra,
			}),
		});
	}

	test("zero-balance org gets a free response at $0 with the pool masked", async () => {
		await setupFreeOrg("free-token-basic");
		const requestId = "free-basic-request";
		const res = await postFreeCompletion(
			"free-token-basic",
			"gpt-oss-20b-free",
			"hello free tier",
			{},
			requestId,
		);

		expect(res.status).toBe(200);
		const json = (await res.json()) as any;
		// The response carries the bare model id and the public pool label —
		// never an upstream provider id.
		expect(json.model).toBe("gpt-oss-20b-free");
		expect(json.metadata?.used_provider).toBe("vichar");
		expect(JSON.stringify(json)).not.toMatch(
			/(nvidia|openrouter|opencode|kilo|groq|google)-free/,
		);

		const log = await waitForLogByRequestId(requestId);
		expect(log.usedProvider).toBe("nvidia-free");
		expect(Number(log.cost)).toBe(0);

		const org = await db.query.organization.findFirst({
			where: { id: { eq: TEST_ORGANIZATION_ID } },
		});
		expect(Number(org?.credits)).toBe(0);
	});

	test("fallback to the next pool keeps working and stays masked", async () => {
		await setupFreeOrg("free-token-fallback");
		// nvidia-free fails, so nemotron-3-ultra-free must fall back to
		// openrouter-free (second leg, highest remaining priority).
		process.env.LLM_NVIDIA_FREE_BASE_URL = failingServerUrl;
		try {
			const res = await postFreeCompletion(
				"free-token-fallback",
				"nemotron-3-ultra-free",
				"fallback check",
			);
			expect(res.status).toBe(200);
			const json = (await res.json()) as any;
			expect(json.metadata?.used_provider).toBe("vichar");
			const routing = json.metadata?.routing ?? [];
			for (const attempt of routing) {
				expect(attempt.provider).toBe("vichar");
			}
		} finally {
			process.env.LLM_NVIDIA_FREE_BASE_URL = okBaseUrl;
		}
	});

	test("a free model walks every leg to reach the last-resort one", async () => {
		await setupFreeOrg("free-token-lastleg");
		// nemotron-3-super-free has five legs (nvidia-free → nvidia →
		// openrouter-free → kilo-free → cloudflare). The default retry budget
		// (2) would stop after three attempts and never reach cloudflare; free
		// models get a budget equal to their leg count, so every pool and the
		// stealth upstreams are failed while cloudflare serves.
		const failing = {
			LLM_NVIDIA_FREE_BASE_URL: failingServerUrl,
			LLM_OPENROUTER_FREE_BASE_URL: failingServerUrl,
			LLM_KILO_FREE_BASE_URL: failingServerUrl,
			LLM_NVIDIA_BASE_URL: failingServerUrl,
		};
		const serving = {
			LLM_NVIDIA_API_KEY: "free-test-key",
			LLM_CLOUDFLARE_API_KEY: "free-test-key",
			LLM_CLOUDFLARE_BASE_URL: okBaseUrl,
		};
		const touched = { ...failing, ...serving } as const;
		const saved: Record<string, string | undefined> = {};
		for (const key of Object.keys(touched)) {
			saved[key] = process.env[key];
		}
		Object.assign(process.env, touched);
		try {
			const requestId = "free-last-leg-request";
			const res = await postFreeCompletion(
				"free-token-lastleg",
				"nemotron-3-super-free",
				"last leg check",
				{},
				requestId,
			);
			expect(res.status).toBe(200);
			const json = (await res.json()) as any;
			expect(json.metadata?.used_provider).toBe("vichar");
			const routing = json.metadata?.routing ?? [];
			for (const attempt of routing) {
				expect(attempt.provider).toBe("vichar");
			}
			expect(JSON.stringify(json)).not.toMatch(
				/(nvidia|openrouter|opencode|kilo|groq|google)-free|"cloudflare"|"nvidia"/,
			);
			const log = await waitForLogByRequestId(requestId);
			expect(log.usedProvider).toBe("cloudflare");
			expect(Number(log.cost)).toBe(0);
		} finally {
			for (const [key, value] of Object.entries(saved)) {
				if (value === undefined) {
					Reflect.deleteProperty(process.env, key);
				} else {
					process.env[key] = value;
				}
			}
		}
	});

	test("a total pool outage returns a masked error", async () => {
		await setupFreeOrg("free-token-outage");
		const baseUrlKeys = [
			"LLM_NVIDIA_FREE_BASE_URL",
			"LLM_OPENROUTER_FREE_BASE_URL",
			"LLM_KILO_FREE_BASE_URL",
			"LLM_OPENCODE_FREE_BASE_URL",
			"LLM_GROQ_FREE_BASE_URL",
			"LLM_GOOGLE_FREE_BASE_URL",
		] as const;
		for (const key of baseUrlKeys) {
			process.env[key] = failingServerUrl;
		}
		try {
			const res = await postFreeCompletion(
				"free-token-outage",
				"gpt-oss-20b-free",
				"outage check",
			);
			expect(res.status).toBeGreaterThanOrEqual(500);
			const json = (await res.json()) as any;
			expect(json.error).toBeTruthy();
			expect(JSON.stringify(json)).not.toMatch(
				/(nvidia|openrouter|opencode|kilo|groq|google)-free/,
			);
		} finally {
			for (const key of baseUrlKeys) {
				process.env[key] = okBaseUrl;
			}
		}
	});

	test("rejects max_tokens above the free-tier output cap", async () => {
		await setupFreeOrg("free-token-maxout");
		const res = await postFreeCompletion(
			"free-token-maxout",
			"gpt-oss-20b-free",
			"big answer please",
			{ max_tokens: 4097 },
		);
		expect(res.status).toBe(400);
		const json = (await res.json()) as any;
		expect(json.error.message).toContain(TOP_UP);
	});

	test("rejects prompts above the 32k input cap", async () => {
		await setupFreeOrg("free-token-bigprompt");
		// ~45k tokens of English prose.
		const bigPrompt = "the quick brown fox jumps over the lazy dog ".repeat(
			3200,
		);
		const res = await postFreeCompletion(
			"free-token-bigprompt",
			"gpt-oss-20b-free",
			bigPrompt,
		);
		expect(res.status).toBe(400);
		const json = (await res.json()) as any;
		expect(json.error.message).toContain(TOP_UP);
	});

	test("enforces the 10-per-minute aggregate cap", async () => {
		await setupFreeOrg("free-token-rpm");
		for (let i = 0; i < 10; i++) {
			const res = await postFreeCompletion(
				"free-token-rpm",
				"gpt-oss-20b-free",
				`rpm check ${i}`,
			);
			expect(res.status).toBe(200);
		}
		const res = await postFreeCompletion(
			"free-token-rpm",
			"gpt-oss-20b-free",
			"rpm check overflow",
		);
		expect(res.status).toBe(429);
		const json = (await res.json()) as any;
		expect(json.error.message).toContain("10 requests per minute");
		expect(json.error.message).toContain(TOP_UP);
		expect(res.headers.get("Retry-After")).toBeTruthy();
		expect(res.headers.get("RateLimit-Policy")).toContain("100;w=86400");
	});

	test("enforces the 100-per-day aggregate cap", async () => {
		await setupFreeOrg("free-token-daily");
		// Seed a full daily window so the very next free request is blocked.
		// The window is org-aggregate, so the model choice does not matter.
		const now = Date.now();
		const scoreMembers = Array.from({ length: 100 }, (_, i) => [
			now,
			`${now}:${i}`,
		]).flat();
		await redisClient.zadd(
			`rate_limit:free_model_daily:${TEST_ORGANIZATION_ID}`,
			...scoreMembers,
		);

		const res = await postFreeCompletion(
			"free-token-daily",
			"gpt-oss-20b-free",
			"daily cap check",
		);
		expect(res.status).toBe(429);
		const json = (await res.json()) as any;
		expect(json.error.message).toContain("100 requests per day");
		expect(json.error.message).toContain(TOP_UP);
	});

	test("v1/models hides pool providers and shows zero pricing", async () => {
		// The catalogue is public — no API key needed.
		const res = await app.request("/v1/models");
		expect(res.status).toBe(200);
		const json = (await res.json()) as any;
		const entry = json.data.find(
			(model: { id: string }) => model.id === "gpt-oss-20b-free",
		);
		expect(entry).toBeTruthy();
		expect(entry.free).toBe(true);
		expect(Number(entry.pricing.prompt)).toBe(0);
		expect(Number(entry.pricing.completion)).toBe(0);
		const providerIds = entry.providers.map(
			(provider: { providerId: string }) => provider.providerId,
		);
		expect(providerIds.length).toBeGreaterThan(0);
		expect(new Set(providerIds)).toEqual(new Set(["vichar"]));
		expect(JSON.stringify(entry)).not.toMatch(
			/(nvidia|openrouter|opencode|kilo|groq|google)-free/,
		);
	});

	test("v1/models mapped view exposes no provider-pinned pool id", async () => {
		const res = await app.request("/v1/models?mapped=true");
		expect(res.status).toBe(200);
		const json = (await res.json()) as any;
		const freeEntries = json.data.filter((model: { id: string }) =>
			model.id.includes("gpt-oss-20b-free"),
		);
		expect(freeEntries).toHaveLength(1);
		expect(freeEntries[0].id).toBe("gpt-oss-20b-free");
		expect(JSON.stringify(freeEntries)).not.toMatch(
			/(nvidia|openrouter|opencode|kilo|groq|google)-free/,
		);
	});
});
