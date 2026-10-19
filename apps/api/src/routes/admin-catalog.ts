import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { Decimal } from "decimal.js";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { adminMiddleware } from "@/middleware/admin.js";
import { createManagedCredential } from "@/routes/admin-provider-credentials.js";

import {
	managedCredentialValidationOptions,
	readProviderKey,
	redactToken,
	validateProviderKey,
} from "@llmgateway/actions";
import {
	and,
	db,
	desc,
	drizzleCache,
	eq,
	getTableName,
	inArray,
	isNull,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import {
	models as staticModels,
	PROVIDER_API_FORMATS,
	providers as staticProviders,
	REASONING_EFFORTS,
	TOOL_CHOICE_MODES,
} from "@llmgateway/models";
import { assertSafeProviderUrl } from "@llmgateway/shared/url-safety-node";

import type { ServerTypes } from "@/vars.js";
import type {
	ModelDefinition,
	ProviderApiFormat,
	ProviderId,
	ProviderModelMapping,
	ReasoningEffort,
	StabilityLevel,
	ToolChoiceMode,
} from "@llmgateway/models";

export const adminCatalog = new OpenAPIHono<ServerTypes>();

adminCatalog.use("/*", adminMiddleware);

// Prefixes the gateway parser treats specially, plus routing pseudo-models.
const RESERVED_IDS = new Set([
	"custom",
	"auto",
	"dynamic",
	"smart",
	"llmgateway",
]);
// Owner of admin-created custom providers; claims require a company row.
const PLATFORM_COMPANY_ID = "platform-catalog";
const PROBE_TIMEOUT_MS = 30_000;
const STABILITY_LEVELS = [
	"stable",
	"beta",
	"experimental",
	"unstable",
] as const;

type MappingRow = typeof tables.modelProviderMapping.$inferSelect;
type ClaimRow = typeof tables.providerClaim.$inferSelect;

const listedStaticProviders = staticProviders.filter(
	(provider) => provider.id !== "custom" && provider.id !== "llmgateway",
);
const catalogueModels = (staticModels as readonly ModelDefinition[]).filter(
	(model) => !RESERVED_IDS.has(model.id),
);

function findStaticModel(modelId: string): ModelDefinition | undefined {
	return catalogueModels.find((model) => model.id === modelId);
}

function isStaticModelName(name: string): boolean {
	return (staticModels as readonly ModelDefinition[]).some(
		(model) =>
			model.id === name ||
			((model.aliases as readonly string[] | undefined)?.includes(name) ??
				false),
	);
}

function findStaticMapping(
	modelId: string,
	providerId: string,
): ProviderModelMapping | undefined {
	return findStaticModel(modelId)?.providers.find(
		(mapping) => mapping.providerId === providerId,
	);
}

function isStaticProviderId(id: string): boolean {
	return staticProviders.some((provider) => provider.id === id);
}

/** Evicts every gateway cache entry built from the catalog tables. */
async function evictCatalogCaches(): Promise<void> {
	await drizzleCache.onMutate({
		tables: [
			getTableName(tables.model),
			getTableName(tables.modelProviderMapping),
			getTableName(tables.provider),
			getTableName(tables.providerClaim),
			getTableName(tables.providerKey),
		],
	});
}

const priceSchema = z
	.string()
	.trim()
	.regex(
		/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i,
		"Prices are non-negative decimal strings, e.g. 1.4e-6",
	)
	.refine((value) => Number.isFinite(Number(value)), "Price is out of range");

const dateInputSchema = z
	.string()
	.refine((value) => !Number.isNaN(Date.parse(value)), "Not a valid date");

const mappingInputSchema = z.object({
	externalId: z.string().trim().min(1).max(200),
	region: z.string().trim().min(1).max(64).nullable().optional(),
	apiFormat: z.enum(PROVIDER_API_FORMATS).nullable().optional(),
	inputPrice: priceSchema,
	outputPrice: priceSchema,
	cachedInputPrice: priceSchema.nullable().optional(),
	cacheWriteInputPrice: priceSchema.nullable().optional(),
	requestPrice: priceSchema.nullable().optional(),
	imageInputPrice: priceSchema.nullable().optional(),
	webSearchPrice: priceSchema.nullable().optional(),
	contextSize: z.number().int().positive().nullable().optional(),
	maxOutput: z.number().int().positive().nullable().optional(),
	streaming: z.boolean(),
	vision: z.boolean().nullable().optional(),
	audio: z.boolean().nullable().optional(),
	tools: z.boolean().nullable().optional(),
	jsonOutput: z.boolean().optional(),
	jsonOutputSchema: z.boolean().optional(),
	reasoning: z.boolean().nullable().optional(),
	reasoningOutput: z.enum(["omit"]).nullable().optional(),
	reasoningEfforts: z.array(z.enum(REASONING_EFFORTS)).nullable().optional(),
	supportedToolChoices: z
		.array(z.enum(TOOL_CHOICE_MODES))
		.nullable()
		.optional(),
	supportedParameters: z
		.array(z.string().trim().min(1).max(64))
		.max(100)
		.nullable()
		.optional(),
	webSearch: z.boolean().optional(),
	stability: z.enum(STABILITY_LEVELS).optional(),
	deprecatedAt: dateInputSchema.nullable().optional(),
	deactivatedAt: dateInputSchema.nullable().optional(),
});

type MappingInput = z.infer<typeof mappingInputSchema>;

const mappingSchema = z.object({
	providerId: z.string(),
	externalId: z.string(),
	region: z.string().nullable(),
	apiFormat: z.string().nullable(),
	inputPrice: z.string().nullable(),
	outputPrice: z.string().nullable(),
	cachedInputPrice: z.string().nullable(),
	cacheWriteInputPrice: z.string().nullable(),
	requestPrice: z.string().nullable(),
	imageInputPrice: z.string().nullable(),
	webSearchPrice: z.string().nullable(),
	contextSize: z.number().nullable(),
	maxOutput: z.number().nullable(),
	streaming: z.boolean(),
	vision: z.boolean().nullable(),
	audio: z.boolean().nullable(),
	tools: z.boolean().nullable(),
	jsonOutput: z.boolean(),
	jsonOutputSchema: z.boolean(),
	reasoning: z.boolean().nullable(),
	reasoningOutput: z.string().nullable(),
	reasoningEfforts: z.array(z.string()).nullable(),
	supportedToolChoices: z.array(z.string()).nullable(),
	supportedParameters: z.array(z.string()).nullable(),
	webSearch: z.boolean(),
	stability: z.enum(STABILITY_LEVELS),
	deprecatedAt: z.string().nullable(),
	deactivatedAt: z.string().nullable(),
	/** Served from a DB row (managed or override) rather than the static catalogue. */
	managed: z.boolean(),
	/** A DB row that replaces a static catalogue mapping of the same pair. */
	overridesBuiltin: z.boolean(),
});

type Mapping = z.infer<typeof mappingSchema>;

/** Persisted mapping fields, as stored in model_provider_mapping. */
interface MappingValues {
	externalId: string;
	apiFormat: ProviderApiFormat | null;
	inputPrice: string | null;
	outputPrice: string | null;
	cachedInputPrice: string | null;
	cacheWriteInputPrice: string | null;
	requestPrice: string | null;
	imageInputPrice: string | null;
	webSearchPrice: string | null;
	contextSize: number | null;
	maxOutput: number | null;
	streaming: boolean;
	vision: boolean | null;
	audio: boolean | null;
	tools: boolean | null;
	jsonOutput: boolean;
	jsonOutputSchema: boolean;
	reasoning: boolean | null;
	reasoningOutput: string | null;
	reasoningEfforts: string[] | null;
	supportedToolChoices: ToolChoiceMode[] | null;
	supportedParameters: string[] | null;
	webSearch: boolean;
	stability: StabilityLevel;
	deprecatedAt: Date | null;
	deactivatedAt: Date | null;
}

function priceToString(value: string | number | undefined): string | null {
	return value === undefined ? null : String(value);
}

function staticMappingValues(mapping: ProviderModelMapping): MappingValues {
	return {
		externalId: mapping.externalId,
		apiFormat: mapping.apiFormat ?? null,
		inputPrice: priceToString(mapping.inputPrice),
		outputPrice: priceToString(mapping.outputPrice),
		cachedInputPrice: priceToString(mapping.cachedInputPrice),
		cacheWriteInputPrice: priceToString(mapping.cacheWriteInputPrice),
		requestPrice: priceToString(mapping.requestPrice),
		imageInputPrice: priceToString(mapping.imageInputPrice),
		webSearchPrice: priceToString(mapping.webSearchPrice),
		contextSize: mapping.contextSize ?? null,
		maxOutput: mapping.maxOutput ?? null,
		streaming: mapping.streaming !== false,
		vision: mapping.vision ?? null,
		audio: mapping.audio ?? null,
		tools: mapping.tools ?? null,
		jsonOutput: mapping.jsonOutput ?? false,
		jsonOutputSchema: mapping.jsonOutputSchema ?? false,
		reasoning: mapping.reasoning ?? null,
		reasoningOutput: mapping.reasoningOutput ?? null,
		reasoningEfforts: mapping.reasoningEfforts ?? null,
		supportedToolChoices: mapping.supportedToolChoices ?? null,
		supportedParameters: mapping.supportedParameters ?? null,
		webSearch: mapping.webSearch ?? false,
		stability: mapping.stability ?? "stable",
		deprecatedAt: mapping.deprecatedAt ?? null,
		deactivatedAt: mapping.deactivatedAt ?? null,
	};
}

/**
 * The values a DB row serves. Mirrors airsideListingToModelDefinition in the
 * gateway: nullable fields the row leaves empty fall back to the static
 * mapping of the same pair.
 */
function rowMappingValues(
	row: MappingRow,
	staticMapping: ProviderModelMapping | undefined,
): MappingValues {
	const fallback = staticMapping
		? staticMappingValues(staticMapping)
		: undefined;
	return {
		externalId: row.externalId,
		apiFormat: row.apiFormat === "provider-native" ? null : row.apiFormat,
		inputPrice: row.inputPrice,
		outputPrice: row.outputPrice,
		cachedInputPrice: row.cachedInputPrice,
		cacheWriteInputPrice:
			row.cacheWriteInputPrice ?? fallback?.cacheWriteInputPrice ?? null,
		requestPrice: row.requestPrice,
		imageInputPrice: row.imageInputPrice ?? fallback?.imageInputPrice ?? null,
		webSearchPrice: row.webSearchPrice ?? fallback?.webSearchPrice ?? null,
		contextSize: row.contextSize,
		maxOutput: row.maxOutput,
		streaming: row.streaming,
		vision: row.vision,
		audio: row.audio,
		tools: row.tools,
		jsonOutput: row.jsonOutput,
		jsonOutputSchema: row.jsonOutputSchema,
		reasoning: row.reasoning,
		reasoningOutput: row.reasoningOutput ?? fallback?.reasoningOutput ?? null,
		reasoningEfforts: row.reasoningEfforts,
		supportedToolChoices: row.supportedToolChoices,
		supportedParameters:
			row.supportedParameters ?? fallback?.supportedParameters ?? null,
		webSearch: row.webSearch,
		stability:
			row.stability === "stable"
				? (fallback?.stability ?? "stable")
				: row.stability,
		deprecatedAt: row.deprecatedAt ?? fallback?.deprecatedAt ?? null,
		deactivatedAt: row.deactivatedAt,
	};
}

/** Postgres normalizes decimals; per-token prices read back as `<n>e-6`. */
function perTokenPrice(value: string | null): string | null {
	if (value === null) {
		return null;
	}
	const perMillion = new Decimal(value).times(1_000_000);
	return perMillion.isZero() ? "0" : `${perMillion.toString()}e-6`;
}

function toMapping(
	providerId: string,
	region: string | null,
	values: MappingValues,
	flags: { managed: boolean; overridesBuiltin: boolean },
): Mapping {
	return {
		providerId,
		region,
		...values,
		inputPrice: perTokenPrice(values.inputPrice),
		outputPrice: perTokenPrice(values.outputPrice),
		cachedInputPrice: perTokenPrice(values.cachedInputPrice),
		cacheWriteInputPrice: perTokenPrice(values.cacheWriteInputPrice),
		deprecatedAt: values.deprecatedAt?.toISOString() ?? null,
		deactivatedAt: values.deactivatedAt?.toISOString() ?? null,
		...flags,
	};
}

/** Applies the fields a request set (including explicit nulls) onto `base`. */
function mergeMappingInput(
	base: MappingValues,
	input: MappingInput,
): MappingValues {
	const pick = <K extends keyof MappingValues>(
		key: K,
		value: MappingValues[K] | undefined,
	): MappingValues[K] => (value === undefined ? base[key] : value);
	const toDate = (
		value: string | null | undefined,
		key: keyof MappingValues,
	) =>
		value === undefined
			? (base[key] as Date | null)
			: value === null
				? null
				: new Date(value);
	return {
		externalId: input.externalId,
		apiFormat: pick("apiFormat", input.apiFormat),
		inputPrice: input.inputPrice,
		outputPrice: input.outputPrice,
		cachedInputPrice: pick("cachedInputPrice", input.cachedInputPrice),
		cacheWriteInputPrice: pick(
			"cacheWriteInputPrice",
			input.cacheWriteInputPrice,
		),
		requestPrice: pick("requestPrice", input.requestPrice),
		imageInputPrice: pick("imageInputPrice", input.imageInputPrice),
		webSearchPrice: pick("webSearchPrice", input.webSearchPrice),
		contextSize: pick("contextSize", input.contextSize),
		maxOutput: pick("maxOutput", input.maxOutput),
		streaming: input.streaming,
		vision: pick("vision", input.vision),
		audio: pick("audio", input.audio),
		tools: pick("tools", input.tools),
		jsonOutput: pick("jsonOutput", input.jsonOutput),
		jsonOutputSchema: pick("jsonOutputSchema", input.jsonOutputSchema),
		reasoning: pick("reasoning", input.reasoning),
		reasoningOutput: pick("reasoningOutput", input.reasoningOutput),
		reasoningEfforts: pick("reasoningEfforts", input.reasoningEfforts),
		supportedToolChoices: pick(
			"supportedToolChoices",
			input.supportedToolChoices,
		),
		supportedParameters: pick("supportedParameters", input.supportedParameters),
		webSearch: pick("webSearch", input.webSearch),
		stability: pick("stability", input.stability),
		deprecatedAt: toDate(input.deprecatedAt, "deprecatedAt"),
		deactivatedAt: toDate(input.deactivatedAt, "deactivatedAt"),
	};
}

const DEFAULT_MAPPING_VALUES: Omit<MappingValues, "externalId"> = {
	apiFormat: null,
	inputPrice: null,
	outputPrice: null,
	cachedInputPrice: null,
	cacheWriteInputPrice: null,
	requestPrice: null,
	imageInputPrice: null,
	webSearchPrice: null,
	contextSize: null,
	maxOutput: null,
	streaming: true,
	vision: null,
	audio: null,
	tools: null,
	jsonOutput: false,
	jsonOutputSchema: false,
	reasoning: null,
	reasoningOutput: null,
	reasoningEfforts: null,
	supportedToolChoices: null,
	supportedParameters: null,
	webSearch: false,
	stability: "stable",
	deprecatedAt: null,
	deactivatedAt: null,
};

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const providerSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	kind: z.enum(["builtin", "custom"]),
	baseUrl: z.string().nullable(),
	status: z.enum(["active", "inactive"]),
	credentialCount: z.number(),
	modelCount: z.number(),
});

type CatalogProvider = z.infer<typeof providerSchema>;

/** The most recent custom-provider claim per provider id. */
async function loadCustomClaims(providerId?: string): Promise<ClaimRow[]> {
	const rows = await db
		.select()
		.from(tables.providerClaim)
		.where(
			and(
				eq(tables.providerClaim.kind, "custom"),
				providerId
					? eq(tables.providerClaim.providerId, providerId)
					: undefined,
			),
		)
		.orderBy(desc(tables.providerClaim.createdAt));
	const latest = new Map<string, ClaimRow>();
	for (const row of rows) {
		const current = latest.get(row.providerId);
		// A live claim always wins over an older revoked/rejected one.
		if (!current || (current.status !== "active" && row.status === "active")) {
			latest.set(row.providerId, row);
		}
	}
	return Array.from(latest.values());
}

async function loadCustomClaim(providerId: string): Promise<ClaimRow> {
	const [claim] = await loadCustomClaims(providerId);
	if (!claim) {
		throw new HTTPException(isStaticProviderId(providerId) ? 400 : 404, {
			message: isStaticProviderId(providerId)
				? "Built-in providers cannot be changed here"
				: `Unknown provider: ${providerId}`,
		});
	}
	return claim;
}

async function countActiveCredentials(): Promise<Map<string, number>> {
	const rows = await db
		.select({ provider: tables.providerKey.provider })
		.from(tables.providerKey)
		.where(
			and(
				eq(tables.providerKey.managed, true),
				eq(tables.providerKey.status, "active"),
			),
		);
	const counts = new Map<string, number>();
	for (const row of rows) {
		counts.set(row.provider, (counts.get(row.provider) ?? 0) + 1);
	}
	return counts;
}

function toCustomProvider(
	claim: ClaimRow,
	credentialCounts: Map<string, number>,
	modelCounts: Map<string, number>,
): CatalogProvider {
	return {
		id: claim.providerId,
		name: claim.customName ?? claim.providerId,
		description: claim.customDescription,
		kind: "custom",
		baseUrl: claim.customBaseUrl,
		status: claim.status === "active" ? "active" : "inactive",
		credentialCount: credentialCounts.get(claim.providerId) ?? 0,
		modelCount: modelCounts.get(claim.providerId) ?? 0,
	};
}

async function listCatalogProviders(): Promise<CatalogProvider[]> {
	const [claims, credentialCounts, catalog] = await Promise.all([
		loadCustomClaims(),
		countActiveCredentials(),
		loadCatalogModels(),
	]);
	const modelCounts = new Map<string, number>();
	const now = Date.now();
	for (const model of catalog) {
		if (model.status !== "active") {
			continue;
		}
		const providerIds = new Set(
			model.mappings
				.filter(
					(mapping) =>
						!mapping.deactivatedAt || Date.parse(mapping.deactivatedAt) > now,
				)
				.map((mapping) => mapping.providerId),
		);
		for (const providerId of providerIds) {
			modelCounts.set(providerId, (modelCounts.get(providerId) ?? 0) + 1);
		}
	}
	return [
		...listedStaticProviders.map((provider): CatalogProvider => ({
			id: provider.id,
			name: provider.name,
			description: provider.description ?? null,
			kind: "builtin",
			baseUrl: null,
			status: "active",
			credentialCount: credentialCounts.get(provider.id) ?? 0,
			modelCount: modelCounts.get(provider.id) ?? 0,
		})),
		...claims.map((claim) =>
			toCustomProvider(claim, credentialCounts, modelCounts),
		),
	];
}

async function getCatalogProvider(id: string): Promise<CatalogProvider> {
	const provider = (await listCatalogProviders()).find(
		(entry) => entry.id === id,
	);
	if (!provider) {
		throw new HTTPException(404, { message: `Unknown provider: ${id}` });
	}
	return provider;
}

/** Validates an upstream base URL and returns it without trailing slashes. */
async function normalizeBaseUrl(raw: string): Promise<string> {
	const baseUrl = raw.trim().replace(/\/+$/, "");
	try {
		await assertSafeProviderUrl(baseUrl);
	} catch (error) {
		throw new HTTPException(400, {
			message:
				error instanceof Error ? error.message : "Base URL is not allowed",
		});
	}
	return baseUrl;
}

const providerIdSchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(
		/^[a-z0-9][a-z0-9-]{1,62}$/,
		"Use 2-63 lowercase letters, digits and dashes",
	);

const listProvidersRoute = createRoute({
	operationId: "admin_list_catalog_providers",
	method: "get",
	path: "/catalog/providers",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ providers: z.array(providerSchema) }),
				},
			},
			description: "Built-in and custom providers with credential counts.",
		},
	},
});

adminCatalog.openapi(listProvidersRoute, async (c) => {
	return c.json({ providers: await listCatalogProviders() }, 200);
});

const createProviderRoute = createRoute({
	operationId: "admin_create_catalog_provider",
	method: "post",
	path: "/catalog/providers",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						id: providerIdSchema,
						name: z.string().trim().min(1).max(100),
						baseUrl: z.string().trim().min(1).max(500),
						apiKey: z.string().trim().min(1).max(4000),
						description: z.string().trim().max(1000).optional(),
					}),
				},
			},
		},
	},
	responses: {
		201: {
			content: {
				"application/json": {
					schema: z.object({ provider: providerSchema }),
				},
			},
			description: "Custom OpenAI-compatible provider created.",
		},
	},
});

adminCatalog.openapi(createProviderRoute, async (c) => {
	const user = c.get("user")!;
	const body = c.req.valid("json");
	if (RESERVED_IDS.has(body.id) || isStaticProviderId(body.id)) {
		throw new HTTPException(409, {
			message: `Provider id "${body.id}" is reserved or already in the catalogue`,
		});
	}
	const baseUrl = await normalizeBaseUrl(body.baseUrl);
	const existing = await db.query.providerClaim.findFirst({
		where: {
			providerId: { eq: body.id },
			status: { in: ["pending", "active"] },
		},
	});
	if (existing) {
		throw new HTTPException(409, {
			message: `Provider "${body.id}" already exists`,
		});
	}

	await db.transaction(async (tx) => {
		await tx
			.insert(tables.providerCompany)
			.values({
				id: PLATFORM_COMPANY_ID,
				name: "Platform catalog",
				paymentStatus: "paid",
			})
			.onConflictDoNothing();
		await tx
			.insert(tables.provider)
			.values({
				id: body.id,
				name: body.name,
				description: body.description ?? "",
				streaming: true,
				status: "active",
			})
			.onConflictDoUpdate({
				target: tables.provider.id,
				set: {
					name: body.name,
					description: body.description ?? "",
					status: "active",
				},
			});
		await tx.insert(tables.providerClaim).values({
			providerCompanyId: PLATFORM_COMPANY_ID,
			providerId: body.id,
			kind: "custom",
			matchedDomain: new URL(baseUrl).hostname.toLowerCase(),
			customName: body.name,
			customBaseUrl: baseUrl,
			customDescription: body.description ?? null,
			claimedBy: user.id,
			status: "active",
			reviewedBy: user.id,
			reviewedAt: new Date(),
		});
	});
	await createManagedCredential(
		{
			provider: body.id,
			token: body.apiKey,
			comment: "Added with the catalog provider",
			skipValidation: true,
		},
		user.id,
	);
	await evictCatalogCaches();

	return c.json({ provider: await getCatalogProvider(body.id) }, 201);
});

const providerIdParams = z.object({ id: z.string() });

const updateProviderRoute = createRoute({
	operationId: "admin_update_catalog_provider",
	method: "patch",
	path: "/catalog/providers/{id}",
	request: {
		params: providerIdParams,
		body: {
			content: {
				"application/json": {
					schema: z.object({
						name: z.string().trim().min(1).max(100).optional(),
						baseUrl: z.string().trim().min(1).max(500).optional(),
						apiKey: z.string().trim().min(1).max(4000).optional(),
						description: z.string().trim().max(1000).nullable().optional(),
						status: z.enum(["active", "inactive"]).optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ provider: providerSchema }),
				},
			},
			description: "Custom provider updated.",
		},
	},
});

async function setCustomProviderStatus(
	claim: ClaimRow,
	status: "active" | "inactive",
): Promise<void> {
	if (status === "inactive") {
		if (claim.status !== "active" && claim.status !== "pending") {
			return;
		}
		await db.transaction(async (tx) => {
			await tx
				.update(tables.providerClaim)
				.set({ status: "revoked", revokedAt: new Date() })
				.where(eq(tables.providerClaim.id, claim.id));
			await tx
				.update(tables.provider)
				.set({ status: "inactive" })
				.where(eq(tables.provider.id, claim.providerId));
		});
		return;
	}
	if (claim.status === "active") {
		return;
	}
	const live = await db.query.providerClaim.findFirst({
		where: {
			providerId: { eq: claim.providerId },
			status: { in: ["pending", "active"] },
		},
	});
	if (live) {
		throw new HTTPException(409, {
			message: `Provider "${claim.providerId}" already has a live registration`,
		});
	}
	await db.transaction(async (tx) => {
		await tx
			.update(tables.providerClaim)
			.set({ status: "active", revokedAt: null })
			.where(eq(tables.providerClaim.id, claim.id));
		await tx
			.update(tables.provider)
			.set({ status: "active" })
			.where(eq(tables.provider.id, claim.providerId));
	});
}

adminCatalog.openapi(updateProviderRoute, async (c) => {
	const user = c.get("user")!;
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	const claim = await loadCustomClaim(id);

	const claimUpdate: Partial<typeof tables.providerClaim.$inferInsert> = {};
	const providerUpdate: Partial<typeof tables.provider.$inferInsert> = {};
	if (body.name !== undefined) {
		claimUpdate.customName = body.name;
		providerUpdate.name = body.name;
	}
	if (body.description !== undefined) {
		claimUpdate.customDescription = body.description;
		providerUpdate.description = body.description ?? "";
	}
	if (body.baseUrl !== undefined) {
		const baseUrl = await normalizeBaseUrl(body.baseUrl);
		claimUpdate.customBaseUrl = baseUrl;
		claimUpdate.matchedDomain = new URL(baseUrl).hostname.toLowerCase();
	}
	if (Object.keys(claimUpdate).length > 0) {
		await db
			.update(tables.providerClaim)
			.set(claimUpdate)
			.where(eq(tables.providerClaim.id, claim.id));
	}
	if (Object.keys(providerUpdate).length > 0) {
		await db
			.update(tables.provider)
			.set(providerUpdate)
			.where(eq(tables.provider.id, id));
	}
	if (body.status !== undefined) {
		await setCustomProviderStatus(claim, body.status);
	}
	if (body.apiKey !== undefined) {
		const previous = await db
			.select({ id: tables.providerKey.id })
			.from(tables.providerKey)
			.where(
				and(
					eq(tables.providerKey.provider, id),
					eq(tables.providerKey.managed, true),
					eq(tables.providerKey.status, "active"),
				),
			);
		await createManagedCredential(
			{
				provider: id,
				token: body.apiKey,
				comment: "Rotated from the catalog provider",
				skipValidation: true,
			},
			user.id,
		);
		if (previous.length > 0) {
			await db
				.update(tables.providerKey)
				.set({ status: "inactive" })
				.where(
					inArray(
						tables.providerKey.id,
						previous.map((row) => row.id),
					),
				);
		}
	}
	await evictCatalogCaches();

	return c.json({ provider: await getCatalogProvider(id) }, 200);
});

const deleteProviderRoute = createRoute({
	operationId: "admin_delete_catalog_provider",
	method: "delete",
	path: "/catalog/providers/{id}",
	request: { params: providerIdParams },
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ success: z.boolean() }) },
			},
			description: "Custom provider deactivated; its models stop routing.",
		},
	},
});

adminCatalog.openapi(deleteProviderRoute, async (c) => {
	const { id } = c.req.valid("param");
	const claim = await loadCustomClaim(id);
	await setCustomProviderStatus(claim, "inactive");
	await evictCatalogCaches();
	return c.json({ success: true }, 200);
});

const testProviderRoute = createRoute({
	operationId: "admin_test_catalog_provider",
	method: "post",
	path: "/catalog/providers/{id}/test",
	request: { params: providerIdParams },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						ok: z.boolean(),
						latencyMs: z.number().nullable(),
						models: z.array(z.string()).nullable(),
						error: z.string().nullable(),
					}),
				},
			},
			description:
				"Probes the provider with its active platform credential. Custom providers are asked for /v1/models.",
		},
	},
});

/** Lists upstream model ids from an OpenAI-compatible /v1/models endpoint. */
async function probeCustomProvider(
	baseUrl: string,
	token: string,
): Promise<{ models: string[] | null; error: string | null }> {
	const url = `${baseUrl}/v1/models`;
	await assertSafeProviderUrl(url);
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
		redirect: "error",
		signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
	});
	if (!response.ok) {
		const text = await response.text();
		return {
			models: null,
			error: redactToken(
				`Upstream answered ${response.status}: ${text.slice(0, 300)}`,
				token,
			),
		};
	}
	const json: unknown = await response.json();
	const data =
		json && typeof json === "object" && "data" in json
			? (json as { data: unknown }).data
			: null;
	const ids = Array.isArray(data)
		? data
				.map((entry: unknown) =>
					entry && typeof entry === "object" && "id" in entry
						? String((entry as { id: unknown }).id)
						: null,
				)
				.filter((entry): entry is string => entry !== null)
		: [];
	return { models: ids, error: null };
}

adminCatalog.openapi(testProviderRoute, async (c) => {
	const { id } = c.req.valid("param");
	const builtin = isStaticProviderId(id) && !RESERVED_IDS.has(id);
	const claim = builtin ? null : await loadCustomClaim(id);
	if (claim && claim.status !== "active") {
		return c.json(
			{
				ok: false,
				latencyMs: null,
				models: null,
				error: "Provider is inactive",
			},
			200,
		);
	}
	const credential = await db.query.providerKey.findFirst({
		where: {
			provider: { eq: id },
			managed: { eq: true },
			status: { eq: "active" },
		},
		orderBy: { createdAt: "desc" },
	});
	if (!credential) {
		return c.json(
			{
				ok: false,
				latencyMs: null,
				models: null,
				error: "No active platform credential for this provider",
			},
			200,
		);
	}
	const token = readProviderKey(credential);
	const startedAt = Date.now();
	try {
		if (claim?.customBaseUrl) {
			const result = await probeCustomProvider(claim.customBaseUrl, token);
			return c.json(
				{
					ok: result.error === null,
					latencyMs: Date.now() - startedAt,
					models: result.models,
					error: result.error,
				},
				200,
			);
		}
		const result = await validateProviderKey(
			id as ProviderId,
			token,
			undefined,
			// Unit tests run against fixture credentials, never live upstreams.
			process.env.NODE_ENV === "test" && process.env.E2E_TEST !== "true",
			managedCredentialValidationOptions(
				id,
				credential.config,
				credential.region,
			),
			undefined,
			AbortSignal.timeout(PROBE_TIMEOUT_MS),
		);
		return c.json(
			{
				ok: result.valid,
				latencyMs: Date.now() - startedAt,
				models: result.model ? [result.model] : null,
				error: result.error ? redactToken(result.error, token) : null,
			},
			200,
		);
	} catch (error) {
		logger.warn("Catalog provider probe failed", {
			provider: id,
			error: error instanceof Error ? error.message : String(error),
		});
		return c.json(
			{
				ok: false,
				latencyMs: null,
				models: null,
				error: redactToken(
					error instanceof Error ? error.message : String(error),
					token,
				),
			},
			200,
		);
	}
});

// ---------------------------------------------------------------------------
// Models and mappings
// ---------------------------------------------------------------------------

const modelSchema = z.object({
	id: z.string(),
	name: z.string(),
	family: z.string(),
	description: z.string().nullable(),
	aliases: z.array(z.string()),
	output: z.array(z.string()),
	managed: z.boolean(),
	status: z.enum(["active", "inactive"]),
	mappings: z.array(mappingSchema),
});

type CatalogModel = z.infer<typeof modelSchema>;

function displayDescription(value: string | null | undefined): string | null {
	return value && value !== "(empty)" ? value : null;
}

/** Every static and DB-only model with its effective mappings. */
async function loadCatalogModels(): Promise<CatalogModel[]> {
	const [dbModels, managedRows] = await Promise.all([
		db.select().from(tables.model),
		db
			.select()
			.from(tables.modelProviderMapping)
			.where(eq(tables.modelProviderMapping.source, "airside")),
	]);
	const rowsByModel = new Map<string, MappingRow[]>();
	for (const row of managedRows) {
		const rows = rowsByModel.get(row.modelId) ?? [];
		rows.push(row);
		rowsByModel.set(row.modelId, rows);
	}

	const managedMappings = (modelId: string, staticIds: Set<string>) =>
		(rowsByModel.get(modelId) ?? []).map((row) => {
			const staticMapping = findStaticMapping(modelId, row.providerId);
			return toMapping(
				row.providerId,
				row.region,
				rowMappingValues(row, staticMapping),
				{
					managed: true,
					overridesBuiltin: staticIds.has(row.providerId),
				},
			);
		});

	const result: CatalogModel[] = catalogueModels.map((model) => {
		const staticIds = new Set(model.providers.map((p) => p.providerId));
		const overridden = new Set(
			(rowsByModel.get(model.id) ?? [])
				.filter((row) => row.region === null)
				.map((row) => row.providerId),
		);
		return {
			id: model.id,
			name: model.name ?? model.id,
			family: model.family,
			description: displayDescription(model.description),
			aliases: [...((model.aliases as readonly string[] | undefined) ?? [])],
			output: [...(model.output ?? ["text"])],
			managed: false,
			status: "active",
			mappings: [
				...model.providers
					.filter((mapping) => !overridden.has(mapping.providerId))
					.map((mapping) =>
						toMapping(mapping.providerId, null, staticMappingValues(mapping), {
							managed: false,
							overridesBuiltin: false,
						}),
					),
				...managedMappings(model.id, staticIds),
			],
		};
	});
	const staticIdSet = new Set(catalogueModels.map((model) => model.id));
	for (const model of dbModels) {
		if (staticIdSet.has(model.id) || RESERVED_IDS.has(model.id)) {
			continue;
		}
		result.push({
			id: model.id,
			name: model.name,
			family: model.family,
			description: displayDescription(model.description),
			aliases: model.aliases,
			output: model.output,
			managed: true,
			status: model.status,
			mappings: managedMappings(model.id, new Set()),
		});
	}
	return result;
}

async function getCatalogModel(modelId: string): Promise<CatalogModel> {
	const model = (await loadCatalogModels()).find(
		(entry) => entry.id === modelId,
	);
	if (!model) {
		throw new HTTPException(404, { message: `Unknown model: ${modelId}` });
	}
	return model;
}

/** Throws unless `providerId` can carry a mapping; returns its kind. */
async function assertMappableProvider(
	providerId: string,
): Promise<"builtin" | "custom"> {
	if (RESERVED_IDS.has(providerId)) {
		throw new HTTPException(400, {
			message: `Provider "${providerId}" cannot carry catalog mappings`,
		});
	}
	if (isStaticProviderId(providerId)) {
		return "builtin";
	}
	const claim = await db.query.providerClaim.findFirst({
		where: {
			providerId: { eq: providerId },
			kind: { eq: "custom" },
			status: { eq: "active" },
		},
	});
	if (!claim) {
		throw new HTTPException(400, {
			message: `Unknown or inactive provider: ${providerId}`,
		});
	}
	return "custom";
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Makes sure the FK targets of a mapping exist for a built-in pair. */
async function ensureBuiltinRows(
	tx: Tx,
	modelId: string,
	providerId: string,
): Promise<void> {
	const provider = staticProviders.find((entry) => entry.id === providerId);
	if (provider) {
		await tx
			.insert(tables.provider)
			.values({
				id: provider.id,
				name: provider.name,
				description: provider.description ?? "",
				streaming: provider.streaming,
				cancellation: provider.cancellation,
				color: provider.color,
				website: provider.website,
				status: "active",
			})
			.onConflictDoNothing();
	}
	const model = findStaticModel(modelId);
	if (model) {
		await tx
			.insert(tables.model)
			.values({
				id: model.id,
				name: model.name ?? model.id,
				aliases: [...((model.aliases as readonly string[] | undefined) ?? [])],
				description: model.description ?? "(empty)",
				family: model.family,
				free: model.free ?? false,
				output: [...(model.output ?? ["text"])],
				stability: model.stability ?? "stable",
				status: "active",
			})
			.onConflictDoNothing();
	}
}

/** Creates or updates the DB row for one (model, provider, region). */
async function upsertMapping(
	tx: Tx,
	modelId: string,
	providerId: string,
	input: MappingInput,
): Promise<void> {
	const region = input.region ?? null;
	const [existing] = await tx
		.select()
		.from(tables.modelProviderMapping)
		.where(
			and(
				eq(tables.modelProviderMapping.modelId, modelId),
				eq(tables.modelProviderMapping.providerId, providerId),
				region === null
					? isNull(tables.modelProviderMapping.region)
					: eq(tables.modelProviderMapping.region, region),
			),
		)
		.limit(1);
	const staticMapping = findStaticMapping(modelId, providerId);
	if (region !== null) {
		const [canonical] = await tx
			.select({ id: tables.modelProviderMapping.id })
			.from(tables.modelProviderMapping)
			.where(
				and(
					eq(tables.modelProviderMapping.modelId, modelId),
					eq(tables.modelProviderMapping.providerId, providerId),
					eq(tables.modelProviderMapping.source, "airside"),
					isNull(tables.modelProviderMapping.region),
				),
			)
			.limit(1);
		if (!canonical) {
			throw new HTTPException(400, {
				message:
					"Create the default (region-less) mapping before adding a regional price",
			});
		}
	}
	// A row the catalogue sync still owns is converted, so start from what the
	// static mapping serves rather than from the synced copy.
	const base =
		existing?.source === "airside"
			? rowMappingValues(existing, staticMapping)
			: staticMapping && region === null
				? staticMappingValues(staticMapping)
				: { ...DEFAULT_MAPPING_VALUES, externalId: input.externalId };
	const values = mergeMappingInput(base, input);
	const row = {
		...values,
		reasoningEfforts: values.reasoningEfforts as ReasoningEffort[] | null,
		source: "airside" as const,
		status: "active" as const,
	};
	if (existing) {
		await tx
			.update(tables.modelProviderMapping)
			.set(row)
			.where(eq(tables.modelProviderMapping.id, existing.id));
	} else {
		await tx.insert(tables.modelProviderMapping).values({
			modelId,
			providerId,
			region,
			...row,
		});
	}
}

const listModelsRoute = createRoute({
	operationId: "admin_list_catalog_models",
	method: "get",
	path: "/catalog/models",
	request: {
		query: z.object({
			search: z.string().trim().max(200).optional(),
			provider: z.string().trim().max(100).optional(),
			managed: z.enum(["true", "false"]).optional(),
			status: z.enum(["active", "inactive"]).optional(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ models: z.array(modelSchema) }),
				},
			},
			description: "Static and managed models with their effective mappings.",
		},
	},
});

adminCatalog.openapi(listModelsRoute, async (c) => {
	const query = c.req.valid("query");
	const search = query.search?.toLowerCase();
	const models = (await loadCatalogModels()).filter(
		(model) =>
			(!search ||
				model.id.toLowerCase().includes(search) ||
				model.name.toLowerCase().includes(search) ||
				model.family.toLowerCase().includes(search)) &&
			(!query.provider ||
				model.mappings.some(
					(mapping) => mapping.providerId === query.provider,
				)) &&
			(!query.managed ||
				(query.managed === "true"
					? model.managed || model.mappings.some((mapping) => mapping.managed)
					: !model.managed)) &&
			(!query.status || model.status === query.status),
	);
	return c.json({ models }, 200);
});

const modelIdSchema = z
	.string()
	.trim()
	.regex(
		/^[a-z0-9][a-z0-9._-]{0,127}$/i,
		"Use letters, digits, dots, dashes and underscores",
	);

const createModelRoute = createRoute({
	operationId: "admin_create_catalog_model",
	method: "post",
	path: "/catalog/models",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						id: modelIdSchema,
						name: z.string().trim().min(1).max(200),
						family: z.string().trim().min(1).max(100),
						description: z.string().trim().max(2000).optional(),
						output: z.enum(["text", "embedding"]),
						aliases: z.array(modelIdSchema).max(20).optional(),
						mappings: z
							.array(mappingInputSchema.extend({ providerId: z.string() }))
							.max(50),
					}),
				},
			},
		},
	},
	responses: {
		201: {
			content: {
				"application/json": { schema: z.object({ model: modelSchema }) },
			},
			description: "Managed model created.",
		},
	},
});

adminCatalog.openapi(createModelRoute, async (c) => {
	const body = c.req.valid("json");
	const aliases = body.aliases ?? [];
	for (const name of [body.id, ...aliases]) {
		if (RESERVED_IDS.has(name) || isStaticModelName(name)) {
			throw new HTTPException(409, {
				message: `"${name}" is reserved or already a catalogue model`,
			});
		}
	}
	const existing = await db.query.model.findFirst({
		where: { id: { eq: body.id } },
	});
	if (existing) {
		throw new HTTPException(409, {
			message: `Model "${body.id}" already exists`,
		});
	}
	const providerIds = new Set<string>();
	for (const mapping of body.mappings) {
		const key = `${mapping.providerId}:${mapping.region ?? ""}`;
		if (providerIds.has(key)) {
			throw new HTTPException(400, {
				message: `Duplicate mapping for ${mapping.providerId}`,
			});
		}
		providerIds.add(key);
		await assertMappableProvider(mapping.providerId);
	}

	await db.transaction(async (tx) => {
		await tx.insert(tables.model).values({
			id: body.id,
			name: body.name,
			family: body.family,
			description: body.description ?? "(empty)",
			aliases,
			output: [body.output],
			status: "active",
		});
		// Canonical rows first: regional prices require one.
		const ordered = [...body.mappings].sort(
			(a, b) => Number(Boolean(a.region)) - Number(Boolean(b.region)),
		);
		for (const { providerId, ...mapping } of ordered) {
			await ensureBuiltinRows(tx, body.id, providerId);
			await upsertMapping(tx, body.id, providerId, mapping);
		}
	});
	await evictCatalogCaches();

	return c.json({ model: await getCatalogModel(body.id) }, 201);
});

const modelIdParams = z.object({ modelId: z.string() });

const updateModelRoute = createRoute({
	operationId: "admin_update_catalog_model",
	method: "patch",
	path: "/catalog/models/{modelId}",
	request: {
		params: modelIdParams,
		body: {
			content: {
				"application/json": {
					schema: z.object({
						name: z.string().trim().min(1).max(200).optional(),
						description: z.string().trim().max(2000).nullable().optional(),
						family: z.string().trim().min(1).max(100).optional(),
						status: z.enum(["active", "inactive"]).optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ model: modelSchema }) },
			},
			description: "Managed model updated.",
		},
	},
});

adminCatalog.openapi(updateModelRoute, async (c) => {
	const { modelId } = c.req.valid("param");
	const body = c.req.valid("json");
	if (findStaticModel(modelId)) {
		throw new HTTPException(400, {
			message:
				"Built-in models are defined in code; override their mappings instead",
		});
	}
	const existing = await db.query.model.findFirst({
		where: { id: { eq: modelId } },
	});
	if (!existing) {
		throw new HTTPException(404, { message: `Unknown model: ${modelId}` });
	}
	await db.transaction(async (tx) => {
		await tx
			.update(tables.model)
			.set({
				name: body.name,
				family: body.family,
				description:
					body.description === undefined
						? undefined
						: (body.description ?? "(empty)"),
				status: body.status,
			})
			.where(eq(tables.model.id, modelId));
		// Gateway lookups read mapping status, so the model switch cascades.
		if (body.status) {
			await tx
				.update(tables.modelProviderMapping)
				.set({ status: body.status })
				.where(
					and(
						eq(tables.modelProviderMapping.modelId, modelId),
						eq(tables.modelProviderMapping.source, "airside"),
					),
				);
		}
	});
	await evictCatalogCaches();

	return c.json({ model: await getCatalogModel(modelId) }, 200);
});

const mappingParams = z.object({ modelId: z.string(), providerId: z.string() });

const putMappingRoute = createRoute({
	operationId: "admin_put_catalog_mapping",
	method: "put",
	path: "/catalog/models/{modelId}/mappings/{providerId}",
	request: {
		params: mappingParams,
		body: {
			content: { "application/json": { schema: mappingInputSchema } },
		},
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ mapping: mappingSchema }) },
			},
			description:
				"Mapping created or updated. On a built-in pair this creates a DB override that wins over the static mapping.",
		},
	},
});

function findMapping(
	model: CatalogModel,
	providerId: string,
	region: string | null,
): Mapping {
	const mapping = model.mappings.find(
		(entry) => entry.providerId === providerId && entry.region === region,
	);
	if (!mapping) {
		throw new HTTPException(404, { message: "Mapping not found" });
	}
	return mapping;
}

adminCatalog.openapi(putMappingRoute, async (c) => {
	const { modelId, providerId } = c.req.valid("param");
	const body = c.req.valid("json");
	await assertMappableProvider(providerId);
	const isStatic = Boolean(findStaticModel(modelId));
	if (!isStatic) {
		const existing = await db.query.model.findFirst({
			where: { id: { eq: modelId } },
		});
		if (!existing) {
			throw new HTTPException(404, { message: `Unknown model: ${modelId}` });
		}
	}

	await db.transaction(async (tx) => {
		await ensureBuiltinRows(tx, modelId, providerId);
		await upsertMapping(tx, modelId, providerId, body);
	});
	await evictCatalogCaches();

	const model = await getCatalogModel(modelId);
	return c.json(
		{ mapping: findMapping(model, providerId, body.region ?? null) },
		200,
	);
});

const deleteMappingRoute = createRoute({
	operationId: "admin_delete_catalog_mapping",
	method: "delete",
	path: "/catalog/models/{modelId}/mappings/{providerId}",
	request: { params: mappingParams },
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ success: z.boolean() }) },
			},
			description:
				"Mapping deactivated (deactivatedAt set). Rows are never deleted because logs reference them.",
		},
	},
});

adminCatalog.openapi(deleteMappingRoute, async (c) => {
	const { modelId, providerId } = c.req.valid("param");
	const now = new Date();
	const staticMapping = findStaticMapping(modelId, providerId);

	await db.transaction(async (tx) => {
		const rows = await tx
			.select()
			.from(tables.modelProviderMapping)
			.where(
				and(
					eq(tables.modelProviderMapping.modelId, modelId),
					eq(tables.modelProviderMapping.providerId, providerId),
				),
			);
		const managed = rows.filter((row) => row.source === "airside");
		if (managed.length > 0) {
			await tx
				.update(tables.modelProviderMapping)
				.set({ deactivatedAt: now })
				.where(
					inArray(
						tables.modelProviderMapping.id,
						managed.map((row) => row.id),
					),
				);
			return;
		}
		if (!staticMapping) {
			throw new HTTPException(404, { message: "Mapping not found" });
		}
		// Retiring a built-in pair: an override row carrying the static values
		// and a deactivation date takes the pair over.
		await ensureBuiltinRows(tx, modelId, providerId);
		await upsertMapping(tx, modelId, providerId, {
			externalId: staticMapping.externalId,
			inputPrice: priceToString(staticMapping.inputPrice) ?? "0",
			outputPrice: priceToString(staticMapping.outputPrice) ?? "0",
			streaming: staticMapping.streaming !== false,
			deactivatedAt: now.toISOString(),
		});
	});
	await evictCatalogCaches();

	return c.json({ success: true }, 200);
});
