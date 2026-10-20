import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { adminMiddleware } from "@/middleware/admin.js";

import {
	hasStorageRedisConfig,
	LOG_QUEUE,
	redisClient,
	storageRedisClient,
} from "@llmgateway/cache";
import {
	db,
	drizzleCache,
	getTableName,
	invalidateCacheTags,
	invalidateOrganizationsCache,
	CATALOG_DELETIONS_CACHE_TAG,
	ROUTING_OVERRIDES_CACHE_TAG,
	sql,
	systemSettingCacheTag,
	tables,
} from "@llmgateway/db";
import {
	CONTENT_FILTER_SETTING_ID,
	GATEWAY_MAINTENANCE_SETTING_ID,
	WORKER_HEARTBEAT_KEY,
} from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";
import type { Redis } from "ioredis";

export const adminSystem = new OpenAPIHono<ServerTypes>();

adminSystem.use("/*", adminMiddleware);

// --- System health ---

const CHECK_TIMEOUT_MS = 3_000;
const WORKER_STALE_MS = 2 * 60 * 1000;
const LOG_QUEUE_DEGRADED_DEPTH = 10_000;

const checkStatuses = ["ok", "degraded", "down"] as const;
type CheckStatus = (typeof checkStatuses)[number];

interface HealthCheck {
	name: string;
	status: CheckStatus;
	latencyMs: number | null;
	detail: string | null;
}

type Probe<T> =
	| { ok: true; value: T; latencyMs: number }
	| { ok: false; error: string; latencyMs: number };

/** Runs a check with a timeout; a failure is the check's result, not an error. */
async function probe<T>(run: () => Promise<T>): Promise<Probe<T>> {
	const started = performance.now();
	let timer: NodeJS.Timeout | undefined;
	try {
		const value = await Promise.race([
			run(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`Timed out after ${CHECK_TIMEOUT_MS}ms`)),
					CHECK_TIMEOUT_MS,
				);
			}),
		]);
		return {
			ok: true,
			value,
			latencyMs: Math.round(performance.now() - started),
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
			latencyMs: Math.round(performance.now() - started),
		};
	} finally {
		clearTimeout(timer);
	}
}

async function pingCheck(
	name: string,
	run: () => Promise<unknown>,
): Promise<HealthCheck> {
	const result = await probe(run);
	return {
		name,
		status: result.ok ? "ok" : "down",
		latencyMs: result.latencyMs,
		detail: result.ok ? null : result.error,
	};
}

async function redisPing(client: Redis, name: string) {
	return await pingCheck(name, async () => await client.ping());
}

async function workerCheck(): Promise<HealthCheck> {
	const result = await probe(
		async () => await redisClient.get(WORKER_HEARTBEAT_KEY),
	);
	if (!result.ok) {
		return {
			name: "worker",
			status: "down",
			latencyMs: null,
			detail: result.error,
		};
	}
	if (!result.value) {
		return {
			name: "worker",
			status: "degraded",
			latencyMs: null,
			detail: "No heartbeat recorded",
		};
	}
	const ageMs = Date.now() - new Date(result.value).getTime();
	return {
		name: "worker",
		status: ageMs > WORKER_STALE_MS ? "degraded" : "ok",
		latencyMs: null,
		detail: `Last heartbeat ${Math.round(ageMs / 1000)}s ago`,
	};
}

async function logQueueCheck(): Promise<HealthCheck> {
	const result = await probe(async () => await redisClient.llen(LOG_QUEUE));
	if (!result.ok) {
		return {
			name: "log_queue",
			status: "down",
			latencyMs: result.latencyMs,
			detail: result.error,
		};
	}
	return {
		name: "log_queue",
		status: result.value > LOG_QUEUE_DEGRADED_DEPTH ? "degraded" : "ok",
		latencyMs: result.latencyMs,
		detail: `${result.value} queued`,
	};
}

const systemSettingTableName = getTableName(tables.systemSetting);

async function settingsCacheCheck(): Promise<HealthCheck> {
	const result = await probe(
		async () =>
			await redisClient.scard(`drizzle:table_keys:${systemSettingTableName}`),
	);
	return {
		name: "settings_cache",
		status: result.ok ? "ok" : "down",
		latencyMs: result.latencyMs,
		detail: result.ok ? `${result.value} cached entries` : result.error,
	};
}

/** Latest Drizzle migration, or null when the database was schema-pushed. */
async function getMigrationVersion(): Promise<string | null> {
	const present = await db.execute<{ present: boolean }>(
		sql`select to_regclass('drizzle.__drizzle_migrations') is not null as present`,
	);
	if (present.rows[0]?.present !== true) {
		return null;
	}
	const latest = await db.execute<{ count: number; created_at: string | null }>(
		sql`select count(*)::int as count, max(created_at)::text as created_at from drizzle.__drizzle_migrations`,
	);
	const row = latest.rows[0];
	if (!row?.created_at) {
		return null;
	}
	const appliedAt = new Date(Number(row.created_at)).toISOString();
	return `#${row.count} (${appliedAt})`;
}

const healthSchema = z
	.object({
		checks: z.array(
			z.object({
				name: z.string(),
				status: z.enum(checkStatuses),
				latencyMs: z.number().nullable(),
				detail: z.string().nullable(),
			}),
		),
		version: z.string().nullable(),
		migration: z.string().nullable(),
		checkedAt: z.string(),
	})
	.openapi({});

const getSystemHealthRoute = createRoute({
	operationId: "admin_get_system_health",
	method: "get",
	path: "/system/health",
	request: {},
	responses: {
		200: {
			content: { "application/json": { schema: healthSchema } },
			description:
				"Postgres, Redis, worker heartbeat, log queue and settings cache status.",
		},
	},
});

adminSystem.openapi(getSystemHealthRoute, async (c) => {
	const checks = await Promise.all([
		pingCheck("postgres", async () => await db.execute(sql`select 1`)),
		redisPing(redisClient, "redis"),
		...(hasStorageRedisConfig
			? [redisPing(storageRedisClient, "storage_redis")]
			: []),
		workerCheck(),
		logQueueCheck(),
		settingsCacheCheck(),
	]);
	const postgresUp = checks[0]?.status === "ok";
	return c.json({
		checks,
		version: process.env.APP_VERSION ?? null,
		migration: postgresUp ? await getMigrationVersion() : null,
		checkedAt: new Date().toISOString(),
	});
});

// --- Cache tools ---

const RESPONSE_CACHE_KEY = /^(?:stream:)?[^:]+:[0-9a-f]{64}$/;
const SCAN_COUNT = 500;

/**
 * Unlinks gateway response-cache keys (`[stream:]<projectId>:<sha256>`, see
 * `generateCacheKey`) matching `pattern`. SCAN + batched UNLINK, never KEYS.
 */
async function unlinkResponseCache(pattern: string): Promise<number> {
	let cursor = "0";
	let removed = 0;
	do {
		const [next, keys] = await storageRedisClient.scan(
			cursor,
			"MATCH",
			pattern,
			"COUNT",
			SCAN_COUNT,
		);
		cursor = next;
		const matching = keys.filter((key) => RESPONSE_CACHE_KEY.test(key));
		if (matching.length > 0) {
			removed += await storageRedisClient.unlink(...matching);
		}
	} while (cursor !== "0");
	return removed;
}

async function flushResponseCache(organizationId?: string): Promise<number> {
	if (!organizationId) {
		return await unlinkResponseCache("*");
	}
	const projects = await db.query.project.findMany({
		where: { organizationId: { eq: organizationId } },
		columns: { id: true },
	});
	let removed = 0;
	for (const { id } of projects) {
		removed += await unlinkResponseCache(`${id}:*`);
		removed += await unlinkResponseCache(`stream:${id}:*`);
	}
	return removed;
}

async function isModelId(id: string): Promise<boolean> {
	const model = await db.query.model.findFirst({
		where: { id: { eq: id.includes("/") ? id.split("/")[1]! : id } },
		columns: { id: true },
	});
	return model !== undefined;
}

async function assertOrganizationExists(id: string | undefined) {
	if (!id) {
		throw new HTTPException(400, { message: "targetId is required" });
	}
	const org = await db.query.organization.findFirst({
		where: { id: { eq: id } },
		columns: { id: true },
	});
	if (!org) {
		throw new HTTPException(404, { message: "Organization not found" });
	}
	return id;
}

const invalidateCacheRoute = createRoute({
	operationId: "admin_invalidate_cache",
	method: "post",
	path: "/cache/invalidate",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z
						.object({
							scope: z.enum([
								"organization",
								"apiKey",
								"settings",
								"responseCache",
							]),
							targetId: z.string().trim().min(1).optional(),
						})
						.openapi({}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z
						.object({ success: z.boolean(), cleared: z.number().nullable() })
						.openapi({}),
				},
			},
			description:
				"Cache evicted. `cleared` counts removed response-cache keys; null for the other scopes.",
		},
		400: {
			description:
				"targetId missing for the organization scope, or a model id given for the response cache (only org or global flushes are possible).",
		},
		404: { description: "Target not found." },
	},
});

adminSystem.openapi(invalidateCacheRoute, async (c) => {
	const { scope, targetId } = c.req.valid("json");

	switch (scope) {
		case "organization":
			await invalidateOrganizationsCache([
				await assertOrganizationExists(targetId),
			]);
			return c.json({ success: true, cleared: null });
		case "apiKey": {
			if (targetId) {
				const key = await db.query.apiKey.findFirst({
					where: { id: { eq: targetId } },
					columns: { id: true },
				});
				if (!key) {
					throw new HTTPException(404, { message: "API key not found" });
				}
			}
			// Gateway key lookups are cached per token hash, not per id, so the
			// whole table's entries are evicted.
			await drizzleCache.onMutate({
				tables: [getTableName(tables.apiKey)],
			});
			return c.json({ success: true, cleared: null });
		}
		case "settings":
			await invalidateCacheTags([
				...[CONTENT_FILTER_SETTING_ID, GATEWAY_MAINTENANCE_SETTING_ID].map(
					systemSettingCacheTag,
				),
				ROUTING_OVERRIDES_CACHE_TAG,
				CATALOG_DELETIONS_CACHE_TAG,
			]);
			return c.json({ success: true, cleared: null });
		case "responseCache":
			if (targetId && (await isModelId(targetId))) {
				throw new HTTPException(400, {
					message:
						"Response cache keys hash the model into the request body, so they can only be flushed per organization or globally.",
				});
			}
			return c.json({
				success: true,
				cleared: await flushResponseCache(
					targetId ? await assertOrganizationExists(targetId) : undefined,
				),
			});
	}
});
