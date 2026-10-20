import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { adminMiddleware } from "@/middleware/admin.js";

import { db, desc, eq, tables } from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const adminRequestLookup = new OpenAPIHono<ServerTypes>();

adminRequestLookup.use("/*", adminMiddleware);

const MAX_ATTEMPTS = 20;

const errorDetailsSchema = z
	.object({
		statusCode: z.number(),
		statusText: z.string(),
		responseText: z.string(),
		cause: z.string().optional(),
	})
	.nullable();

const attemptSchema = z.object({
	id: z.string(),
	createdAt: z.string(),
	usedProvider: z.string(),
	usedModel: z.string(),
	hasError: z.boolean(),
	unifiedFinishReason: z.string().nullable(),
	retried: z.boolean(),
});

const requestSchema = z.object({
	id: z.string(),
	requestId: z.string(),
	createdAt: z.string(),
	organization: z.object({
		id: z.string(),
		name: z.string().nullable(),
		retentionLevel: z.enum(["retain", "none"]).nullable(),
	}),
	project: z.object({ id: z.string(), name: z.string().nullable() }),
	apiKey: z.object({ id: z.string(), description: z.string().nullable() }),
	requestedModel: z.string(),
	requestedProvider: z.string().nullable(),
	usedModel: z.string(),
	usedProvider: z.string(),
	usedMode: z.string(),
	source: z.string().nullable(),
	apiOrigin: z.string().nullable(),
	streamed: z.boolean(),
	cached: z.boolean(),
	canceled: z.boolean(),
	hasError: z.boolean(),
	finishReason: z.string().nullable(),
	unifiedFinishReason: z.string().nullable(),
	errorDetails: errorDetailsSchema,
	duration: z.number(),
	timeToFirstToken: z.number().nullable(),
	promptTokens: z.string().nullable(),
	completionTokens: z.string().nullable(),
	totalTokens: z.string().nullable(),
	cost: z.number().nullable(),
	inputCost: z.number().nullable(),
	outputCost: z.number().nullable(),
	estimatedCost: z.boolean(),
	payloadRetained: z.boolean().openapi({
		description:
			"False when the organization does not retain payloads or retention cleanup already ran; `payload` is then null.",
	}),
	payload: z
		.object({
			messages: z.unknown(),
			content: z.string().nullable(),
			reasoningContent: z.string().nullable(),
		})
		.nullable(),
});

const lookupRoute = createRoute({
	operationId: "admin_lookup_request",
	method: "get",
	path: "/requests/{requestId}",
	request: { params: z.object({ requestId: z.string().trim().min(1) }) },
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						request: requestSchema,
						attempts: z.array(attemptSchema),
					}),
				},
			},
			description:
				"The final log row of a request plus every logged attempt (retries).",
		},
		404: { description: "No log row has this request id." },
	},
});

adminRequestLookup.openapi(lookupRoute, async (c) => {
	const { requestId } = c.req.valid("param");

	// The one sanctioned per-request `log` read: a point lookup on
	// log_request_id_idx, never a scan.
	const rows = await db
		.select({
			id: tables.log.id,
			requestId: tables.log.requestId,
			createdAt: tables.log.createdAt,
			organizationId: tables.log.organizationId,
			projectId: tables.log.projectId,
			apiKeyId: tables.log.apiKeyId,
			requestedModel: tables.log.requestedModel,
			requestedProvider: tables.log.requestedProvider,
			usedModel: tables.log.usedModel,
			usedProvider: tables.log.usedProvider,
			usedMode: tables.log.usedMode,
			source: tables.log.source,
			apiOrigin: tables.log.apiOrigin,
			streamed: tables.log.streamed,
			cached: tables.log.cached,
			canceled: tables.log.canceled,
			hasError: tables.log.hasError,
			finishReason: tables.log.finishReason,
			unifiedFinishReason: tables.log.unifiedFinishReason,
			errorDetails: tables.log.errorDetails,
			duration: tables.log.duration,
			timeToFirstToken: tables.log.timeToFirstToken,
			promptTokens: tables.log.promptTokens,
			completionTokens: tables.log.completionTokens,
			totalTokens: tables.log.totalTokens,
			cost: tables.log.cost,
			inputCost: tables.log.inputCost,
			outputCost: tables.log.outputCost,
			estimatedCost: tables.log.estimatedCost,
			retried: tables.log.retried,
			dataRetentionCleanedUp: tables.log.dataRetentionCleanedUp,
		})
		.from(tables.log)
		.where(eq(tables.log.requestId, requestId))
		.orderBy(desc(tables.log.createdAt))
		.limit(MAX_ATTEMPTS);

	if (rows.length === 0) {
		throw new HTTPException(404, { message: "No request with this id" });
	}

	// The served attempt is the latest one not superseded by a retry.
	const final = rows.find((r) => !r.retried) ?? rows[0];

	const [organization, project, apiKey] = await Promise.all([
		db.query.organization.findFirst({
			where: { id: { eq: final.organizationId } },
			columns: { name: true, retentionLevel: true },
		}),
		db.query.project.findFirst({
			where: { id: { eq: final.projectId } },
			columns: { name: true },
		}),
		db.query.apiKey.findFirst({
			where: { id: { eq: final.apiKeyId } },
			columns: { description: true },
		}),
	]);

	const payloadRetained =
		organization?.retentionLevel === "retain" &&
		final.dataRetentionCleanedUp !== true;
	const payload = payloadRetained
		? await db.query.log.findFirst({
				where: { id: { eq: final.id } },
				columns: { messages: true, content: true, reasoningContent: true },
			})
		: undefined;

	return c.json(
		{
			request: {
				id: final.id,
				requestId: final.requestId,
				createdAt: final.createdAt.toISOString(),
				organization: {
					id: final.organizationId,
					name: organization?.name ?? null,
					retentionLevel: organization?.retentionLevel ?? null,
				},
				project: { id: final.projectId, name: project?.name ?? null },
				apiKey: {
					id: final.apiKeyId,
					description: apiKey?.description ?? null,
				},
				requestedModel: final.requestedModel,
				requestedProvider: final.requestedProvider,
				usedModel: final.usedModel,
				usedProvider: final.usedProvider,
				usedMode: final.usedMode,
				source: final.source,
				apiOrigin: final.apiOrigin,
				streamed: final.streamed ?? false,
				cached: final.cached ?? false,
				canceled: final.canceled ?? false,
				hasError: final.hasError ?? false,
				finishReason: final.finishReason,
				unifiedFinishReason: final.unifiedFinishReason,
				errorDetails: final.errorDetails ?? null,
				duration: final.duration,
				timeToFirstToken: final.timeToFirstToken,
				promptTokens: final.promptTokens,
				completionTokens: final.completionTokens,
				totalTokens: final.totalTokens,
				cost: final.cost,
				inputCost: final.inputCost,
				outputCost: final.outputCost,
				estimatedCost: final.estimatedCost ?? false,
				payloadRetained,
				payload: payload
					? {
							messages: payload.messages,
							content: payload.content?.includes(";base64,")
								? "[image_generated]"
								: payload.content,
							reasoningContent: payload.reasoningContent,
						}
					: null,
			},
			attempts: rows.map((r) => ({
				id: r.id,
				createdAt: r.createdAt.toISOString(),
				usedProvider: r.usedProvider,
				usedModel: r.usedModel,
				hasError: r.hasError ?? false,
				unifiedFinishReason: r.unifiedFinishReason,
				retried: r.retried ?? false,
			})),
		},
		200,
	);
});
