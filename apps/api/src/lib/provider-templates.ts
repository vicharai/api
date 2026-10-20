import { Decimal } from "decimal.js";
import { HTTPException } from "hono/http-exception";

import {
	getGcpServiceAccountAccessToken,
	redactToken,
	validateProviderKey,
} from "@llmgateway/actions";
import {
	normalizeProviderTemplateOptions,
	providerTemplateUsesServiceAccount,
	type ProviderTemplate,
} from "@llmgateway/shared";
import { assertSafeProviderUrl } from "@llmgateway/shared/url-safety-node";

import type { ProviderValidationResult } from "@llmgateway/models";

const PROBE_TIMEOUT_MS = 30_000;

/** The template's settings with defaults applied; 400 when invalid. */
export function resolveTemplateOptions(
	template: ProviderTemplate,
	raw: Record<string, string> | null | undefined,
): Record<string, string> {
	const { options, errors } = normalizeProviderTemplateOptions(template, raw);
	if (errors.length > 0) {
		throw new HTTPException(400, { message: errors.join("; ") });
	}
	return options;
}

/**
 * A service-account credential must be complete JSON whose token exchange
 * targets a safe host: the gateway POSTs a signed JWT to its `token_uri`.
 */
export async function assertTemplateCredential(
	template: ProviderTemplate,
	options: Record<string, string>,
	token: string,
): Promise<void> {
	if (!providerTemplateUsesServiceAccount(template, options)) {
		return;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(token);
	} catch {
		throw new HTTPException(400, {
			message: "The credential must be service account JSON",
		});
	}
	const account = (parsed ?? {}) as Record<string, unknown>;
	for (const field of ["client_email", "private_key", "token_uri"]) {
		if (typeof account[field] !== "string" || !account[field]) {
			throw new HTTPException(400, {
				message: `Service account JSON is missing ${field}`,
			});
		}
	}
	try {
		await assertSafeProviderUrl(account.token_uri as string);
	} catch (error) {
		throw new HTTPException(400, {
			message: `Service account token_uri is not allowed: ${error instanceof Error ? error.message : String(error)}`,
		});
	}
}

interface ModelsRequest {
	url: string;
	headers: Record<string, string>;
}

function modelsRequest(
	template: ProviderTemplate,
	baseUrl: string,
	token: string,
	options: Record<string, string>,
): ModelsRequest | null {
	if (!template.modelListing) {
		return null;
	}
	switch (template.id) {
		case "openai-compatible":
			return {
				url: `${baseUrl}/v1/models`,
				headers: { Authorization: `Bearer ${token}` },
			};
		case "anthropic":
			return {
				url: `${baseUrl}/v1/models`,
				headers: { "x-api-key": token, "anthropic-version": "2023-06-01" },
			};
		case "google-ai-studio":
			return {
				url: `${baseUrl}/v1beta/models?key=${encodeURIComponent(token)}`,
				headers: {},
			};
		case "azure":
			return {
				url:
					options.deploymentType === "ai-foundry"
						? `${baseUrl}/openai/v1/models`
						: `${baseUrl}/openai/models?api-version=${options.apiVersion ?? "2024-10-21"}`,
				headers: { "api-key": token },
			};
		default:
			return null;
	}
}

/** One upstream model as a listing describes it; prices are per token. */
export interface DiscoveredModel {
	externalId: string;
	displayName: string | null;
	contextSize: number | null;
	maxOutput: number | null;
	inputPrice: string | null;
	outputPrice: string | null;
	cachedInputPrice: string | null;
}

type Fields = Record<string, unknown>;

function asFields(value: unknown): Fields | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Fields)
		: null;
}

function firstString(item: Fields, keys: string[]): string | null {
	for (const key of keys) {
		const value = item[key];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

function firstCount(item: Fields | null, keys: string[]): number | null {
	for (const key of keys) {
		const value = item?.[key];
		if (typeof value === "number" && Number.isInteger(value) && value > 0) {
			return value;
		}
	}
	return null;
}

/** A listed per-token price ("0.000003") as `<n>e-6`; negative means "varies". */
function listedPrice(value: unknown): string | null {
	const raw =
		typeof value === "number"
			? String(value)
			: typeof value === "string"
				? value.trim()
				: null;
	if (raw === null || !/^\d+(\.\d+)?(e-?\d+)?$/i.test(raw)) {
		return null;
	}
	const perMillion = new Decimal(raw).times(1_000_000);
	return perMillion.isZero() ? "0" : `${perMillion.toFixed()}e-6`;
}

/**
 * Reads OpenAI (`data`), Gemini (`models`) and bare-array listings, including
 * OpenRouter-style `pricing` and context fields when present.
 */
function readDiscoveredModels(json: unknown): DiscoveredModel[] {
	const record = asFields(json);
	const entries: unknown[] = Array.isArray(json)
		? json
		: Array.isArray(record?.data)
			? record.data
			: Array.isArray(record?.models)
				? record.models
				: [];
	const models: DiscoveredModel[] = [];
	for (const entry of entries) {
		const item = asFields(entry);
		if (!item) {
			continue;
		}
		const methods = item.supportedGenerationMethods;
		if (
			Array.isArray(methods) &&
			!methods.includes("generateContent") &&
			!methods.includes("embedContent")
		) {
			continue;
		}
		const id =
			typeof item.id === "string"
				? item.id
				: typeof item.name === "string"
					? item.name.replace(/^models\//, "")
					: null;
		if (!id) {
			continue;
		}
		const name = firstString(item, ["display_name", "displayName", "name"]);
		const pricing = asFields(item.pricing);
		const topProvider = asFields(item.top_provider);
		models.push({
			externalId: id,
			displayName: name && name !== id && name !== `models/${id}` ? name : null,
			contextSize:
				firstCount(item, [
					"context_length",
					"context_window",
					"max_context_length",
					"inputTokenLimit",
					"max_input_tokens",
				]) ?? firstCount(topProvider, ["context_length"]),
			maxOutput:
				firstCount(topProvider, ["max_completion_tokens"]) ??
				firstCount(item, [
					"max_completion_tokens",
					"max_output_tokens",
					"outputTokenLimit",
					"max_tokens",
				]),
			inputPrice: listedPrice(pricing?.prompt),
			outputPrice: listedPrice(pricing?.completion),
			cachedInputPrice: listedPrice(pricing?.input_cache_read),
		});
	}
	return models;
}

export type DiscoveryResult =
	{ models: DiscoveredModel[]; error: null } | { models: null; error: string };

/**
 * Reads the upstream's model listing with the template's own auth. Null when
 * the API style has no listing endpoint reachable with the credential.
 */
export async function discoverTemplateModels(
	template: ProviderTemplate,
	baseUrl: string,
	token: string,
	options: Record<string, string>,
): Promise<DiscoveryResult | null> {
	const request = modelsRequest(template, baseUrl, token, options);
	if (!request) {
		return null;
	}
	await assertSafeProviderUrl(request.url);
	const response = await fetch(request.url, {
		headers: request.headers,
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
	return { models: readDiscoveredModels(await response.json()), error: null };
}

export interface TemplateProbeResult {
	models: string[] | null;
	error: string | null;
}

/** Upstream model ids, or null when the API style has no listing. */
export async function listTemplateModels(
	template: ProviderTemplate,
	baseUrl: string,
	token: string,
	options: Record<string, string>,
): Promise<TemplateProbeResult | null> {
	const result = await discoverTemplateModels(
		template,
		baseUrl,
		token,
		options,
	);
	return result?.models
		? { models: result.models.map((model) => model.externalId), error: null }
		: result;
}

/**
 * Sends one minimal completion for `externalId` through the custom provider's
 * API style, built the way the gateway builds it.
 */
export async function probeCarrierModel(
	template: ProviderTemplate,
	baseUrl: string,
	token: string,
	options: Record<string, string>,
	externalId: string,
	signal: AbortSignal = AbortSignal.timeout(PROBE_TIMEOUT_MS),
): Promise<ProviderValidationResult> {
	if (!template.transportProvider) {
		return await validateProviderKey(
			"custom",
			token,
			baseUrl,
			false,
			{ env_config: options },
			externalId,
			signal,
		);
	}
	// validateProviderKey exchanges vertex-anthropic service accounts itself.
	const requestToken =
		template.id === "google-vertex" &&
		providerTemplateUsesServiceAccount(template, options)
			? await getGcpServiceAccountAccessToken(token, signal)
			: token;
	const result = await validateProviderKey(
		template.transportProvider,
		requestToken,
		baseUrl,
		false,
		{ env_config: options },
		externalId,
		signal,
		true,
	);
	return result.error
		? { ...result, error: redactToken(result.error, token) }
		: result;
}
