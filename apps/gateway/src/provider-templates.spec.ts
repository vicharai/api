import { generateKeyPairSync } from "node:crypto";
import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { encryptProviderKeyForStorage } from "@llmgateway/actions";
import { db, eq, tables } from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

import { app } from "./app.js";
import { createGatewayApiTestHarness } from "./test-utils/gateway-api-test-harness.js";
import {
	clearCache,
	waitForLogByRequestId,
} from "./test-utils/test-helpers.js";

import type { ProviderTemplateId } from "@llmgateway/shared";

interface CapturedRequest {
	url: string;
	headers: Record<string, string | string[] | undefined>;
	body: Record<string, unknown>;
}

const TOKEN = "provider-templates-token";
const CARRIER = "acme-templated";
const MODEL = "acme-templated-1";
const UPSTREAM_KEY = "mock-templated-key";

const anthropicMessage = {
	id: "msg_1",
	type: "message",
	role: "assistant",
	model: "claude-upstream",
	content: [{ type: "text", text: "Hello from Messages" }],
	stop_reason: "end_turn",
	usage: { input_tokens: 1000, output_tokens: 500 },
};

const anthropicStream = [
	{
		type: "message_start",
		message: {
			...anthropicMessage,
			content: [],
			stop_reason: null,
			usage: { input_tokens: 1000, output_tokens: 1 },
		},
	},
	{
		type: "content_block_start",
		index: 0,
		content_block: { type: "text", text: "" },
	},
	{
		type: "content_block_delta",
		index: 0,
		delta: { type: "text_delta", text: "Hello from Messages" },
	},
	{ type: "content_block_stop", index: 0 },
	{
		type: "message_delta",
		delta: { stop_reason: "end_turn" },
		usage: { output_tokens: 500 },
	},
	{ type: "message_stop" },
]
	.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
	.join("");

const geminiResponse = {
	candidates: [
		{
			content: { role: "model", parts: [{ text: "Hello from Gemini" }] },
			finishReason: "STOP",
			index: 0,
		},
	],
	usageMetadata: {
		promptTokenCount: 1000,
		candidatesTokenCount: 500,
		totalTokenCount: 1500,
	},
};

const openaiResponse = {
	id: "chatcmpl-templated",
	object: "chat.completion",
	model: "deployment",
	choices: [
		{
			index: 0,
			message: { role: "assistant", content: "Hello from Azure" },
			finish_reason: "stop",
		},
	],
	usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
};

const bedrockResponse = {
	output: {
		message: { role: "assistant", content: [{ text: "Hello from Bedrock" }] },
	},
	stopReason: "end_turn",
	usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
};

/**
 * Custom providers created with a template speak that built-in provider's
 * API: these tests seed one the way /admin/catalog writes it and check the
 * request shape and response parsing against a local mock upstream.
 */
describe("templated custom providers", () => {
	createGatewayApiTestHarness();

	let upstream: Server;
	let upstreamUrl = "";
	let captured: CapturedRequest[] = [];
	let tokenExchanges = 0;

	beforeAll(async () => {
		upstream = createServer((req, res) => {
			let raw = "";
			req.on("data", (chunk) => (raw += chunk));
			req.on("end", () => {
				const url = req.url ?? "";
				const json = (payload: unknown) => {
					res.writeHead(200, { "content-type": "application/json" });
					res.end(JSON.stringify(payload));
				};
				if (url === "/token") {
					tokenExchanges++;
					json({ access_token: "ya29.mock-access-token", expires_in: 3600 });
					return;
				}
				captured.push({
					url,
					headers: req.headers,
					body: JSON.parse(raw || "{}") as Record<string, unknown>,
				});
				const sse = (payload: string) => {
					res.writeHead(200, { "content-type": "text/event-stream" });
					res.end(payload);
				};
				if (url.startsWith("/v1/messages") || url.endsWith(":rawPredict")) {
					const stream = (JSON.parse(raw) as { stream?: boolean }).stream;
					if (stream) {
						sse(anthropicStream);
						return;
					}
					json(anthropicMessage);
					return;
				}
				if (url.includes(":embedContent")) {
					json({ embedding: { values: [0.1, 0.2] } });
					return;
				}
				if (url.includes(":streamGenerateContent")) {
					sse(`data: ${JSON.stringify(geminiResponse)}\n\n`);
					return;
				}
				if (url.includes(":generateContent")) {
					json(geminiResponse);
					return;
				}
				if (url.includes("/converse")) {
					json(bedrockResponse);
					return;
				}
				json(openaiResponse);
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

	async function seed(
		template: ProviderTemplateId,
		externalId: string,
		config: Record<string, string> = {},
		upstreamKey = UPSTREAM_KEY,
		output = ["text"],
	) {
		captured = [];
		await db.insert(tables.apiKey).values({
			id: `${TOKEN}-id`,
			...hashApiKeyForStorage(TOKEN),
			projectId: "project-id",
			description: "Provider templates test key",
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
			.values({ id: CARRIER, name: "Acme Templated", description: "" })
			.onConflictDoNothing();
		await db.insert(tables.providerClaim).values({
			providerCompanyId: "platform-catalog",
			providerId: CARRIER,
			kind: "custom",
			matchedDomain: "localhost",
			customName: "Acme Templated",
			customBaseUrl: upstreamUrl,
			customTemplate: template,
			status: "active",
		});
		await db.insert(tables.providerKey).values({
			id: `${TOKEN}-managed-key`,
			managed: true,
			organizationId: null,
			provider: CARRIER,
			config,
			...encryptProviderKeyForStorage(
				upstreamKey,
				`${TOKEN}-managed-key`,
				null,
			),
		});
		await db.insert(tables.model).values({
			id: MODEL,
			name: "Acme Templated",
			family: "acme",
			output,
		});
		await db.insert(tables.modelProviderMapping).values({
			modelId: MODEL,
			providerId: CARRIER,
			externalId,
			source: "airside",
			status: "active",
			inputPrice: "3e-6",
			outputPrice: "9e-6",
			contextSize: 64000,
			maxOutput: 4096,
			streaming: true,
			tools: true,
		});
		await clearCache();
	}

	let requestCount = 0;
	async function chat(extra: Record<string, unknown> = {}) {
		requestCount++;
		return await app.request("/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${TOKEN}`,
				"x-no-fallback": "true",
				"x-request-id": `templated-${Date.now()}-${requestCount}`,
			},
			body: JSON.stringify({
				model: `${CARRIER}/${MODEL}`,
				messages: [
					{ role: "system", content: "Be brief." },
					{ role: "user", content: `Say hi ${Date.now()}` },
				],
				...extra,
			}),
		});
	}

	async function expectBilled(res: Response) {
		const log = await waitForLogByRequestId(res.headers.get("x-request-id")!);
		expect(log?.usedProvider).toBe(CARRIER);
		// 1000 tokens at $3/M in + 500 tokens at $9/M out.
		expect(Number(log?.inputCost)).toBeCloseTo(0.003, 6);
		expect(Number(log?.outputCost)).toBeCloseTo(0.0045, 6);
	}

	test("anthropic template speaks the Messages API", async () => {
		await seed("anthropic", "claude-upstream");
		const res = await chat();
		expect(res.status, await res.clone().text()).toBe(200);
		const json = (await res.json()) as {
			choices: { message: { content: string } }[];
			usage: { prompt_tokens: number; completion_tokens: number };
		};
		expect(json.choices[0].message.content).toBe("Hello from Messages");
		expect(json.usage).toMatchObject({
			prompt_tokens: 1000,
			completion_tokens: 500,
		});

		expect(captured).toHaveLength(1);
		expect(captured[0].url).toBe("/v1/messages");
		expect(captured[0].headers["x-api-key"]).toBe(UPSTREAM_KEY);
		expect(captured[0].headers["anthropic-version"]).toBe("2023-06-01");
		expect(captured[0].headers.authorization).toBeUndefined();
		expect(captured[0].body.model).toBe("claude-upstream");
		expect(captured[0].body.system).toBeDefined();
		expect(captured[0].body.max_tokens).toBeGreaterThan(0);
		await expectBilled(res);
	});

	test("anthropic template streams and bills from the Messages events", async () => {
		await seed("anthropic", "claude-upstream");
		const res = await chat({ stream: true });
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toContain("Hello from Messages");
		expect(text).toContain("[DONE]");
		expect(captured[0].body.stream).toBe(true);
		await expectBilled(res);
	});

	test("google-ai-studio template speaks generateContent with ?key=", async () => {
		await seed("google-ai-studio", "gemini-upstream");
		const res = await chat();
		expect(res.status, await res.clone().text()).toBe(200);
		const json = (await res.json()) as {
			choices: { message: { content: string } }[];
		};
		expect(json.choices[0].message.content).toBe("Hello from Gemini");
		expect(captured[0].url).toBe(
			`/v1beta/models/gemini-upstream:generateContent?key=${UPSTREAM_KEY}`,
		);
		expect(captured[0].headers.authorization).toBeUndefined();
		expect(Array.isArray(captured[0].body.contents)).toBe(true);
		await expectBilled(res);
	});

	test("google-ai-studio template streams over SSE", async () => {
		await seed("google-ai-studio", "gemini-upstream");
		const res = await chat({ stream: true });
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("Hello from Gemini");
		expect(captured[0].url).toBe(
			`/v1beta/models/gemini-upstream:streamGenerateContent?key=${UPSTREAM_KEY}&alt=sse`,
		);
		await expectBilled(res);
	});

	test("google-vertex template builds the project/region publisher path", async () => {
		await seed("google-vertex", "gemini-upstream", {
			tokenType: "api-key",
			project: "acme-project",
			region: "us-central1",
		});
		const res = await chat();
		expect(res.status, await res.clone().text()).toBe(200);
		expect(captured[0].url).toBe(
			`/v1/projects/acme-project/locations/us-central1/publishers/google/models/gemini-upstream:generateContent?key=${UPSTREAM_KEY}`,
		);
		await expectBilled(res);
	});

	test("vertex-anthropic template exchanges the service account and calls rawPredict", async () => {
		const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const serviceAccount = JSON.stringify({
			type: "service_account",
			project_id: "acme-project",
			client_email: `templated-${Date.now()}@acme-project.iam.gserviceaccount.com`,
			private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
			token_uri: `${upstreamUrl}/token`,
		});
		await seed(
			"vertex-anthropic",
			"claude-upstream@20250929",
			{ project: "acme-project", region: "global" },
			serviceAccount,
		);
		tokenExchanges = 0;
		const res = await chat();
		expect(res.status, await res.clone().text()).toBe(200);
		expect(tokenExchanges).toBe(1);
		expect(captured[0].url).toBe(
			"/v1/projects/acme-project/locations/global/publishers/anthropic/models/claude-upstream@20250929:rawPredict",
		);
		expect(captured[0].headers.authorization).toBe(
			"Bearer ya29.mock-access-token",
		);
		expect(captured[0].body.anthropic_version).toBeDefined();
		await expectBilled(res);
	});

	test("azure template uses the deployment path and api-key header", async () => {
		await seed("azure", "my-deployment", {
			deploymentType: "openai",
			apiVersion: "2024-10-21",
		});
		const res = await chat();
		expect(res.status, await res.clone().text()).toBe(200);
		expect(captured[0].url).toBe(
			"/openai/deployments/my-deployment/chat/completions?api-version=2024-10-21",
		);
		expect(captured[0].headers["api-key"]).toBe(UPSTREAM_KEY);
		expect(captured[0].headers.authorization).toBeUndefined();
		await expectBilled(res);
	});

	test("aws-bedrock template calls Converse with the profile prefix", async () => {
		await seed("aws-bedrock", "anthropic.claude-upstream-v1:0", {
			awsRegion: "us-east-1",
			region: "eu.",
		});
		const res = await chat();
		expect(res.status, await res.clone().text()).toBe(200);
		const json = (await res.json()) as {
			choices: { message: { content: string } }[];
		};
		expect(json.choices[0].message.content).toBe("Hello from Bedrock");
		expect(captured[0].url).toBe(
			"/model/eu.anthropic.claude-upstream-v1:0/converse",
		);
		expect(captured[0].headers.authorization).toBe(`Bearer ${UPSTREAM_KEY}`);
		expect(Array.isArray(captured[0].body.messages)).toBe(true);
		await expectBilled(res);
	});

	async function embed() {
		return await app.request("/v1/embeddings", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({ model: `${CARRIER}/${MODEL}`, input: "embed me" }),
		});
	}

	test("google-ai-studio template embeds through embedContent", async () => {
		await seed("google-ai-studio", "embed-upstream", {}, UPSTREAM_KEY, [
			"embedding",
		]);
		const res = await embed();
		expect(res.status, await res.clone().text()).toBe(200);
		expect(captured[0].url).toBe(
			`/v1beta/models/embed-upstream:embedContent?key=${UPSTREAM_KEY}`,
		);
		expect(captured[0].headers.authorization).toBeUndefined();
	});

	test("templates without an embeddings API reject embedding models", async () => {
		await seed("anthropic", "embed-upstream", {}, UPSTREAM_KEY, ["embedding"]);
		const res = await embed();
		expect(res.status).toBe(400);
		expect(captured).toHaveLength(0);
	});

	test("openai-compatible template keeps the chat completions route", async () => {
		await seed("openai-compatible", "plain-upstream");
		const res = await chat();
		expect(res.status, await res.clone().text()).toBe(200);
		expect(captured[0].url).toBe("/v1/chat/completions");
		expect(captured[0].headers.authorization).toBe(`Bearer ${UPSTREAM_KEY}`);
		expect(captured[0].body.model).toBe("plain-upstream");
		await expectBilled(res);
	});
});
