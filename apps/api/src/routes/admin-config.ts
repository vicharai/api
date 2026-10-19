import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { adminMiddleware } from "@/middleware/admin.js";

import {
	getPlatformConfigState,
	mergeStoredPlatformConfig,
	readStoredPlatformConfig,
	removeStoredPlatformConfigKey,
} from "@llmgateway/db";
import {
	crossValidatePlatformConfig,
	describePlatformConfig,
	getPlatformConfigEntry,
	resolvePlatformConfig,
	validatePlatformConfigPatch,
	type PlatformConfigState,
	type PlatformConfigValidationError,
} from "@llmgateway/shared";

import type { ServerTypes } from "@/vars.js";

export const adminConfig = new OpenAPIHono<ServerTypes>();

adminConfig.use("/*", adminMiddleware);

// Every registry type: number, string, boolean, string list, number list
// (json presets) and null for unset optional numbers.
const configValueSchema = z.union([
	z.number(),
	z.string(),
	z.boolean(),
	z.array(z.string()),
	z.array(z.number()),
	z.null(),
]);
type ConfigValue = z.infer<typeof configValueSchema>;

const configEntrySchema = z.object({
	key: z.string(),
	category: z.string(),
	label: z.string(),
	description: z.string(),
	type: z.enum(["number", "string", "boolean", "stringList", "json"]),
	unit: z.string().nullable(),
	min: z.number().nullable(),
	max: z.number().nullable(),
	options: z.array(z.string()).nullable(),
	nullable: z.boolean(),
	default: configValueSchema,
	value: configValueSchema,
	source: z.enum(["db", "env", "default"]),
	env: z.string().nullable(),
	secret: z.literal(false),
});

const configResponseSchema = z
	.object({
		categories: z.array(z.object({ id: z.string(), label: z.string() })),
		entries: z.array(configEntrySchema),
	})
	.openapi({});

const validationErrorSchema = z.object({
	message: z.string(),
	errors: z.array(z.object({ key: z.string(), message: z.string() })),
});

function toConfigResponse(
	state: PlatformConfigState,
): z.infer<typeof configResponseSchema> {
	const { categories, entries } = describePlatformConfig(state);
	return {
		categories,
		entries: entries.map((entry) => ({
			...entry,
			options: entry.options ? [...entry.options] : null,
			default: entry.default as ConfigValue,
			value: entry.value as ConfigValue,
		})),
	};
}

async function describeCurrentConfig() {
	return toConfigResponse(await getPlatformConfigState());
}

function formatErrors(errors: PlatformConfigValidationError[]): string {
	return `Invalid settings: ${errors
		.map((error) => `${error.key} (${error.message})`)
		.join(", ")}`;
}

const getConfig = createRoute({
	operationId: "admin_get_platform_config",
	method: "get",
	path: "/settings/config",
	request: {},
	responses: {
		200: {
			content: { "application/json": { schema: configResponseSchema } },
			description: "Platform settings with effective values and sources.",
		},
	},
});

adminConfig.openapi(getConfig, async (c) => {
	return c.json(await describeCurrentConfig(), 200);
});

const updateConfig = createRoute({
	operationId: "admin_update_platform_config",
	method: "put",
	path: "/settings/config",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({ values: z.record(z.string(), z.unknown()) }),
				},
			},
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: configResponseSchema } },
			description: "Updated platform settings.",
		},
		400: {
			content: { "application/json": { schema: validationErrorSchema } },
			description: "One or more values are invalid.",
		},
	},
});

adminConfig.openapi(updateConfig, async (c) => {
	const { values } = c.req.valid("json");
	const patch = validatePlatformConfigPatch(values);
	if (!patch.ok) {
		return c.json(
			{ message: formatErrors(patch.errors), errors: patch.errors },
			400,
		);
	}

	const merged = { ...(await readStoredPlatformConfig()), ...patch.values };
	const crossErrors = crossValidatePlatformConfig(
		resolvePlatformConfig(merged).values,
	);
	if (crossErrors.length > 0) {
		return c.json(
			{ message: formatErrors(crossErrors), errors: crossErrors },
			400,
		);
	}

	await mergeStoredPlatformConfig(patch.values);
	return c.json(await describeCurrentConfig(), 200);
});

const resetConfigKey = createRoute({
	operationId: "admin_reset_platform_config_key",
	method: "delete",
	path: "/settings/config/{key}",
	request: {
		params: z.object({ key: z.string() }),
	},
	responses: {
		200: {
			content: { "application/json": { schema: configResponseSchema } },
			description: "Platform settings after the reset.",
		},
	},
});

adminConfig.openapi(resetConfigKey, async (c) => {
	const { key } = c.req.valid("param");
	if (!getPlatformConfigEntry(key)) {
		throw new HTTPException(404, { message: `Unknown setting: ${key}` });
	}
	await removeStoredPlatformConfigKey(key);
	return c.json(await describeCurrentConfig(), 200);
});

export default adminConfig;
