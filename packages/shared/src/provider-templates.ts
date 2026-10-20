import type { ProviderId } from "@llmgateway/models";

/**
 * API styles an admin-managed custom provider can speak. Each template reuses
 * a built-in provider's request/response code (its `transportProvider`) with
 * the custom provider's own base URL, credential and settings.
 */
export const PROVIDER_TEMPLATE_IDS = [
	"openai-compatible",
	"anthropic",
	"google-ai-studio",
	"google-vertex",
	"vertex-anthropic",
	"azure",
	"aws-bedrock",
] as const;

export type ProviderTemplateId = (typeof PROVIDER_TEMPLATE_IDS)[number];

/** Custom providers created before templates existed speak this. */
export const DEFAULT_PROVIDER_TEMPLATE_ID: ProviderTemplateId =
	"openai-compatible";

export type ProviderTemplateAuth =
	"bearer" | "x-api-key" | "api-key-header" | "query-key" | "service-account";

export interface ProviderTemplateOptionField {
	/** Credential setting key, read by the transport provider's endpoint code. */
	key: string;
	label: string;
	required: boolean;
	placeholder?: string;
	description?: string;
	defaultValue?: string;
	/** Allowed values; renders as a select. */
	options?: { value: string; label: string }[];
	/** Anchored pattern for free-text values interpolated into URLs. */
	pattern?: string;
}

export interface ProviderTemplate {
	id: ProviderTemplateId;
	label: string;
	description: string;
	/** Built-in provider whose wire format serves this template; null = generic OpenAI-compatible. */
	transportProvider: ProviderId | null;
	defaultBaseUrl: string | null;
	baseUrlHint: string;
	/** The base URL may be omitted and is then derived from the settings. */
	baseUrlFromOptions: boolean;
	auth: ProviderTemplateAuth;
	apiKeyLabel: string;
	apiKeyPlaceholder: string;
	optionFields: ProviderTemplateOptionField[];
	modelIdHint: string;
	embeddings: boolean;
	/** The upstream lists its models, so admins can discover and import them. */
	modelListing: boolean;
}

const GCP_REGION_PATTERN = "^(global|[a-z]+-[a-z]+[0-9]+)$";

export const PROVIDER_TEMPLATES: readonly ProviderTemplate[] = [
	{
		id: "openai-compatible",
		label: "OpenAI-compatible",
		description:
			"Any Chat Completions API: vLLM, Ollama, LiteLLM, Together, Mistral, OpenAI itself and most hosted inference APIs.",
		transportProvider: null,
		defaultBaseUrl: null,
		baseUrlHint:
			"Without /v1; the gateway appends /v1/chat/completions (and /v1/embeddings).",
		baseUrlFromOptions: false,
		auth: "bearer",
		apiKeyLabel: "API key",
		apiKeyPlaceholder: "sk-…",
		optionFields: [],
		modelIdHint: "Model id as the upstream's /v1/models lists it",
		embeddings: true,
		modelListing: true,
	},
	{
		id: "anthropic",
		label: "Anthropic Messages",
		description:
			"Anthropic's /v1/messages API with x-api-key auth: Anthropic, Claude on Microsoft Foundry and Messages-compatible proxies.",
		transportProvider: "anthropic",
		defaultBaseUrl: "https://api.anthropic.com",
		baseUrlHint:
			"Without /v1; the gateway appends /v1/messages. For Foundry use https://<resource>.services.ai.azure.com/anthropic.",
		baseUrlFromOptions: false,
		auth: "x-api-key",
		apiKeyLabel: "API key (x-api-key)",
		apiKeyPlaceholder: "sk-ant-…",
		optionFields: [],
		modelIdHint: "Anthropic model id, e.g. claude-sonnet-4-5",
		embeddings: false,
		modelListing: true,
	},
	{
		id: "google-ai-studio",
		label: "Google Gemini API",
		description:
			"The Gemini Developer API (generateContent) with ?key= auth, or a proxy that speaks it.",
		transportProvider: "google-ai-studio",
		defaultBaseUrl: "https://generativelanguage.googleapis.com",
		baseUrlHint:
			"Without /v1beta; the gateway appends /v1beta/models/<model>:generateContent.",
		baseUrlFromOptions: false,
		auth: "query-key",
		apiKeyLabel: "Gemini API key",
		apiKeyPlaceholder: "AIza…",
		optionFields: [],
		modelIdHint: "Gemini model id, e.g. gemini-2.5-flash",
		embeddings: true,
		modelListing: true,
	},
	{
		id: "google-vertex",
		label: "Google Vertex AI (Gemini)",
		description:
			"Gemini on Vertex AI in your own GCP project, with an API key or a service account.",
		transportProvider: "google-vertex",
		defaultBaseUrl: null,
		baseUrlHint:
			"Leave empty to use the region's aiplatform.googleapis.com host.",
		baseUrlFromOptions: true,
		auth: "query-key",
		apiKeyLabel: "API key or service account JSON",
		apiKeyPlaceholder: 'AIza… or {"type": "service_account", …}',
		optionFields: [
			{
				key: "tokenType",
				label: "Credential type",
				required: true,
				defaultValue: "api-key",
				options: [
					{ value: "api-key", label: "API key" },
					{ value: "oauth", label: "Service account JSON" },
				],
			},
			{
				key: "project",
				label: "GCP project id",
				required: false,
				placeholder: "my-project",
				description: "Required for service accounts.",
				pattern: "^[a-z][a-z0-9-]{4,61}[a-z0-9]$",
			},
			{
				key: "region",
				label: "Region",
				required: true,
				defaultValue: "global",
				placeholder: "global or us-central1",
				pattern: GCP_REGION_PATTERN,
			},
		],
		modelIdHint: "Vertex publisher model id, e.g. gemini-2.5-pro",
		embeddings: true,
		modelListing: false,
	},
	{
		id: "vertex-anthropic",
		label: "Claude on Vertex AI",
		description:
			"Anthropic models served by Vertex AI rawPredict, authenticated with a service account.",
		transportProvider: "vertex-anthropic",
		defaultBaseUrl: null,
		baseUrlHint:
			"Leave empty to use the region's aiplatform.googleapis.com host.",
		baseUrlFromOptions: true,
		auth: "service-account",
		apiKeyLabel: "Service account JSON",
		apiKeyPlaceholder: '{"type": "service_account", …}',
		optionFields: [
			{
				key: "project",
				label: "GCP project id",
				required: true,
				placeholder: "my-project",
				pattern: "^[a-z][a-z0-9-]{4,61}[a-z0-9]$",
			},
			{
				key: "region",
				label: "Region",
				required: true,
				defaultValue: "global",
				placeholder: "global or us-east5",
				pattern: GCP_REGION_PATTERN,
			},
		],
		modelIdHint: "Vertex model id, e.g. claude-sonnet-4-5@20250929",
		embeddings: false,
		modelListing: false,
	},
	{
		id: "azure",
		label: "Azure OpenAI",
		description:
			"Azure OpenAI / Foundry deployments with the api-key header, deployment-based or v1 API.",
		transportProvider: "azure",
		defaultBaseUrl: null,
		baseUrlHint:
			"Leave empty to use https://<resource>.openai.azure.com, or point at a proxy serving the Azure surface.",
		baseUrlFromOptions: true,
		auth: "api-key-header",
		apiKeyLabel: "API key (api-key header)",
		apiKeyPlaceholder: "Azure resource key",
		optionFields: [
			{
				key: "resource",
				label: "Resource name",
				required: false,
				placeholder: "my-resource",
				description: "Builds the base URL when none is given.",
				pattern: "^[a-zA-Z0-9-]{1,64}$",
			},
			{
				key: "deploymentType",
				label: "API surface",
				required: true,
				defaultValue: "openai",
				options: [
					{
						value: "openai",
						label: "Deployments (/openai/deployments/…)",
					},
					{ value: "ai-foundry", label: "v1 API (/openai/v1/…)" },
				],
			},
			{
				key: "apiVersion",
				label: "API version",
				required: false,
				placeholder: "2024-10-21",
				description: "Deployments surface only.",
				pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}(-preview)?$",
			},
		],
		modelIdHint: "Deployment name (deployments) or model name (v1 API)",
		embeddings: false,
		modelListing: true,
	},
	{
		id: "aws-bedrock",
		label: "AWS Bedrock",
		description:
			"Bedrock Converse API authenticated with a Bedrock API key (Bearer).",
		transportProvider: "aws-bedrock",
		defaultBaseUrl: null,
		baseUrlHint:
			"Leave empty to use https://bedrock-runtime.<AWS region>.amazonaws.com.",
		baseUrlFromOptions: true,
		auth: "bearer",
		apiKeyLabel: "Bedrock API key",
		apiKeyPlaceholder: "ABSK…",
		optionFields: [
			{
				key: "awsRegion",
				label: "AWS region",
				required: true,
				defaultValue: "us-east-1",
				placeholder: "us-east-1",
				pattern: "^[a-z]{2}(-[a-z]+)+-[0-9]$",
			},
			{
				key: "region",
				label: "Inference profile prefix",
				required: true,
				defaultValue: "global.",
				options: [
					{ value: "global.", label: "global." },
					{ value: "us.", label: "us." },
					{ value: "eu.", label: "eu." },
					{ value: "apac.", label: "apac." },
					{ value: "jp.", label: "jp." },
					{ value: "au.", label: "au." },
				],
			},
		],
		modelIdHint:
			"Bedrock model id without the profile prefix, e.g. anthropic.claude-sonnet-4-5-20250929-v1:0",
		embeddings: false,
		modelListing: false,
	},
];

export function findProviderTemplate(
	id: string | null | undefined,
): ProviderTemplate | undefined {
	return PROVIDER_TEMPLATES.find(
		(template) => template.id === (id ?? DEFAULT_PROVIDER_TEMPLATE_ID),
	);
}

/** Template of a stored custom provider; unknown or null ids speak OpenAI-compatible. */
export function getProviderTemplate(
	id: string | null | undefined,
): ProviderTemplate {
	return findProviderTemplate(id) ?? PROVIDER_TEMPLATES[0];
}

/**
 * Trims the submitted settings, applies defaults and validates them against
 * the template. Unknown keys are errors so a typo cannot pass as configured.
 */
export function normalizeProviderTemplateOptions(
	template: ProviderTemplate,
	raw: Record<string, string> | null | undefined,
): { options: Record<string, string>; errors: string[] } {
	const options: Record<string, string> = {};
	const errors: string[] = [];
	const known = new Set(template.optionFields.map((field) => field.key));
	for (const key of Object.keys(raw ?? {})) {
		if (!known.has(key)) {
			errors.push(`Unknown setting "${key}" for ${template.label}`);
		}
	}
	for (const field of template.optionFields) {
		const value = raw?.[field.key]?.trim() || field.defaultValue;
		if (!value) {
			if (field.required) {
				errors.push(`${field.label} is required`);
			}
			continue;
		}
		if (
			field.options &&
			!field.options.some((option) => option.value === value)
		) {
			errors.push(
				`${field.label} must be one of ${field.options.map((option) => option.value).join(", ")}`,
			);
			continue;
		}
		if (field.pattern && !new RegExp(field.pattern).test(value)) {
			errors.push(`${field.label} "${value}" is not valid`);
			continue;
		}
		options[field.key] = value;
	}
	if (
		template.id === "google-vertex" &&
		options.tokenType === "oauth" &&
		!options.project
	) {
		errors.push("GCP project id is required for service accounts");
	}
	return { options, errors };
}

/** Base URL implied by the settings when the admin leaves it empty. */
export function deriveProviderTemplateBaseUrl(
	template: ProviderTemplate,
	options: Record<string, string>,
): string | null {
	switch (template.id) {
		case "google-vertex":
		case "vertex-anthropic": {
			const region = options.region ?? "global";
			return region === "global"
				? "https://aiplatform.googleapis.com"
				: `https://${region}-aiplatform.googleapis.com`;
		}
		case "azure":
			return options.resource
				? `https://${options.resource}.openai.azure.com`
				: null;
		case "aws-bedrock":
			return options.awsRegion
				? `https://bedrock-runtime.${options.awsRegion}.amazonaws.com`
				: null;
		default:
			return template.defaultBaseUrl;
	}
}

/**
 * Whether the credential is a GCP service-account JSON the gateway exchanges
 * for an access token before calling the upstream.
 */
export function providerTemplateUsesServiceAccount(
	template: ProviderTemplate,
	options: Record<string, string> | null | undefined,
): boolean {
	return (
		template.id === "vertex-anthropic" ||
		(template.id === "google-vertex" && options?.tokenType === "oauth")
	);
}
