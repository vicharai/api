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
import { db, eq, inArray, tables } from "@llmgateway/db";
import { PROVIDER_TEMPLATE_IDS } from "@llmgateway/shared";

const PROVIDER_ID = "acme-templated";
const MODEL_ID = "acme-templated-1";

interface CapturedRequest {
	method: string;
	url: string;
	headers: Record<string, string | string[] | undefined>;
}

interface CatalogProvider {
	id: string;
	baseUrl: string | null;
	template: string | null;
	options: Record<string, string>;
}

describe("admin catalog provider templates", () => {
	let cookie: string;
	let upstream: Server;
	let upstreamUrl = "";
	let captured: CapturedRequest[] = [];

	beforeAll(async () => {
		upstream = createServer((req, res) => {
			captured.push({
				method: req.method ?? "",
				url: req.url ?? "",
				headers: req.headers,
			});
			req.resume();
			req.on("end", () => {
				res.writeHead(200, { "content-type": "application/json" });
				if (req.url?.startsWith("/v1/models")) {
					res.end(JSON.stringify({ data: [{ id: "claude-upstream" }] }));
					return;
				}
				if (req.url?.startsWith("/v1beta/models")) {
					res.end(
						JSON.stringify({ models: [{ name: "models/gemini-upstream" }] }),
					);
					return;
				}
				res.end(
					JSON.stringify({
						output: {
							message: { role: "assistant", content: [{ text: "hi" }] },
						},
						stopReason: "end_turn",
						usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
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

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		captured = [];
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await db
			.delete(tables.modelProviderMapping)
			.where(eq(tables.modelProviderMapping.modelId, MODEL_ID));
		await db.delete(tables.model).where(eq(tables.model.id, MODEL_ID));
		await deleteAll();
		await db
			.delete(tables.provider)
			.where(inArray(tables.provider.id, [PROVIDER_ID]));
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

	async function create(body: Record<string, unknown>) {
		return await request("POST", "/providers", {
			id: PROVIDER_ID,
			name: "Acme Templated",
			apiKey: "sk-templated-key",
			...body,
		});
	}

	async function providerOf(res: Response): Promise<CatalogProvider> {
		return ((await res.json()) as { provider: CatalogProvider }).provider;
	}

	async function activeCredential() {
		return await db.query.providerKey.findFirst({
			where: {
				provider: { eq: PROVIDER_ID },
				managed: { eq: true },
				status: { eq: "active" },
			},
		});
	}

	test("lists every template", async () => {
		const res = await request("GET", "/provider-templates");
		expect(res.status).toBe(200);
		const { templates } = (await res.json()) as {
			templates: { id: string; optionFields: unknown[] }[];
		};
		expect(templates.map((template) => template.id)).toEqual([
			...PROVIDER_TEMPLATE_IDS,
		]);
	});

	test("defaults to the OpenAI-compatible template", async () => {
		const res = await create({ baseUrl: upstreamUrl });
		expect(res.status).toBe(201);
		expect(await providerOf(res)).toMatchObject({
			template: "openai-compatible",
			options: {},
		});
	});

	test("creates an anthropic provider on its default base URL", async () => {
		const res = await create({ template: "anthropic" });
		expect(res.status, await res.clone().text()).toBe(201);
		expect(await providerOf(res)).toMatchObject({
			template: "anthropic",
			baseUrl: "https://api.anthropic.com",
		});
		const claim = await db.query.providerClaim.findFirst({
			where: { providerId: { eq: PROVIDER_ID } },
		});
		expect(claim?.customTemplate).toBe("anthropic");
	});

	test("derives the Azure base URL and stores settings on the credential", async () => {
		const res = await create({
			template: "azure",
			options: { resource: "acme-resource", apiVersion: "2025-01-01-preview" },
		});
		expect(res.status, await res.clone().text()).toBe(201);
		expect(await providerOf(res)).toMatchObject({
			baseUrl: "https://acme-resource.openai.azure.com",
			options: {
				resource: "acme-resource",
				deploymentType: "openai",
				apiVersion: "2025-01-01-preview",
			},
		});
		const credential = await activeCredential();
		expect(readProviderKey(credential!)).toBe("sk-templated-key");
		expect(credential?.config).toMatchObject({ resource: "acme-resource" });

		// A derived base URL follows the settings...
		const moved = await request("PATCH", `/providers/${PROVIDER_ID}`, {
			options: { resource: "other-resource" },
		});
		expect(moved.status).toBe(200);
		expect((await providerOf(moved)).baseUrl).toBe(
			"https://other-resource.openai.azure.com",
		);
		expect((await activeCredential())?.config).toMatchObject({
			resource: "other-resource",
		});

		// ...one the admin typed in stays put.
		await request("PATCH", `/providers/${PROVIDER_ID}`, {
			baseUrl: "https://azure-proxy.example.com",
		});
		const kept = await request("PATCH", `/providers/${PROVIDER_ID}`, {
			options: { resource: "third-resource" },
		});
		expect((await providerOf(kept)).baseUrl).toBe(
			"https://azure-proxy.example.com",
		);

		// Rotating the key keeps the settings.
		await request("PATCH", `/providers/${PROVIDER_ID}`, {
			apiKey: "sk-rotated",
		});
		const rotated = await activeCredential();
		expect(readProviderKey(rotated!)).toBe("sk-rotated");
		expect(rotated?.config).toMatchObject({ resource: "third-resource" });
	});

	test("validates settings against the template", async () => {
		const cases: Record<string, unknown>[] = [
			{ template: "azure", options: {} },
			{ template: "azure", options: { resource: "evil.example.com/x" } },
			{ template: "anthropic", options: { region: "us" } },
			{ template: "google-vertex", options: { tokenType: "oauth" } },
			{ template: "aws-bedrock", options: { region: "mars." } },
			{ template: "vertex-anthropic", options: { project: "acme-project" } },
			{
				template: "vertex-anthropic",
				options: { project: "acme-project" },
				apiKey: JSON.stringify({ type: "service_account" }),
			},
		];
		for (const body of cases) {
			const res = await create(body);
			expect(res.status, JSON.stringify(body)).toBe(400);
		}
		expect(
			await db.query.providerClaim.findFirst({
				where: { providerId: { eq: PROVIDER_ID } },
			}),
		).toBeUndefined();
	});

	test("rejects an unsafe service-account token_uri", async () => {
		vi.stubEnv("ALLOW_INSECURE_PROVIDER_URLS", "false");
		const res = await create({
			template: "vertex-anthropic",
			options: { project: "acme-project" },
			apiKey: JSON.stringify({
				client_email: "sa@acme-project.iam.gserviceaccount.com",
				private_key: "-----BEGIN PRIVATE KEY-----",
				token_uri: "http://169.254.169.254/token",
			}),
		});
		expect(res.status).toBe(400);
	});

	test("tests an anthropic provider by listing models with x-api-key", async () => {
		await create({ template: "anthropic", baseUrl: upstreamUrl });
		const res = await request("POST", `/providers/${PROVIDER_ID}/test`);
		expect(await res.json()).toMatchObject({
			ok: true,
			models: ["claude-upstream"],
			error: null,
		});
		expect(captured[0].url).toBe("/v1/models");
		expect(captured[0].headers["x-api-key"]).toBe("sk-templated-key");
		expect(captured[0].headers.authorization).toBeUndefined();
	});

	test("tests a Gemini provider with the ?key= listing", async () => {
		await create({ template: "google-ai-studio", baseUrl: upstreamUrl });
		const res = await request("POST", `/providers/${PROVIDER_ID}/test`);
		expect(await res.json()).toMatchObject({
			ok: true,
			models: ["gemini-upstream"],
		});
		expect(captured[0].url).toBe("/v1beta/models?key=sk-templated-key");
	});

	test("tests a Bedrock provider with one Converse call on a mapped model", async () => {
		await create({
			template: "aws-bedrock",
			baseUrl: upstreamUrl,
			options: { region: "us." },
		});
		const unmapped = await request("POST", `/providers/${PROVIDER_ID}/test`);
		expect(await unmapped.json()).toMatchObject({ ok: false, models: null });
		expect(captured).toHaveLength(0);

		const model = await request("POST", "/models", {
			id: MODEL_ID,
			name: "Acme Templated",
			family: "acme",
			output: "text",
			mappings: [
				{
					providerId: PROVIDER_ID,
					externalId: "anthropic.claude-upstream-v1:0",
					inputPrice: "3e-6",
					outputPrice: "9e-6",
					streaming: true,
				},
			],
		});
		expect(model.status, await model.clone().text()).toBe(201);
		const res = await request("POST", `/providers/${PROVIDER_ID}/test`);
		expect(await res.json()).toMatchObject({
			ok: true,
			models: ["anthropic.claude-upstream-v1:0"],
		});
		expect(captured[0].method).toBe("POST");
		expect(captured[0].url).toBe(
			"/model/us.anthropic.claude-upstream-v1:0/converse",
		);
		expect(captured[0].headers.authorization).toBe("Bearer sk-templated-key");
	});

	test("switching template replaces the settings", async () => {
		await create({ template: "anthropic", baseUrl: upstreamUrl });
		const res = await request("PATCH", `/providers/${PROVIDER_ID}`, {
			template: "aws-bedrock",
		});
		expect(res.status, await res.clone().text()).toBe(200);
		expect(await providerOf(res)).toMatchObject({
			template: "aws-bedrock",
			baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
			options: { awsRegion: "us-east-1", region: "global." },
		});
	});
});
