import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { Decimal } from "decimal.js";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { discoverTemplateModels } from "@/lib/provider-templates.js";
import { adminMiddleware } from "@/middleware/admin.js";
import {
	assertMappableProvider,
	ensureBuiltinRows,
	evictCatalogCaches,
	findMappingRow,
	findStaticMapping,
	findStaticModel,
	getCatalogModel,
	isStaticModelName,
	isStaticProviderId,
	loadCatalogModels,
	loadCustomClaim,
	loadDeletions,
	modelIdSchema,
	modelSchema,
	priceSchema,
	RESERVED_IDS,
	rowMappingValues,
	saveMappingValues,
	staticMappingValues,
	upsertMapping,
	type CatalogModel,
	type MappingInput,
	type MappingValues,
	type Tx,
} from "@/routes/admin-catalog.js";

import { readProviderKey, redactToken } from "@llmgateway/actions";
import { db, eq, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import { models as staticModels } from "@llmgateway/models";
import {
	buildCsv,
	CATALOG_IMPORT_COLUMNS,
	CATALOG_IMPORT_REQUIRED_COLUMNS,
	getProviderTemplate,
	parseCsv,
	type CatalogImportColumn,
} from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";
import type { ModelDefinition } from "@llmgateway/models";

/**
 * Fast catalog tools: discover and import an upstream's models, bulk
 * JSON/CSV import and export, clone a model and bulk price changes.
 */
export const adminCatalogQuick = new OpenAPIHono<ServerTypes>();

adminCatalogQuick.use("/*", adminMiddleware);

const SIGNIFICANT_DIGITS = 12;
const MAX_IMPORT_ROWS = 2000;
const MAX_PRICE_ROWS = 2000;
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

type CatalogMapping = CatalogModel["mappings"][number];

/** Per-token price as `<n>e-6`, rounded to 12 significant digits. */
function formatPerToken(value: Decimal): string {
	const perMillion = value
		.times(1_000_000)
		.toSignificantDigits(SIGNIFICANT_DIGITS);
	return perMillion.isZero() ? "0" : `${perMillion.toFixed()}e-6`;
}

function perMillionToPerToken(value: string): string {
	return formatPerToken(new Decimal(value).div(1_000_000));
}

function perTokenToPerMillion(value: string | null): string | null {
	return value === null ? null : new Decimal(value).times(1_000_000).toFixed();
}

function samePrice(a: string | null, b: string | null): boolean {
	return a === null || b === null ? a === b : new Decimal(a).eq(b);
}

function isActiveMapping(mapping: CatalogMapping): boolean {
	return (
		!mapping.deactivatedAt || Date.parse(mapping.deactivatedAt) > Date.now()
	);
}

function canonicalMapping(
	model: CatalogModel | undefined,
	providerId: string,
): CatalogMapping | undefined {
	return model?.mappings.find(
		(mapping) => mapping.providerId === providerId && mapping.region === null,
	);
}

/** First id segment, e.g. "llama" for "llama-3.1-8b". */
function deriveFamily(modelId: string): string {
	return modelId.split(/[-_.]/)[0] || modelId;
}

/** Why a model id cannot take new mappings, or null when it can. */
function modelIdProblem(
	modelId: string,
	model: CatalogModel | undefined,
): string | null {
	if (RESERVED_IDS.has(modelId)) {
		return "reserved id";
	}
	if (!findStaticModel(modelId) && isStaticModelName(modelId)) {
		return "alias of a catalogue model; use its id";
	}
	if (model?.deleted) {
		return "model is deleted; restore it first";
	}
	return null;
}

async function loadCatalogIndex(): Promise<Map<string, CatalogModel>> {
	return new Map((await loadCatalogModels()).map((model) => [model.id, model]));
}

async function insertManagedModel(
	tx: Tx,
	model: { id: string; name: string; family: string },
): Promise<void> {
	await tx.insert(tables.model).values({
		id: model.id,
		name: model.name,
		family: model.family,
		description: "(empty)",
		aliases: [],
		output: ["text"],
		status: "active",
	});
}

const providerIdParams = z.object({ id: z.string() });

// ---------------------------------------------------------------------------
// Discover and import from a provider
// ---------------------------------------------------------------------------

const discoveredSchema = z.object({
	externalId: z.string(),
	displayName: z.string().nullable(),
	/** Catalog id the import dialog proposes; resolves catalogue aliases. */
	suggestedModelId: z.string(),
	contextSize: z.number().nullable(),
	maxOutput: z.number().nullable(),
	/** Per-token prices when the listing publishes them (OpenRouter style). */
	inputPrice: z.string().nullable(),
	outputPrice: z.string().nullable(),
	cachedInputPrice: z.string().nullable(),
	existing: z
		.object({ modelId: z.string(), providerId: z.string() })
		.nullable(),
});

function suggestModelId(externalId: string): string {
	const tail = externalId.split("/").pop() ?? externalId;
	const slug =
		tail
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/-{2,}/g, "-")
			.replace(/^[^a-z0-9]+/, "")
			.replace(/-+$/, "")
			.slice(0, 128) || "model";
	const owner = (staticModels as readonly ModelDefinition[]).find((model) =>
		(model.aliases as readonly string[] | undefined)?.includes(slug),
	);
	return owner?.id ?? slug;
}

const discoverRoute = createRoute({
	operationId: "admin_discover_catalog_provider_models",
	method: "post",
	path: "/catalog/providers/{id}/discover",
	request: { params: providerIdParams },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						provider: z.string(),
						models: z.array(discoveredSchema),
					}),
				},
			},
			description:
				"Models the custom provider's upstream lists, in its API style, marked when already mapped. 400 for API styles without a listing.",
		},
	},
});

adminCatalogQuick.openapi(discoverRoute, async (c) => {
	const { id } = c.req.valid("param");
	if (isStaticProviderId(id)) {
		throw new HTTPException(400, {
			message:
				"Discovery reads a custom provider's upstream; built-in providers ship with their catalogue",
		});
	}
	const claim = await loadCustomClaim(id);
	if (claim.status !== "active" || !claim.customBaseUrl) {
		throw new HTTPException(400, { message: "Provider is inactive" });
	}
	if ((await loadDeletions("provider")).has(id)) {
		throw new HTTPException(400, { message: "Provider is deleted" });
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
		throw new HTTPException(400, {
			message: "No active platform credential for this provider",
		});
	}
	const template = getProviderTemplate(claim.customTemplate);
	const token = readProviderKey(credential);
	let result: Awaited<ReturnType<typeof discoverTemplateModels>>;
	try {
		result = await discoverTemplateModels(
			template,
			claim.customBaseUrl,
			token,
			credential.config ?? {},
		);
	} catch (error) {
		const message = redactToken(
			error instanceof Error ? error.message : String(error),
			token,
		);
		logger.warn("Catalog provider discovery failed", {
			provider: id,
			error: message,
		});
		throw new HTTPException(502, { message });
	}
	if (!result) {
		throw new HTTPException(400, {
			message: `${template.label} has no model listing API; add models by hand or import a CSV`,
		});
	}
	if (result.error !== null) {
		throw new HTTPException(502, { message: result.error });
	}

	const existing = new Map<string, { modelId: string; providerId: string }>();
	for (const model of await loadCatalogModels()) {
		if (model.deleted) {
			continue;
		}
		for (const mapping of model.mappings) {
			if (
				mapping.providerId === id &&
				isActiveMapping(mapping) &&
				!existing.has(mapping.externalId)
			) {
				existing.set(mapping.externalId, { modelId: model.id, providerId: id });
			}
		}
	}
	const unique = new Map(
		result.models.map((model) => [model.externalId, model]),
	);
	const models = [...unique.values()]
		.sort((a, b) => a.externalId.localeCompare(b.externalId))
		.map((model) => ({
			...model,
			suggestedModelId: suggestModelId(model.externalId),
			existing: existing.get(model.externalId) ?? null,
		}));
	return c.json({ provider: id, models }, 200);
});

const importItemSchema = z.object({
	externalId: z.string().trim().min(1).max(200),
	/** New ids create a managed model; existing ids gain a mapping. */
	modelId: modelIdSchema,
	name: z.string().trim().min(1).max(200).optional(),
	family: z.string().trim().min(1).max(100).optional(),
	inputPrice: priceSchema,
	outputPrice: priceSchema,
	cachedInputPrice: priceSchema.optional(),
	contextSize: z.number().int().positive().optional(),
	maxOutput: z.number().int().positive().optional(),
	streaming: z.boolean().optional(),
	vision: z.boolean().optional(),
	tools: z.boolean().optional(),
	jsonOutput: z.boolean().optional(),
	reasoning: z.boolean().optional(),
});

const providerImportRoute = createRoute({
	operationId: "admin_import_catalog_provider_models",
	method: "post",
	path: "/catalog/providers/{id}/import",
	request: {
		params: providerIdParams,
		body: {
			content: {
				"application/json": {
					schema: z.object({
						items: z.array(importItemSchema).min(1).max(500),
						defaults: z
							.object({
								/** Added to every per-token price, e.g. 20 for +20%. */
								markupPercent: z.number().min(-100).max(1000).optional(),
								family: z.string().trim().min(1).max(100).optional(),
							})
							.optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						created: z.array(z.string()),
						mapped: z.array(
							z.object({ modelId: z.string(), externalId: z.string() }),
						),
						skipped: z.array(
							z.object({ externalId: z.string(), reason: z.string() }),
						),
					}),
				},
			},
			description:
				"Creates managed models for new ids and maps every item to the provider in one transaction. Reserved, deleted and already mapped items are skipped.",
		},
	},
});

adminCatalogQuick.openapi(providerImportRoute, async (c) => {
	const { id } = c.req.valid("param");
	const { items, defaults } = c.req.valid("json");
	await assertMappableProvider(id);
	if ((await loadDeletions("provider")).has(id)) {
		throw new HTTPException(400, { message: "Provider is deleted" });
	}
	const catalog = await loadCatalogIndex();
	const factor = new Decimal(defaults?.markupPercent ?? 0).div(100).plus(1);
	const markup = (price: string) =>
		formatPerToken(new Decimal(price).times(factor));

	const created: { id: string; name: string; family: string }[] = [];
	const mapped: (z.infer<typeof importItemSchema> & { input: MappingInput })[] =
		[];
	const skipped: { externalId: string; reason: string }[] = [];
	const used = new Set<string>();
	for (const item of items) {
		const model = catalog.get(item.modelId);
		const problem = modelIdProblem(item.modelId, model);
		const current = canonicalMapping(model, id);
		const reason =
			problem ??
			(used.has(item.modelId)
				? "duplicate model id in this import"
				: current && isActiveMapping(current)
					? `already mapped as ${current.externalId}`
					: null);
		if (reason) {
			skipped.push({ externalId: item.externalId, reason });
			continue;
		}
		used.add(item.modelId);
		if (!model) {
			created.push({
				id: item.modelId,
				name: item.name ?? item.modelId,
				family: item.family ?? defaults?.family ?? deriveFamily(item.modelId),
			});
		}
		mapped.push({
			...item,
			input: {
				externalId: item.externalId,
				inputPrice: markup(item.inputPrice),
				outputPrice: markup(item.outputPrice),
				cachedInputPrice:
					item.cachedInputPrice === undefined
						? undefined
						: markup(item.cachedInputPrice),
				contextSize: item.contextSize,
				maxOutput: item.maxOutput,
				streaming: item.streaming ?? current?.streaming ?? true,
				vision: item.vision,
				tools: item.tools,
				jsonOutput: item.jsonOutput,
				reasoning: item.reasoning,
				deactivatedAt: null,
			},
		});
	}

	if (mapped.length > 0) {
		await db.transaction(async (tx) => {
			for (const model of created) {
				await insertManagedModel(tx, model);
			}
			for (const item of mapped) {
				await ensureBuiltinRows(tx, item.modelId, id);
				await upsertMapping(tx, item.modelId, id, item.input);
			}
		});
		await evictCatalogCaches();
	}

	return c.json(
		{
			created: created.map((model) => model.id),
			mapped: mapped.map((item) => ({
				modelId: item.modelId,
				externalId: item.externalId,
			})),
			skipped,
		},
		200,
	);
});

// ---------------------------------------------------------------------------
// Bulk JSON / CSV import and export
// ---------------------------------------------------------------------------

const IMPORT_COLUMNS = CATALOG_IMPORT_COLUMNS;
type ImportColumn = CatalogImportColumn;
type RawRow = Partial<Record<ImportColumn, string>>;

const BOOLEAN_COLUMNS = [
	"vision",
	"tools",
	"jsonOutput",
	"reasoning",
	"streaming",
] as const;
const PRICE_PER_M = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i;

function isImportColumn(value: string): value is ImportColumn {
	return (IMPORT_COLUMNS as readonly string[]).includes(value);
}

function assertColumns(columns: string[]): void {
	const unknown = columns.filter((column) => !isImportColumn(column));
	if (unknown.length > 0) {
		throw new HTTPException(400, {
			message: `Unknown column(s): ${unknown.join(", ")}. Expected: ${IMPORT_COLUMNS.join(", ")}`,
		});
	}
}

/** Raw rows from the uploaded content; file-level problems are a 400. */
function readImportRows(format: "json" | "csv", content: string): RawRow[] {
	if (format === "csv") {
		const [header, ...lines] = parseCsv(content);
		if (!header) {
			throw new HTTPException(400, { message: "The CSV is empty" });
		}
		const columns = header.map((cell) => cell.trim());
		assertColumns(columns);
		return lines.map((cells) => {
			const row: RawRow = {};
			columns.forEach((column, index) => {
				if (isImportColumn(column)) {
					row[column] = (cells[index] ?? "").trim();
				}
			});
			return row;
		});
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		throw new HTTPException(400, { message: "The JSON is not valid" });
	}
	const list =
		parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as { rows?: unknown }).rows
			: parsed;
	if (!Array.isArray(list)) {
		throw new HTTPException(400, {
			message: "Expected a JSON array of rows (or { rows: [...] })",
		});
	}
	return list.map((entry, index) => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			throw new HTTPException(400, {
				message: `Row ${index + 1} is not an object`,
			});
		}
		const fields = entry as Record<string, unknown>;
		assertColumns(Object.keys(fields));
		const row: RawRow = {};
		for (const [key, value] of Object.entries(fields)) {
			if (isImportColumn(key) && value !== null && value !== undefined) {
				row[key] =
					typeof value === "string"
						? value.trim()
						: typeof value === "number" || typeof value === "boolean"
							? String(value)
							: JSON.stringify(value);
			}
		}
		return row;
	});
}

interface ParsedRow {
	modelId: string;
	name: string | undefined;
	family: string | undefined;
	providerId: string;
	externalId: string;
	inputPrice: string;
	outputPrice: string;
	cachedInputPrice: string | undefined;
	contextSize: number | undefined;
	maxOutput: number | undefined;
	vision: boolean | undefined;
	tools: boolean | undefined;
	jsonOutput: boolean | undefined;
	reasoning: boolean | undefined;
	streaming: boolean | undefined;
}

function parseBoolean(
	raw: string | undefined,
	column: string,
	errors: string[],
): boolean | undefined {
	if (!raw) {
		return undefined;
	}
	const value = raw.toLowerCase();
	if (["true", "1", "yes", "y"].includes(value)) {
		return true;
	}
	if (["false", "0", "no", "n"].includes(value)) {
		return false;
	}
	errors.push(`${column} must be true or false`);
	return undefined;
}

function parseCount(
	raw: string | undefined,
	column: string,
	errors: string[],
): number | undefined {
	if (!raw) {
		return undefined;
	}
	const value = Number(raw);
	if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value <= 0) {
		errors.push(`${column} must be a positive whole number`);
		return undefined;
	}
	return value;
}

function parsePrice(
	raw: string | undefined,
	column: string,
	errors: string[],
): string | undefined {
	if (!raw) {
		return undefined;
	}
	if (!PRICE_PER_M.test(raw) || !Number.isFinite(Number(raw))) {
		errors.push(`${column} must be a non-negative decimal ($ per 1M tokens)`);
		return undefined;
	}
	return perMillionToPerToken(raw);
}

function parseRow(raw: RawRow): { row: ParsedRow | null; errors: string[] } {
	const errors: string[] = [];
	for (const column of CATALOG_IMPORT_REQUIRED_COLUMNS) {
		if (!raw[column]) {
			errors.push(`${column} is required`);
		}
	}
	const modelId = raw.modelId ?? "";
	if (modelId && !modelIdSchema.safeParse(modelId).success) {
		errors.push("modelId may use letters, digits, dots, dashes, underscores");
	}
	const externalId = raw.externalId ?? "";
	if (externalId.length > 200) {
		errors.push("externalId is longer than 200 characters");
	}
	if ((raw.name?.length ?? 0) > 200 || (raw.family?.length ?? 0) > 100) {
		errors.push("name or family is too long");
	}
	const inputPrice = parsePrice(raw.inputPricePerM, "inputPricePerM", errors);
	const outputPrice = parsePrice(
		raw.outputPricePerM,
		"outputPricePerM",
		errors,
	);
	const row: ParsedRow = {
		modelId,
		name: raw.name || undefined,
		family: raw.family || undefined,
		providerId: raw.providerId ?? "",
		externalId,
		inputPrice: inputPrice ?? "0",
		outputPrice: outputPrice ?? "0",
		cachedInputPrice: parsePrice(
			raw.cachedInputPricePerM,
			"cachedInputPricePerM",
			errors,
		),
		contextSize: parseCount(raw.contextSize, "contextSize", errors),
		maxOutput: parseCount(raw.maxOutput, "maxOutput", errors),
		vision: parseBoolean(raw.vision, "vision", errors),
		tools: parseBoolean(raw.tools, "tools", errors),
		jsonOutput: parseBoolean(raw.jsonOutput, "jsonOutput", errors),
		reasoning: parseBoolean(raw.reasoning, "reasoning", errors),
		streaming: parseBoolean(raw.streaming, "streaming", errors),
	};
	return { row: errors.length > 0 ? null : row, errors };
}

/** Whether applying `row` would leave the effective mapping as it is. */
function mappingUnchanged(row: ParsedRow, current: CatalogMapping): boolean {
	const same = <T>(next: T | undefined, value: T) =>
		next === undefined || next === value;
	return (
		isActiveMapping(current) &&
		current.externalId === row.externalId &&
		samePrice(row.inputPrice, current.inputPrice) &&
		samePrice(row.outputPrice, current.outputPrice) &&
		(row.cachedInputPrice === undefined ||
			samePrice(row.cachedInputPrice, current.cachedInputPrice)) &&
		same(row.contextSize, current.contextSize) &&
		same(row.maxOutput, current.maxOutput) &&
		BOOLEAN_COLUMNS.every((column) => same(row[column], current[column]))
	);
}

type ModelAction = "create" | "update" | "unchanged" | "builtin";
type MappingAction = "create" | "update" | "unchanged";

interface PlannedRow {
	row: number;
	modelId: string;
	providerId: string;
	externalId: string;
	model: ModelAction | null;
	mapping: MappingAction | null;
	errors: string[];
	parsed: ParsedRow | null;
}

/** Validates every row against the catalog and decides what applying does. */
async function planImport(rows: RawRow[]): Promise<PlannedRow[]> {
	const [catalog, providerDeletions, customClaims] = await Promise.all([
		loadCatalogIndex(),
		loadDeletions("provider"),
		db.query.providerClaim.findMany({
			where: { kind: { eq: "custom" }, status: { eq: "active" } },
			columns: { providerId: true },
		}),
	]);
	const customIds = new Set(customClaims.map((claim) => claim.providerId));
	const pairs = new Set<string>();
	const modelNames = new Map<string, { name?: string; family?: string }>();

	return rows.map((raw, index): PlannedRow => {
		const { row, errors } = parseRow(raw);
		const planned: PlannedRow = {
			row: index + 1,
			modelId: raw.modelId ?? "",
			providerId: raw.providerId ?? "",
			externalId: raw.externalId ?? "",
			model: null,
			mapping: null,
			errors,
			parsed: row,
		};
		if (!row) {
			return planned;
		}
		const model = catalog.get(row.modelId);
		const problem = modelIdProblem(row.modelId, model);
		if (problem) {
			errors.push(problem);
		}
		const providerKnown =
			!RESERVED_IDS.has(row.providerId) &&
			(isStaticProviderId(row.providerId) || customIds.has(row.providerId));
		if (!providerKnown) {
			errors.push(`unknown or inactive provider ${row.providerId}`);
		} else if (providerDeletions.has(row.providerId)) {
			errors.push(`provider ${row.providerId} is deleted`);
		}
		const pair = `${row.modelId}\u0000${row.providerId}`;
		if (pairs.has(pair)) {
			errors.push("duplicate model and provider in this file");
		}
		pairs.add(pair);

		const first = modelNames.get(row.modelId);
		if (!first) {
			modelNames.set(row.modelId, { name: row.name, family: row.family });
			planned.model = !model
				? "create"
				: !model.managed
					? "builtin"
					: (row.name && row.name !== model.name) ||
						  (row.family && row.family !== model.family)
						? "update"
						: "unchanged";
			if (!model && !row.name) {
				errors.push("name is required for a new model");
			}
		} else if (
			(row.name && first.name && row.name !== first.name) ||
			(row.family && first.family && row.family !== first.family)
		) {
			errors.push(`conflicting name or family for ${row.modelId}`);
		}
		const current = canonicalMapping(model, row.providerId);
		planned.mapping = !current
			? "create"
			: mappingUnchanged(row, current)
				? "unchanged"
				: "update";
		if (errors.length > 0) {
			planned.model = null;
			planned.mapping = null;
		}
		return planned;
	});
}

async function applyImport(
	planned: PlannedRow[],
	catalog: Map<string, CatalogModel>,
): Promise<void> {
	await db.transaction(async (tx) => {
		for (const entry of planned) {
			const row = entry.parsed;
			if (!row) {
				continue;
			}
			if (entry.model === "create") {
				await insertManagedModel(tx, {
					id: row.modelId,
					name: row.name ?? row.modelId,
					family: row.family ?? deriveFamily(row.modelId),
				});
			} else if (entry.model === "update") {
				await tx
					.update(tables.model)
					.set({ name: row.name, family: row.family })
					.where(eq(tables.model.id, row.modelId));
			}
		}
		for (const entry of planned) {
			const row = entry.parsed;
			if (!row || entry.mapping === null || entry.mapping === "unchanged") {
				continue;
			}
			const current = canonicalMapping(
				catalog.get(row.modelId),
				row.providerId,
			);
			await ensureBuiltinRows(tx, row.modelId, row.providerId);
			await upsertMapping(tx, row.modelId, row.providerId, {
				externalId: row.externalId,
				inputPrice: row.inputPrice,
				outputPrice: row.outputPrice,
				cachedInputPrice: row.cachedInputPrice,
				contextSize: row.contextSize,
				maxOutput: row.maxOutput,
				streaming: row.streaming ?? current?.streaming ?? true,
				vision: row.vision,
				tools: row.tools,
				jsonOutput: row.jsonOutput,
				reasoning: row.reasoning,
				deactivatedAt: null,
			});
		}
	});
}

const importReportSchema = z.object({
	applied: z.boolean(),
	summary: z.object({
		rows: z.number(),
		errors: z.number(),
		modelsCreated: z.number(),
		modelsUpdated: z.number(),
		mappingsCreated: z.number(),
		mappingsUpdated: z.number(),
		unchanged: z.number(),
	}),
	rows: z.array(
		z.object({
			row: z.number(),
			modelId: z.string(),
			providerId: z.string(),
			externalId: z.string(),
			model: z.enum(["create", "update", "unchanged", "builtin"]).nullable(),
			mapping: z.enum(["create", "update", "unchanged"]).nullable(),
			errors: z.array(z.string()),
		}),
	),
});

const bulkImportRoute = createRoute({
	operationId: "admin_import_catalog",
	method: "post",
	path: "/catalog/import",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						format: z.enum(["json", "csv"]),
						content: z.string().min(1).max(MAX_CONTENT_BYTES),
						dryRun: z.boolean().optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: importReportSchema } },
			description: `Per-row report. Without dryRun, a file without errors is applied in one transaction (max ${MAX_IMPORT_ROWS} rows; prices in $ per 1M tokens).`,
		},
	},
});

adminCatalogQuick.openapi(bulkImportRoute, async (c) => {
	const { format, content, dryRun } = c.req.valid("json");
	const raw = readImportRows(format, content);
	if (raw.length === 0) {
		throw new HTTPException(400, { message: "The file has no rows" });
	}
	if (raw.length > MAX_IMPORT_ROWS) {
		throw new HTTPException(400, {
			message: `At most ${MAX_IMPORT_ROWS} rows per import`,
		});
	}
	const planned = await planImport(raw);
	const failed = planned.filter((entry) => entry.errors.length > 0).length;
	const count = (key: "model" | "mapping", value: string) =>
		planned.filter((entry) => entry[key] === value).length;
	const report = {
		summary: {
			rows: planned.length,
			errors: failed,
			modelsCreated: count("model", "create"),
			modelsUpdated: count("model", "update"),
			mappingsCreated: count("mapping", "create"),
			mappingsUpdated: count("mapping", "update"),
			unchanged: count("mapping", "unchanged"),
		},
		rows: planned.map((entry) => ({
			row: entry.row,
			modelId: entry.modelId,
			providerId: entry.providerId,
			externalId: entry.externalId,
			model: entry.model,
			mapping: entry.mapping,
			errors: entry.errors,
		})),
	};
	if (dryRun) {
		return c.json({ applied: false, ...report }, 200);
	}
	if (failed > 0) {
		throw new HTTPException(400, {
			message: `${failed} row(s) have errors; run a dry run to see them`,
		});
	}
	await applyImport(planned, await loadCatalogIndex());
	await evictCatalogCaches();
	return c.json({ applied: true, ...report }, 200);
});

const exportRowSchema = z.object({
	modelId: z.string(),
	name: z.string(),
	family: z.string(),
	providerId: z.string(),
	externalId: z.string(),
	inputPricePerM: z.string().nullable(),
	outputPricePerM: z.string().nullable(),
	cachedInputPricePerM: z.string().nullable(),
	contextSize: z.number().nullable(),
	maxOutput: z.number().nullable(),
	vision: z.boolean().nullable(),
	tools: z.boolean().nullable(),
	jsonOutput: z.boolean(),
	reasoning: z.boolean().nullable(),
	streaming: z.boolean(),
});

const exportRoute = createRoute({
	operationId: "admin_export_catalog",
	method: "get",
	path: "/catalog/export",
	request: {
		query: z.object({
			format: z.enum(["json", "csv"]).optional(),
			/** managed (default): managed models and overrides; all: every live mapping. */
			scope: z.enum(["managed", "all"]).optional(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.array(exportRowSchema) },
				"text/csv": { schema: z.string() },
			},
			description:
				"Live region-less mappings in the import row shape, so the file round-trips through POST /catalog/import.",
		},
	},
});

adminCatalogQuick.openapi(exportRoute, async (c) => {
	const { format, scope } = c.req.valid("query");
	const rows: z.infer<typeof exportRowSchema>[] = [];
	for (const model of await loadCatalogModels()) {
		if (model.deleted) {
			continue;
		}
		for (const mapping of model.mappings) {
			if (
				mapping.region !== null ||
				!isActiveMapping(mapping) ||
				(scope !== "all" && !model.managed && !mapping.managed)
			) {
				continue;
			}
			rows.push({
				modelId: model.id,
				name: model.name,
				family: model.family,
				providerId: mapping.providerId,
				externalId: mapping.externalId,
				inputPricePerM: perTokenToPerMillion(mapping.inputPrice),
				outputPricePerM: perTokenToPerMillion(mapping.outputPrice),
				cachedInputPricePerM: perTokenToPerMillion(mapping.cachedInputPrice),
				contextSize: mapping.contextSize,
				maxOutput: mapping.maxOutput,
				vision: mapping.vision,
				tools: mapping.tools,
				jsonOutput: mapping.jsonOutput,
				reasoning: mapping.reasoning,
				streaming: mapping.streaming,
			});
		}
	}
	if (format === "csv") {
		const csv = buildCsv(
			IMPORT_COLUMNS,
			rows.map((row) => IMPORT_COLUMNS.map((column) => row[column])),
		);
		return c.text(`${csv}\n`, 200, {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": 'attachment; filename="catalog.csv"',
		});
	}
	return c.json(rows, 200);
});

// ---------------------------------------------------------------------------
// Clone
// ---------------------------------------------------------------------------

interface MappingEntry {
	providerId: string;
	region: string | null;
	values: MappingValues;
}

/** Effective mapping values of a model, as loadCatalogModels serves them. */
async function loadMappingEntries(modelId: string): Promise<MappingEntry[]> {
	const rows = await db.query.modelProviderMapping.findMany({
		where: { modelId: { eq: modelId }, source: { eq: "airside" } },
	});
	const overridden = new Set(
		rows.filter((row) => row.region === null).map((row) => row.providerId),
	);
	return [
		...(findStaticModel(modelId)?.providers ?? [])
			.filter((mapping) => !overridden.has(mapping.providerId))
			.map((mapping) => ({
				providerId: mapping.providerId as string,
				region: null,
				values: staticMappingValues(mapping),
			})),
		...rows.map((row) => ({
			providerId: row.providerId,
			region: row.region,
			values: rowMappingValues(row, findStaticMapping(modelId, row.providerId)),
		})),
	];
}

const cloneRoute = createRoute({
	operationId: "admin_clone_catalog_model",
	method: "post",
	path: "/catalog/models/{modelId}/clone",
	request: {
		params: z.object({ modelId: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						newId: modelIdSchema,
						name: z.string().trim().min(1).max(200).optional(),
						/** Providers to copy; defaults to every live mapping. */
						providerIds: z
							.array(z.string().min(1).max(100))
							.max(100)
							.optional(),
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
			description:
				"New managed model with the source's definition and the selected live mappings (prices and capabilities copied).",
		},
	},
});

adminCatalogQuick.openapi(cloneRoute, async (c) => {
	const { modelId } = c.req.valid("param");
	const body = c.req.valid("json");
	const source = await getCatalogModel(modelId);
	if (RESERVED_IDS.has(body.newId) || isStaticModelName(body.newId)) {
		throw new HTTPException(409, {
			message: `"${body.newId}" is reserved or already a catalogue model`,
		});
	}
	if (await db.query.model.findFirst({ where: { id: { eq: body.newId } } })) {
		throw new HTTPException(409, {
			message: `Model "${body.newId}" already exists`,
		});
	}
	const deletedProviders = await loadDeletions("provider");
	const live = (await loadMappingEntries(modelId)).filter(
		(entry) =>
			!entry.values.deactivatedAt ||
			entry.values.deactivatedAt.getTime() > Date.now(),
	);
	const wanted = new Set(
		body.providerIds ??
			live
				.map((entry) => entry.providerId)
				.filter((id) => !deletedProviders.has(id)),
	);
	for (const providerId of wanted) {
		if (!live.some((entry) => entry.providerId === providerId)) {
			throw new HTTPException(400, {
				message: `${modelId} has no live mapping on ${providerId}`,
			});
		}
		if (deletedProviders.has(providerId)) {
			throw new HTTPException(400, {
				message: `Provider ${providerId} is deleted`,
			});
		}
		await assertMappableProvider(providerId);
	}
	// Regional prices need their provider's default row, so it goes first.
	const entries = live
		.filter(
			(entry) =>
				wanted.has(entry.providerId) &&
				(entry.region === null ||
					live.some(
						(other) =>
							other.providerId === entry.providerId && other.region === null,
					)),
		)
		.sort((a, b) => Number(a.region !== null) - Number(b.region !== null));

	const staticSource = findStaticModel(modelId);
	const dbSource = staticSource
		? undefined
		: await db.query.model.findFirst({ where: { id: { eq: modelId } } });
	await db.transaction(async (tx) => {
		await tx.insert(tables.model).values({
			id: body.newId,
			name: body.name ?? `${source.name} (copy)`,
			family: source.family,
			description: source.description ?? "(empty)",
			aliases: [],
			output: source.output,
			free: staticSource?.free ?? dbSource?.free ?? false,
			stability: staticSource?.stability ?? dbSource?.stability ?? "stable",
			status: "active",
		});
		for (const entry of entries) {
			await ensureBuiltinRows(tx, body.newId, entry.providerId);
			await saveMappingValues(
				tx,
				{
					modelId: body.newId,
					providerId: entry.providerId,
					region: entry.region,
				},
				{ ...entry.values, deactivatedAt: null },
				undefined,
			);
		}
	});
	await evictCatalogCaches();

	return c.json({ model: await getCatalogModel(body.newId) }, 201);
});

// ---------------------------------------------------------------------------
// Bulk price change
// ---------------------------------------------------------------------------

const PRICE_FIELDS = [
	"inputPrice",
	"outputPrice",
	"cachedInputPrice",
	"cacheWriteInputPrice",
	"imageInputPrice",
] as const;
type PriceField = (typeof PRICE_FIELDS)[number];
const DEFAULT_PRICE_FIELDS: PriceField[] = [
	"inputPrice",
	"outputPrice",
	"cachedInputPrice",
];

const pricesSchema = z.object({
	inputPrice: z.string().nullable(),
	outputPrice: z.string().nullable(),
	cachedInputPrice: z.string().nullable(),
	cacheWriteInputPrice: z.string().nullable(),
	imageInputPrice: z.string().nullable(),
});
type Prices = z.infer<typeof pricesSchema>;

const idListSchema = z
	.array(z.string().trim().min(1).max(200))
	.min(1)
	.max(2000);

const bulkPriceRoute = createRoute({
	operationId: "admin_bulk_update_catalog_prices",
	method: "post",
	path: "/catalog/prices/bulk-update",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						/** Model/provider pairs, or every live mapping of the models and/or providers. */
						targets: z.union([
							z
								.array(
									z.object({
										modelId: z.string().min(1).max(200),
										providerId: z.string().min(1).max(100),
									}),
								)
								.min(1)
								.max(MAX_PRICE_ROWS),
							z
								.object({
									modelIds: idListSchema.optional(),
									providerIds: idListSchema.optional(),
								})
								.refine(
									(value) => value.modelIds || value.providerIds,
									"Pick models or providers",
								),
						]),
						change: z.object({
							type: z.enum(["percent", "set"]),
							/** Percent change (e.g. "-10"), or the new $ per 1M tokens. */
							value: z
								.string()
								.trim()
								.regex(/^-?(?:\d+(?:\.\d+)?|\.\d+)$/, "Use a plain decimal"),
							fields: z.array(z.enum(PRICE_FIELDS)).min(1).optional(),
						}),
						dryRun: z.boolean().optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						applied: z.boolean(),
						matched: z.number(),
						changed: z.number(),
						rows: z.array(
							z.object({
								modelId: z.string(),
								providerId: z.string(),
								region: z.string().nullable(),
								externalId: z.string(),
								before: pricesSchema,
								after: pricesSchema,
								changed: z.boolean(),
							}),
						),
					}),
				},
			},
			description:
				"Before/after per-token prices (12 significant digits). Without dryRun, changed rows are written in one transaction; built-in pairs get override rows. Empty prices stay empty.",
		},
	},
});

adminCatalogQuick.openapi(bulkPriceRoute, async (c) => {
	const { targets, change, dryRun } = c.req.valid("json");
	const value = new Decimal(change.value);
	if (change.type === "percent" && (value.lt(-100) || value.gt(10_000))) {
		throw new HTTPException(400, {
			message: "Percent change must be between -100 and 10000",
		});
	}
	if (change.type === "set" && value.isNegative()) {
		throw new HTTPException(400, { message: "Prices cannot be negative" });
	}
	const fields = change.fields ?? DEFAULT_PRICE_FIELDS;
	const factor = value.div(100).plus(1);
	const transform = (price: string | null): string | null =>
		price === null
			? null
			: change.type === "percent"
				? formatPerToken(new Decimal(price).times(factor))
				: perMillionToPerToken(change.value);

	const pairs = Array.isArray(targets)
		? new Set(targets.map((t) => `${t.modelId}\u0000${t.providerId}`))
		: null;
	const modelIds =
		!Array.isArray(targets) && targets.modelIds
			? new Set(targets.modelIds)
			: null;
	const providerIds =
		!Array.isArray(targets) && targets.providerIds
			? new Set(targets.providerIds)
			: null;
	const rows: {
		modelId: string;
		providerId: string;
		region: string | null;
		externalId: string;
		before: Prices;
		after: Prices;
		changed: boolean;
	}[] = [];
	const found = new Set<string>();
	for (const model of await loadCatalogModels()) {
		if (model.deleted || (modelIds && !modelIds.has(model.id))) {
			continue;
		}
		for (const mapping of model.mappings) {
			const pair = `${model.id}\u0000${mapping.providerId}`;
			if (
				!isActiveMapping(mapping) ||
				(pairs && !pairs.has(pair)) ||
				(providerIds && !providerIds.has(mapping.providerId))
			) {
				continue;
			}
			found.add(pair);
			const before: Prices = {
				inputPrice: mapping.inputPrice,
				outputPrice: mapping.outputPrice,
				cachedInputPrice: mapping.cachedInputPrice,
				cacheWriteInputPrice: mapping.cacheWriteInputPrice,
				imageInputPrice: mapping.imageInputPrice,
			};
			const after = { ...before };
			for (const field of fields) {
				after[field] = transform(before[field]);
			}
			rows.push({
				modelId: model.id,
				providerId: mapping.providerId,
				region: mapping.region,
				externalId: mapping.externalId,
				before,
				after,
				changed: PRICE_FIELDS.some(
					(field) => !samePrice(before[field], after[field]),
				),
			});
		}
	}
	const missing = pairs ? [...pairs].filter((pair) => !found.has(pair)) : [];
	if (missing.length > 0) {
		throw new HTTPException(400, {
			message: `No live mapping for ${missing
				.slice(0, 10)
				.map((pair) => pair.replace("\u0000", " on "))
				.join(", ")}`,
		});
	}
	if (rows.length === 0) {
		throw new HTTPException(400, { message: "No live mappings match" });
	}
	if (rows.length > MAX_PRICE_ROWS) {
		throw new HTTPException(400, {
			message: `${rows.length} mappings match; narrow the selection to ${MAX_PRICE_ROWS}`,
		});
	}
	const changed = rows.filter((row) => row.changed);
	if (!dryRun && changed.length > 0) {
		await db.transaction(async (tx) => {
			for (const row of changed) {
				const existing = await findMappingRow(
					tx,
					row.modelId,
					row.providerId,
					row.region,
				);
				const staticMapping = findStaticMapping(row.modelId, row.providerId);
				const base =
					existing?.source === "airside"
						? rowMappingValues(existing, staticMapping)
						: staticMapping && row.region === null
							? staticMappingValues(staticMapping)
							: null;
				if (!base) {
					throw new HTTPException(409, {
						message: `${row.modelId} on ${row.providerId} changed meanwhile; retry`,
					});
				}
				const values: MappingValues = { ...base };
				for (const field of fields) {
					values[field] = row.after[field];
				}
				await ensureBuiltinRows(tx, row.modelId, row.providerId);
				await saveMappingValues(
					tx,
					{
						modelId: row.modelId,
						providerId: row.providerId,
						region: row.region,
					},
					values,
					existing,
				);
			}
		});
		await evictCatalogCaches();
	}
	return c.json(
		{
			applied: !dryRun && changed.length > 0,
			matched: rows.length,
			changed: changed.length,
			rows,
		},
		200,
	);
});
