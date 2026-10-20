import { createServer, type Server } from "node:http";

import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { and, db, eq, inArray, tables } from "@llmgateway/db";

const OPENAI_PROVIDER = "acme-quick";
const ANTHROPIC_PROVIDER = "acme-quick-msg";
const BEDROCK_PROVIDER = "acme-quick-bedrock";
const PROVIDER_IDS = [OPENAI_PROVIDER, ANTHROPIC_PROVIDER, BEDROCK_PROVIDER];
const MODEL_IDS = [
	"acme-chat",
	"acme-mini",
	"acme-gone",
	"acme-csv",
	"acme-csv-2",
	"gpt-4o-clone",
	"acme-chat-clone",
];
const PASSWORD_HASH =
	"c11ef27a7f9264be08db228ebb650888:a4d985a9c6bd98608237fd507534424950aa7fc255930d972242b81cbe78594f8568feb0d067e95ddf7be242ad3e9d013f695f4414fce68bfff091079f1dc460";

interface Mapping {
	providerId: string;
	externalId: string;
	region: string | null;
	inputPrice: string | null;
	outputPrice: string | null;
	cachedInputPrice: string | null;
	contextSize: number | null;
	vision: boolean | null;
	tools: boolean | null;
	managed: boolean;
	overridesBuiltin: boolean;
}

interface Model {
	id: string;
	name: string;
	family: string;
	managed: boolean;
	mappings: Mapping[];
}

interface Discovered {
	externalId: string;
	displayName: string | null;
	suggestedModelId: string;
	contextSize: number | null;
	maxOutput: number | null;
	inputPrice: string | null;
	outputPrice: string | null;
	cachedInputPrice: string | null;
	existing: { modelId: string; providerId: string } | null;
}

interface ImportReport {
	applied: boolean;
	summary: Record<string, number>;
	rows: {
		row: number;
		modelId: string;
		model: string | null;
		mapping: string | null;
		errors: string[];
	}[];
}

interface PriceReport {
	applied: boolean;
	matched: number;
	changed: number;
	rows: {
		modelId: string;
		providerId: string;
		before: Record<string, string | null>;
		after: Record<string, string | null>;
		changed: boolean;
	}[];
}

async function call(
	cookie: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<Response> {
	return await app.request(`/admin/catalog${path}`, {
		method,
		headers: {
			Cookie: cookie,
			...(body === undefined ? {} : { "Content-Type": "application/json" }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

describe("admin catalog quick tools", () => {
	let cookie: string;
	let upstream: Server;
	let upstreamUrl = "";
	let seeded: { model: boolean; provider: boolean };

	beforeAll(async () => {
		upstream = createServer((req, res) => {
			res.writeHead(200, { "content-type": "application/json" });
			if (req.headers["x-api-key"]) {
				res.end(
					JSON.stringify({
						data: [
							{
								type: "model",
								id: "claude-upstream-1",
								display_name: "Claude Upstream",
							},
						],
					}),
				);
				return;
			}
			res.end(
				JSON.stringify({
					data: [
						{
							id: "acme/acme-chat",
							name: "Acme: Chat",
							context_length: 131072,
							pricing: {
								prompt: "0.0000025",
								completion: "0.00001",
								input_cache_read: "0.00000125",
							},
							top_provider: { max_completion_tokens: 8192 },
						},
						{ id: "acme/acme-mini", pricing: { prompt: "-1" } },
						{ id: "gpt-4o" },
					],
				}),
			);
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
		seeded = {
			model: Boolean(
				await db.query.model.findFirst({ where: { id: { eq: "gpt-4o" } } }),
			),
			provider: Boolean(
				await db.query.provider.findFirst({ where: { id: { eq: "openai" } } }),
			),
		};
	});

	afterEach(async () => {
		await db
			.delete(tables.modelProviderMapping)
			.where(inArray(tables.modelProviderMapping.modelId, MODEL_IDS));
		await db
			.delete(tables.modelProviderMapping)
			.where(
				and(
					eq(tables.modelProviderMapping.modelId, "gpt-4o"),
					eq(tables.modelProviderMapping.source, "airside"),
				),
			);
		await db.delete(tables.model).where(inArray(tables.model.id, MODEL_IDS));
		if (!seeded.model) {
			await db.delete(tables.model).where(eq(tables.model.id, "gpt-4o"));
		}
		if (!seeded.provider) {
			await db.delete(tables.provider).where(eq(tables.provider.id, "openai"));
		}
		await deleteAll();
		await db
			.delete(tables.provider)
			.where(inArray(tables.provider.id, PROVIDER_IDS));
	});

	const request = (method: string, path: string, body?: unknown) =>
		call(cookie, method, path, body);

	async function createProvider(
		id: string,
		template: string,
		extra: Record<string, unknown> = {},
	) {
		const res = await request("POST", "/providers", {
			id,
			name: id,
			template,
			baseUrl: upstreamUrl,
			apiKey: `sk-${id}`,
			...extra,
		});
		expect(res.status, await res.clone().text()).toBe(201);
	}

	async function getModel(id: string): Promise<Model | undefined> {
		const res = await request("GET", `/models?search=${id}`);
		const { models } = (await res.json()) as { models: Model[] };
		return models.find((model) => model.id === id);
	}

	async function discover(id: string): Promise<Discovered[]> {
		const res = await request("POST", `/providers/${id}/discover`);
		expect(res.status, await res.clone().text()).toBe(200);
		return ((await res.json()) as { models: Discovered[] }).models;
	}

	test("discovers an OpenAI-compatible listing with OpenRouter pricing", async () => {
		await createProvider(OPENAI_PROVIDER, "openai-compatible");
		const models = await discover(OPENAI_PROVIDER);
		expect(models.map((model) => model.externalId)).toEqual([
			"acme/acme-chat",
			"acme/acme-mini",
			"gpt-4o",
		]);
		expect(models[0]).toEqual({
			externalId: "acme/acme-chat",
			displayName: "Acme: Chat",
			suggestedModelId: "acme-chat",
			contextSize: 131072,
			maxOutput: 8192,
			inputPrice: "2.5e-6",
			outputPrice: "10e-6",
			cachedInputPrice: "1.25e-6",
			existing: null,
		});
		// A negative listed price means "varies" and is not prefilled.
		expect(models[1]).toMatchObject({ inputPrice: null, outputPrice: null });
		expect(models[2].suggestedModelId).toBe("gpt-4o");
	});

	test("discovers an Anthropic listing with x-api-key", async () => {
		await createProvider(ANTHROPIC_PROVIDER, "anthropic");
		expect(await discover(ANTHROPIC_PROVIDER)).toEqual([
			expect.objectContaining({
				externalId: "claude-upstream-1",
				displayName: "Claude Upstream",
				inputPrice: null,
			}),
		]);
	});

	test("refuses discovery without a listing API", async () => {
		await createProvider(BEDROCK_PROVIDER, "aws-bedrock", {
			options: { awsRegion: "us-east-1" },
		});
		const res = await request(
			"POST",
			`/providers/${BEDROCK_PROVIDER}/discover`,
		);
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("no model listing");
		expect((await request("POST", "/providers/openai/discover")).status).toBe(
			400,
		);
	});

	test("imports discovered models: create, map, skip", async () => {
		await createProvider(OPENAI_PROVIDER, "openai-compatible");
		// A deleted managed model cannot be imported into.
		expect(
			(
				await request("POST", "/models", {
					id: "acme-gone",
					name: "Gone",
					family: "acme",
					output: "text",
					mappings: [],
				})
			).status,
		).toBe(201);
		expect((await request("DELETE", "/models/acme-gone", {})).status).toBe(200);

		const res = await request("POST", `/providers/${OPENAI_PROVIDER}/import`, {
			items: [
				{
					externalId: "acme/acme-chat",
					modelId: "acme-chat",
					name: "Acme Chat",
					inputPrice: "2.5e-6",
					outputPrice: "10e-6",
					cachedInputPrice: "1.25e-6",
					contextSize: 131072,
					maxOutput: 8192,
					tools: true,
				},
				{
					externalId: "gpt-4o",
					modelId: "gpt-4o",
					inputPrice: "2e-6",
					outputPrice: "8e-6",
				},
				{
					externalId: "acme/acme-chat-dup",
					modelId: "acme-chat",
					inputPrice: "1e-6",
					outputPrice: "1e-6",
				},
				{
					externalId: "acme/gone",
					modelId: "acme-gone",
					inputPrice: "1e-6",
					outputPrice: "1e-6",
				},
				{
					externalId: "auto",
					modelId: "auto",
					inputPrice: "1e-6",
					outputPrice: "1e-6",
				},
			],
			defaults: { markupPercent: 20 },
		});
		expect(res.status, await res.clone().text()).toBe(200);
		expect(await res.json()).toEqual({
			created: ["acme-chat"],
			mapped: [
				{ modelId: "acme-chat", externalId: "acme/acme-chat" },
				{ modelId: "gpt-4o", externalId: "gpt-4o" },
			],
			skipped: [
				{
					externalId: "acme/acme-chat-dup",
					reason: "duplicate model id in this import",
				},
				{
					externalId: "acme/gone",
					reason: "model is deleted; restore it first",
				},
				{ externalId: "auto", reason: "reserved id" },
			],
		});

		const chat = await getModel("acme-chat");
		expect(chat).toMatchObject({
			name: "Acme Chat",
			family: "acme",
			managed: true,
		});
		expect(chat?.mappings).toEqual([
			expect.objectContaining({
				providerId: OPENAI_PROVIDER,
				externalId: "acme/acme-chat",
				inputPrice: "3e-6",
				outputPrice: "12e-6",
				cachedInputPrice: "1.5e-6",
				contextSize: 131072,
				tools: true,
			}),
		]);
		const gpt = await getModel("gpt-4o");
		expect(
			gpt?.mappings.find((m) => m.providerId === OPENAI_PROVIDER),
		).toMatchObject({ inputPrice: "2.4e-6", managed: true });

		// Discovery now marks both as mapped; a second import skips them.
		const marked = await discover(OPENAI_PROVIDER);
		expect(marked.find((m) => m.externalId === "gpt-4o")?.existing).toEqual({
			modelId: "gpt-4o",
			providerId: OPENAI_PROVIDER,
		});
		const again = await request(
			"POST",
			`/providers/${OPENAI_PROVIDER}/import`,
			{
				items: [
					{
						externalId: "acme/acme-chat",
						modelId: "acme-chat",
						inputPrice: "1e-6",
						outputPrice: "1e-6",
					},
				],
			},
		);
		expect(await again.json()).toMatchObject({
			created: [],
			mapped: [],
			skipped: [
				{
					externalId: "acme/acme-chat",
					reason: "already mapped as acme/acme-chat",
				},
			],
		});
	});

	test("CSV and JSON import: dry run, apply, export round trip", async () => {
		await createProvider(OPENAI_PROVIDER, "openai-compatible");
		const header =
			"modelId,name,family,providerId,externalId,inputPricePerM,outputPricePerM,cachedInputPricePerM,contextSize,maxOutput,vision,tools,jsonOutput,reasoning,streaming";
		const bad = [
			header,
			`acme-csv,Acme CSV,acme,${OPENAI_PROVIDER},acme-csv-up,0.3,1.2,,32000,,true,yes,,,`,
			"gpt-4o,,,openai,gpt-4o,2,8,,,,,,,,",
			`acme-csv-2,,,${OPENAI_PROVIDER},x,abc,1,,,,maybe,,,,`,
			"acme-csv,,,nope-provider,x,1,1,,,,,,,,",
		].join("\n");
		const dry = await request("POST", "/import", {
			format: "csv",
			content: bad,
			dryRun: true,
		});
		expect(dry.status, await dry.clone().text()).toBe(200);
		const report = (await dry.json()) as ImportReport;
		expect(report.applied).toBe(false);
		expect(report.summary).toMatchObject({ rows: 4, errors: 2 });
		expect(report.rows[0]).toMatchObject({
			model: "create",
			mapping: "create",
			errors: [],
		});
		expect(report.rows[1]).toMatchObject({
			model: "builtin",
			mapping: "update",
		});
		expect(report.rows[2].errors).toEqual(
			expect.arrayContaining([
				expect.stringContaining("inputPricePerM"),
				expect.stringContaining("vision"),
			]),
		);
		expect(report.rows[3].errors).toEqual([
			"unknown or inactive provider nope-provider",
		]);
		expect(
			(await request("POST", "/import", { format: "csv", content: bad }))
				.status,
		).toBe(400);
		expect(await getModel("acme-csv")).toBeUndefined();

		const good = bad.split("\n").slice(0, 3).join("\n");
		const applied = await request("POST", "/import", {
			format: "csv",
			content: good,
		});
		expect(applied.status, await applied.clone().text()).toBe(200);
		expect(((await applied.json()) as ImportReport).summary).toMatchObject({
			modelsCreated: 1,
			mappingsCreated: 1,
			mappingsUpdated: 1,
		});
		expect((await getModel("acme-csv"))?.mappings[0]).toMatchObject({
			externalId: "acme-csv-up",
			inputPrice: "0.3e-6",
			outputPrice: "1.2e-6",
			contextSize: 32000,
			vision: true,
			tools: true,
		});
		const gpt = await getModel("gpt-4o");
		expect(gpt?.mappings.find((m) => m.providerId === "openai")).toMatchObject({
			inputPrice: "2e-6",
			outputPrice: "8e-6",
			overridesBuiltin: true,
		});

		for (const format of ["csv", "json"] as const) {
			const exported = await request("GET", `/export?format=${format}`);
			expect(exported.status).toBe(200);
			const content = await exported.text();
			expect(content).toContain("acme-csv-up");
			const reimport = await request("POST", "/import", {
				format,
				content,
				dryRun: true,
			});
			const roundTrip = (await reimport.json()) as ImportReport;
			expect(roundTrip.summary, format).toMatchObject({
				rows: 2,
				errors: 0,
				modelsCreated: 0,
				modelsUpdated: 0,
				mappingsCreated: 0,
				mappingsUpdated: 0,
				unchanged: 2,
			});
		}

		const json = await request("POST", "/import", {
			format: "json",
			content: JSON.stringify([
				{
					modelId: "acme-csv-2",
					name: "Acme CSV 2",
					providerId: OPENAI_PROVIDER,
					externalId: "acme-csv-2-up",
					inputPricePerM: 1,
					outputPricePerM: "2",
					reasoning: true,
				},
			]),
		});
		expect(json.status, await json.clone().text()).toBe(200);
		expect(await getModel("acme-csv-2")).toMatchObject({
			family: "acme",
			mappings: [expect.objectContaining({ inputPrice: "1e-6" })],
		});
		expect(
			(
				await request("POST", "/import", {
					format: "json",
					content: JSON.stringify([{ modelId: "x", price: 1 }]),
				})
			).status,
		).toBe(400);
	});

	test("clones built-in and managed models", async () => {
		const res = await request("POST", "/models/gpt-4o/clone", {
			newId: "gpt-4o-clone",
			providerIds: ["openai"],
		});
		expect(res.status, await res.clone().text()).toBe(201);
		const { model } = (await res.json()) as { model: Model };
		expect(model).toMatchObject({
			id: "gpt-4o-clone",
			name: "GPT-4o (copy)",
			family: "openai",
			managed: true,
		});
		expect(model.mappings).toEqual([
			expect.objectContaining({
				providerId: "openai",
				externalId: "gpt-4o",
				inputPrice: "2.5e-6",
				outputPrice: "10e-6",
				cachedInputPrice: "1.25e-6",
				contextSize: 128000,
				vision: true,
				tools: true,
			}),
		]);

		for (const [newId, status] of [
			["gpt-4o-clone", 409],
			["gpt-4o", 409],
			["auto", 409],
		] as const) {
			expect(
				(await request("POST", "/models/gpt-4o/clone", { newId })).status,
			).toBe(status);
		}
		expect(
			(
				await request("POST", "/models/gpt-4o/clone", {
					newId: "acme-chat-clone",
					providerIds: ["anthropic"],
				})
			).status,
		).toBe(400);
		expect(
			(await request("POST", "/models/nope-model/clone", { newId: "acme-x" }))
				.status,
		).toBe(404);

		const managed = await request("POST", "/models/gpt-4o-clone/clone", {
			newId: "acme-chat-clone",
			name: "Second copy",
		});
		expect(managed.status).toBe(201);
		expect(await getModel("acme-chat-clone")).toMatchObject({
			name: "Second copy",
			mappings: [expect.objectContaining({ inputPrice: "2.5e-6" })],
		});
	});

	test("bulk price change: dry run, percent and set", async () => {
		await createProvider(OPENAI_PROVIDER, "openai-compatible");
		await request("POST", `/providers/${OPENAI_PROVIDER}/import`, {
			items: [
				{
					externalId: "acme-chat-up",
					modelId: "acme-chat",
					name: "Acme Chat",
					inputPrice: "7e-6",
					outputPrice: "1e-6",
				},
			],
		});

		const dry = await request("POST", "/prices/bulk-update", {
			targets: [{ modelId: "gpt-4o", providerId: "openai" }],
			change: { type: "percent", value: "10" },
			dryRun: true,
		});
		expect(dry.status, await dry.clone().text()).toBe(200);
		const preview = (await dry.json()) as PriceReport;
		expect(preview).toMatchObject({ applied: false, matched: 1, changed: 1 });
		expect(preview.rows[0].before).toMatchObject({
			inputPrice: "2.5e-6",
			outputPrice: "10e-6",
			cachedInputPrice: "1.25e-6",
		});
		expect(preview.rows[0].after).toMatchObject({
			inputPrice: "2.75e-6",
			outputPrice: "11e-6",
			cachedInputPrice: "1.375e-6",
			cacheWriteInputPrice: null,
		});
		expect(
			(await getModel("gpt-4o"))?.mappings.find(
				(m) => m.providerId === "openai",
			)?.managed,
		).toBe(false);

		const applied = await request("POST", "/prices/bulk-update", {
			targets: { modelIds: ["gpt-4o"], providerIds: ["openai"] },
			change: { type: "percent", value: "10", fields: ["inputPrice"] },
		});
		expect(((await applied.json()) as PriceReport).applied).toBe(true);
		expect(
			(await getModel("gpt-4o"))?.mappings.find(
				(m) => m.providerId === "openai",
			),
		).toMatchObject({
			inputPrice: "2.75e-6",
			outputPrice: "10e-6",
			overridesBuiltin: true,
		});

		// Exact decimal math, rounded to 12 significant digits.
		const precise = await request("POST", "/prices/bulk-update", {
			targets: { providerIds: [OPENAI_PROVIDER] },
			change: { type: "percent", value: "12.3456789012345" },
		});
		expect(((await precise.json()) as PriceReport).rows[0].after).toMatchObject(
			{ inputPrice: "7.86419752309e-6", outputPrice: "1.12345678901e-6" },
		);

		const set = await request("POST", "/prices/bulk-update", {
			targets: { modelIds: ["acme-chat"] },
			change: { type: "set", value: "0.35", fields: ["outputPrice"] },
		});
		expect(set.status).toBe(200);
		expect((await getModel("acme-chat"))?.mappings[0]).toMatchObject({
			outputPrice: "0.35e-6",
			inputPrice: "7.86419752309e-6",
		});

		for (const body of [
			{
				targets: [{ modelId: "gpt-4o", providerId: "nope" }],
				change: { type: "percent", value: "5" },
			},
			{ targets: {}, change: { type: "percent", value: "5" } },
			{
				targets: { modelIds: ["gpt-4o"] },
				change: { type: "percent", value: "-150" },
			},
			{
				targets: { modelIds: ["gpt-4o"] },
				change: { type: "set", value: "-1" },
			},
		]) {
			expect(
				(await request("POST", "/prices/bulk-update", body)).status,
				JSON.stringify(body),
			).toBe(400);
		}
	});

	describe.each(["support", "viewer"] as const)("%s role", (role) => {
		test("may export but not run the quick tools", async () => {
			await db.insert(tables.user).values({
				id: "staff-user",
				name: "staff",
				email: "staff@example.com",
				emailVerified: true,
			});
			await db.insert(tables.account).values({
				id: "staff-account",
				providerId: "credential",
				accountId: "staff-account",
				userId: "staff-user",
				password: PASSWORD_HASH,
			});
			await db
				.insert(tables.adminMember)
				.values({ userId: "staff-user", role });
			const signIn = await app.request("/auth/sign-in/email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "staff@example.com",
					password: "admin@example.com1A",
				}),
			});
			expect(signIn.status).toBe(200);
			const staff = signIn.headers.get("set-cookie")!;

			expect((await call(staff, "GET", "/export")).status).toBe(200);
			for (const [path, body] of [
				["/providers/openai/discover", undefined],
				[
					"/providers/openai/import",
					{
						items: [
							{
								externalId: "x",
								modelId: "acme-chat",
								inputPrice: "1e-6",
								outputPrice: "1e-6",
							},
						],
					},
				],
				["/import", { format: "json", content: "[]", dryRun: true }],
				["/models/gpt-4o/clone", { newId: "gpt-4o-clone" }],
				[
					"/prices/bulk-update",
					{
						targets: { modelIds: ["gpt-4o"] },
						change: { type: "percent", value: "1" },
						dryRun: true,
					},
				],
			] as const) {
				expect((await call(staff, "POST", path, body)).status, path).toBe(403);
			}
			expect(await getModel("gpt-4o-clone")).toBeUndefined();
		});
	});
});
