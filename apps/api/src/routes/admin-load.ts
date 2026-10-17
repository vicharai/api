import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

import { adminMiddleware } from "@/middleware/admin.js";
import {
	HOURLY_BUCKET_THRESHOLD_MINUTES,
	floorToHourStart,
	pickMappingHistoryTable,
} from "@/utils/history-window.js";

import {
	and,
	apiKeyHourlyStats,
	asc,
	avgEffectiveTtftSql,
	db,
	desc,
	eq,
	excludeRegionalMappingRows,
	gte,
	projectHourlyStats,
	sql,
	tables,
	type AnyColumn,
	type SQL,
} from "@llmgateway/db";
import { models, providers } from "@llmgateway/models";

import type { ServerTypes } from "@/vars.js";
import type { ModelDefinition } from "@llmgateway/models";

export const adminLoad = new OpenAPIHono<ServerTypes>();

adminLoad.use("/*", adminMiddleware);

const LOAD_WINDOWS = {
	"1h": { minutes: 60, bucketSeconds: 60 },
	"6h": { minutes: 360, bucketSeconds: 300 },
	"24h": { minutes: 1440, bucketSeconds: 900 },
	"7d": { minutes: 10080, bucketSeconds: 3600 },
	"30d": { minutes: 43200, bucketSeconds: 21600 },
	"90d": { minutes: 129600, bucketSeconds: 86400 },
	"365d": { minutes: 525600, bucketSeconds: 86400 },
} as const;

type LoadWindow = keyof typeof LOAD_WINDOWS;

const loadWindowSchema = z.enum([
	"1h",
	"6h",
	"24h",
	"7d",
	"30d",
	"90d",
	"365d",
]);
const incidentWindowSchema = z.enum(["1h", "6h", "24h", "7d"]);

const BREAKDOWN_LIMIT = 50;

interface WindowRange {
	start: Date;
	seconds: number;
	hourly: boolean;
	bucketSeconds: number;
}

function resolveWindow(window: LoadWindow, hourlyOnly = false): WindowRange {
	const { minutes, bucketSeconds } = LOAD_WINDOWS[window];
	const hourly = hourlyOnly || minutes > HOURLY_BUCKET_THRESHOLD_MINUTES;
	const windowMs = minutes * 60_000;
	const rawStart = new Date(Date.now() - windowMs);
	return {
		start: hourly ? floorToHourStart(rawStart) : rawStart,
		seconds: minutes * 60,
		hourly,
		bucketSeconds: hourly ? Math.max(bucketSeconds, 3600) : bucketSeconds,
	};
}

// Interpolated raw so the SELECT and GROUP BY expressions are textually equal.
function bucketEpochSql(column: AnyColumn, bucketSeconds: number): SQL<number> {
	const n = sql.raw(String(Math.trunc(bucketSeconds)));
	return sql<number>`(floor(extract(epoch from ${column}) / ${n}) * ${n})::bigint`;
}

function sumNumber(column: AnyColumn): SQL<number> {
	return sql<number>`COALESCE(SUM(${column}), 0)::float8`;
}

function rate(errors: number, requests: number): number {
	return requests > 0 ? errors / requests : 0;
}

function roundOrNull(value: number | string | null): number | null {
	return value === null ? null : Math.round(Number(value));
}

function epochToIso(epoch: number | string): string {
	return new Date(Number(epoch) * 1000).toISOString();
}

const modelNames = new Map(
	(models as readonly ModelDefinition[]).map((m) => [m.id, m.name ?? m.id]),
);
const providerNames = new Map(providers.map((p) => [p.id, p.name]));

const summarySchema = z.object({
	requests: z.number(),
	errors: z.number(),
	clientErrors: z.number(),
	errorRate: z.number().openapi({ description: "errors / requests (0-1)" }),
	requestsPerSecond: z.number(),
	avgDurationMs: z.number().nullable(),
	avgTtftMs: z.number().nullable(),
	inputTokens: z.number(),
	outputTokens: z.number(),
	totalTokens: z.number(),
	cost: z.number(),
});

const timeseriesPointSchema = z.object({
	timestamp: z.string(),
	requests: z.number(),
	errors: z.number(),
	totalTokens: z.number(),
	avgDurationMs: z.number().nullable(),
	avgTtftMs: z.number().nullable(),
});

const breakdownEntrySchema = z.object({
	key: z.string(),
	label: z.string(),
	requests: z.number(),
	errors: z.number(),
	errorRate: z.number(),
	totalTokens: z.number(),
	cost: z.number(),
	avgDurationMs: z.number().nullable(),
	avgTtftMs: z.number().nullable(),
});

const groupBySchema = z.enum([
	"model",
	"provider",
	"organization",
	"project",
	"apiKey",
]);

const loadOverviewSchema = z.object({
	window: loadWindowSchema,
	groupBy: groupBySchema,
	summary: summarySchema,
	timeseries: z.array(timeseriesPointSchema),
	breakdown: z.array(breakdownEntrySchema),
});

type LoadOverview = z.infer<typeof loadOverviewSchema>;
type Summary = LoadOverview["summary"];
type TimeseriesPoint = LoadOverview["timeseries"][number];
type BreakdownEntry = LoadOverview["breakdown"][number];

interface AggregateRow {
	requests: number;
	errors: number;
	clientErrors: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	cost: number;
	avgDurationMs: number | string | null;
	avgTtftMs: number | string | null;
}

function toSummary(row: AggregateRow | undefined, seconds: number): Summary {
	const requests = Number(row?.requests ?? 0);
	const errors = Number(row?.errors ?? 0);
	return {
		requests,
		errors,
		clientErrors: Number(row?.clientErrors ?? 0),
		errorRate: rate(errors, requests),
		requestsPerSecond: requests / seconds,
		avgDurationMs: roundOrNull(row?.avgDurationMs ?? null),
		avgTtftMs: roundOrNull(row?.avgTtftMs ?? null),
		inputTokens: Number(row?.inputTokens ?? 0),
		outputTokens: Number(row?.outputTokens ?? 0),
		totalTokens: Number(row?.totalTokens ?? 0),
		cost: Number(row?.cost ?? 0),
	};
}

function toBreakdownEntry(
	row: AggregateRow & { key: string; label: string | null },
): BreakdownEntry {
	const requests = Number(row.requests);
	const errors = Number(row.errors);
	return {
		key: row.key,
		label: row.label ?? row.key,
		requests,
		errors,
		errorRate: rate(errors, requests),
		totalTokens: Number(row.totalTokens),
		cost: Number(row.cost),
		avgDurationMs: roundOrNull(row.avgDurationMs),
		avgTtftMs: roundOrNull(row.avgTtftMs),
	};
}

async function mappingHistoryOverview(
	range: WindowRange,
	groupBy: "model" | "provider",
	metric: "requests" | "tokens",
): Promise<Omit<LoadOverview, "window" | "groupBy">> {
	const { table: mph, bucket } = pickMappingHistoryTable(range.hourly);
	const where = and(gte(bucket, range.start), excludeRegionalMappingRows(mph));
	const requests = sumNumber(mph.logsCount);
	const totalTokens = sumNumber(mph.totalTokens);
	const aggregates = {
		requests,
		errors: sumNumber(mph.errorsCount),
		clientErrors: sumNumber(mph.clientErrorsCount),
		inputTokens: sumNumber(mph.totalInputTokens),
		outputTokens: sumNumber(mph.totalOutputTokens),
		totalTokens,
		cost: sumNumber(mph.totalCost),
		avgDurationMs: sql<
			number | null
		>`SUM(${mph.totalDuration})::float8 / NULLIF(SUM(${mph.logsCount}), 0)`,
		avgTtftMs: avgEffectiveTtftSql(mph),
	};
	const bucketEpoch = bucketEpochSql(bucket, range.bucketSeconds);
	const groupColumn = groupBy === "model" ? mph.modelId : mph.providerId;

	const [summaryRows, seriesRows, groupRows] = await Promise.all([
		db.select(aggregates).from(mph).where(where),
		db
			.select({ bucket: bucketEpoch, ...aggregates })
			.from(mph)
			.where(where)
			.groupBy(bucketEpoch)
			.orderBy(asc(bucketEpoch)),
		db
			.select({ key: groupColumn, ...aggregates })
			.from(mph)
			.where(where)
			.groupBy(groupColumn)
			.orderBy(desc(metric === "tokens" ? totalTokens : requests))
			.limit(BREAKDOWN_LIMIT),
	]);

	const names = groupBy === "model" ? modelNames : providerNames;
	return {
		summary: toSummary(summaryRows[0], range.seconds),
		timeseries: seriesRows.map((row): TimeseriesPoint => ({
			timestamp: epochToIso(row.bucket),
			requests: Number(row.requests),
			errors: Number(row.errors),
			totalTokens: Number(row.totalTokens),
			avgDurationMs: roundOrNull(row.avgDurationMs),
			avgTtftMs: roundOrNull(row.avgTtftMs),
		})),
		breakdown: groupRows.map((row) =>
			toBreakdownEntry({ ...row, label: names.get(row.key) ?? row.key }),
		),
	};
}

async function hourlyStatsOverview(
	range: WindowRange,
	groupBy: "organization" | "project" | "apiKey",
	metric: "requests" | "tokens",
): Promise<Omit<LoadOverview, "window" | "groupBy">> {
	const stats = groupBy === "apiKey" ? apiKeyHourlyStats : projectHourlyStats;
	const where = gte(stats.hourTimestamp, range.start);
	const requests = sumNumber(stats.requestCount);
	const totalTokens = sumNumber(stats.totalTokens);
	const aggregates = {
		requests,
		errors: sumNumber(stats.errorCount),
		clientErrors: sumNumber(stats.clientErrorCount),
		inputTokens: sumNumber(stats.inputTokens),
		outputTokens: sumNumber(stats.outputTokens),
		totalTokens,
		cost: sumNumber(stats.cost),
		avgDurationMs: sql<number | null>`NULL`,
		avgTtftMs: sql<number | null>`NULL`,
	};
	const bucketEpoch = bucketEpochSql(stats.hourTimestamp, range.bucketSeconds);
	const orderMetric = desc(metric === "tokens" ? totalTokens : requests);

	const groupQuery = () => {
		if (groupBy === "apiKey") {
			return db
				.select({
					key: tables.apiKey.id,
					label: sql<
						string | null
					>`COALESCE(NULLIF(${tables.apiKey.description}, ''), ${tables.apiKey.tokenMasked})`,
					...aggregates,
				})
				.from(apiKeyHourlyStats)
				.innerJoin(
					tables.apiKey,
					eq(tables.apiKey.id, apiKeyHourlyStats.apiKeyId),
				)
				.where(where)
				.groupBy(tables.apiKey.id)
				.orderBy(orderMetric)
				.limit(BREAKDOWN_LIMIT);
		}
		if (groupBy === "project") {
			return db
				.select({
					key: tables.project.id,
					label: tables.project.name,
					...aggregates,
				})
				.from(projectHourlyStats)
				.innerJoin(
					tables.project,
					eq(tables.project.id, projectHourlyStats.projectId),
				)
				.where(where)
				.groupBy(tables.project.id)
				.orderBy(orderMetric)
				.limit(BREAKDOWN_LIMIT);
		}
		return db
			.select({
				key: tables.organization.id,
				label: tables.organization.name,
				...aggregates,
			})
			.from(projectHourlyStats)
			.innerJoin(
				tables.project,
				eq(tables.project.id, projectHourlyStats.projectId),
			)
			.innerJoin(
				tables.organization,
				eq(tables.organization.id, tables.project.organizationId),
			)
			.where(where)
			.groupBy(tables.organization.id)
			.orderBy(orderMetric)
			.limit(BREAKDOWN_LIMIT);
	};

	const [summaryRows, seriesRows, groupRows] = await Promise.all([
		db.select(aggregates).from(stats).where(where),
		db
			.select({ bucket: bucketEpoch, ...aggregates })
			.from(stats)
			.where(where)
			.groupBy(bucketEpoch)
			.orderBy(asc(bucketEpoch)),
		groupQuery(),
	]);

	return {
		summary: toSummary(summaryRows[0], range.seconds),
		timeseries: seriesRows.map((row): TimeseriesPoint => ({
			timestamp: epochToIso(row.bucket),
			requests: Number(row.requests),
			errors: Number(row.errors),
			totalTokens: Number(row.totalTokens),
			avgDurationMs: null,
			avgTtftMs: null,
		})),
		breakdown: groupRows.map(toBreakdownEntry),
	};
}

const getLoadOverview = createRoute({
	operationId: "admin_get_load_overview",
	method: "get",
	path: "/load/overview",
	request: {
		query: z.object({
			window: loadWindowSchema.default("24h").optional(),
			groupBy: groupBySchema.default("model").optional(),
			metric: z.enum(["requests", "tokens"]).default("requests").optional(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: loadOverviewSchema } },
			description:
				"Gateway load over the window from the aggregation tables. Model/provider grouping carries latency; organization/project/apiKey grouping does not (null).",
		},
	},
});

adminLoad.openapi(getLoadOverview, async (c) => {
	const query = c.req.valid("query");
	const window = query.window ?? "24h";
	const groupBy = query.groupBy ?? "model";
	const metric = query.metric ?? "requests";

	const result =
		groupBy === "model" || groupBy === "provider"
			? await mappingHistoryOverview(resolveWindow(window), groupBy, metric)
			: await hourlyStatsOverview(resolveWindow(window, true), groupBy, metric);

	return c.json({ window, groupBy, ...result }, 200);
});

const incidentCountsSchema = z.object({
	requests: z.number(),
	errors: z.number(),
	upstreamErrors: z.number(),
	gatewayErrors: z.number(),
	clientErrors: z.number(),
});

const providerIncidentsSchema = z.object({
	summary: incidentCountsSchema.extend({ errorRate: z.number() }),
	byModel: z.array(
		incidentCountsSchema.extend({
			modelId: z.string(),
			errorRate: z.number(),
		}),
	),
	timeseries: z.array(incidentCountsSchema.extend({ timestamp: z.string() })),
});

const getProviderIncidents = createRoute({
	operationId: "admin_get_provider_incidents",
	method: "get",
	path: "/providers/{providerId}/incidents",
	request: {
		params: z.object({ providerId: z.string() }),
		query: z.object({
			window: incidentWindowSchema.default("24h").optional(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: providerIncidentsSchema } },
			description:
				"Provider error rates per model and error class over the window (errorRate is 0-1).",
		},
	},
});

adminLoad.openapi(getProviderIncidents, async (c) => {
	const { providerId } = c.req.valid("param");
	const window = c.req.valid("query").window ?? "24h";
	const range = resolveWindow(window);
	const { table: mph, bucket } = pickMappingHistoryTable(range.hourly);
	const where = and(
		eq(mph.providerId, providerId),
		gte(bucket, range.start),
		excludeRegionalMappingRows(mph),
	);
	const errors = sumNumber(mph.errorsCount);
	const counts = {
		requests: sumNumber(mph.logsCount),
		errors,
		upstreamErrors: sumNumber(mph.upstreamErrorsCount),
		gatewayErrors: sumNumber(mph.gatewayErrorsCount),
		clientErrors: sumNumber(mph.clientErrorsCount),
	};
	const bucketEpoch = bucketEpochSql(bucket, range.bucketSeconds);

	const [summaryRows, modelRows, seriesRows] = await Promise.all([
		db.select(counts).from(mph).where(where),
		db
			.select({ modelId: mph.modelId, ...counts })
			.from(mph)
			.where(where)
			.groupBy(mph.modelId)
			.orderBy(desc(errors), asc(mph.modelId)),
		db
			.select({ bucket: bucketEpoch, ...counts })
			.from(mph)
			.where(where)
			.groupBy(bucketEpoch)
			.orderBy(asc(bucketEpoch)),
	]);

	const toCounts = (row: Record<keyof typeof counts, number> | undefined) => ({
		requests: Number(row?.requests ?? 0),
		errors: Number(row?.errors ?? 0),
		upstreamErrors: Number(row?.upstreamErrors ?? 0),
		gatewayErrors: Number(row?.gatewayErrors ?? 0),
		clientErrors: Number(row?.clientErrors ?? 0),
	});
	const summary = toCounts(summaryRows[0]);

	return c.json(
		{
			summary: {
				...summary,
				errorRate: rate(summary.errors, summary.requests),
			},
			byModel: modelRows.map((row) => {
				const entry = toCounts(row);
				return {
					modelId: row.modelId,
					...entry,
					errorRate: rate(entry.errors, entry.requests),
				};
			}),
			timeseries: seriesRows.map((row) => ({
				timestamp: epochToIso(row.bucket),
				...toCounts(row),
			})),
		},
		200,
	);
});
