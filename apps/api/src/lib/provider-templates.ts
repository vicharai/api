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

function readModelIds(json: unknown): string[] {
	if (!json || typeof json !== "object") {
		return [];
	}
	const record = json as { data?: unknown; models?: unknown };
	const entries = Array.isArray(record.data)
		? record.data
		: Array.isArray(record.models)
			? record.models
			: [];
	return entries
		.map((entry: unknown) => {
			if (!entry || typeof entry !== "object") {
				return null;
			}
			const item = entry as { id?: unknown; name?: unknown };
			if (typeof item.id === "string") {
				return item.id;
			}
			return typeof item.name === "string"
				? item.name.replace(/^models\//, "")
				: null;
		})
		.filter((id): id is string => id !== null);
}

export interface TemplateProbeResult {
	models: string[] | null;
	error: string | null;
}

/**
 * Lists upstream model ids with the template's own auth. Null when the API
 * style has no listing endpoint reachable with the credential.
 */
export async function listTemplateModels(
	template: ProviderTemplate,
	baseUrl: string,
	token: string,
	options: Record<string, string>,
): Promise<TemplateProbeResult | null> {
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
	return { models: readModelIds(await response.json()), error: null };
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
