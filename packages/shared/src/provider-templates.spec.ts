import { describe, expect, it } from "vitest";

import { providers } from "@llmgateway/models";

import {
	deriveProviderTemplateBaseUrl,
	getProviderTemplate,
	normalizeProviderTemplateOptions,
	PROVIDER_TEMPLATE_IDS,
	PROVIDER_TEMPLATES,
	providerTemplateUsesServiceAccount,
} from "./provider-templates.js";

describe("provider templates", () => {
	it("registers each id once, OpenAI-compatible first", () => {
		expect(PROVIDER_TEMPLATES.map((template) => template.id)).toEqual([
			...PROVIDER_TEMPLATE_IDS,
		]);
		expect(PROVIDER_TEMPLATES[0].transportProvider).toBeNull();
	});

	it("only names built-in providers as transports", () => {
		for (const template of PROVIDER_TEMPLATES) {
			if (template.transportProvider) {
				expect(
					providers.some((p) => p.id === template.transportProvider),
					template.id,
				).toBe(true);
			}
		}
	});

	it("can always resolve a base URL from defaults or settings", () => {
		for (const template of PROVIDER_TEMPLATES) {
			const { options } = normalizeProviderTemplateOptions(template, {});
			const derived = deriveProviderTemplateBaseUrl(template, options);
			if (template.baseUrlFromOptions || template.defaultBaseUrl) {
				expect(
					derived ??
						deriveProviderTemplateBaseUrl(template, {
							...options,
							resource: "acme",
						}),
					template.id,
				).toMatch(/^https:\/\//);
			}
		}
	});

	it("keeps default and enumerated values valid", () => {
		for (const template of PROVIDER_TEMPLATES) {
			for (const field of template.optionFields) {
				const values = [
					...(field.defaultValue ? [field.defaultValue] : []),
					...(field.options?.map((option) => option.value) ?? []),
				];
				for (const value of values) {
					if (field.pattern) {
						expect(new RegExp(field.pattern).test(value), field.key).toBe(true);
					}
				}
			}
		}
	});

	it("falls back to OpenAI-compatible for legacy and unknown ids", () => {
		expect(getProviderTemplate(null).id).toBe("openai-compatible");
		expect(getProviderTemplate("nope").id).toBe("openai-compatible");
	});

	it("normalizes settings with defaults and rejects bad input", () => {
		const vertex = getProviderTemplate("google-vertex");
		expect(normalizeProviderTemplateOptions(vertex, {})).toEqual({
			options: { tokenType: "api-key", region: "global" },
			errors: [],
		});
		expect(
			normalizeProviderTemplateOptions(vertex, { tokenType: "oauth" }).errors,
		).toHaveLength(1);
		expect(
			normalizeProviderTemplateOptions(vertex, { region: "us-central1/../x" })
				.errors,
		).toHaveLength(1);
		expect(
			normalizeProviderTemplateOptions(vertex, { unknown: "x" }).errors,
		).toHaveLength(1);
		expect(
			normalizeProviderTemplateOptions(getProviderTemplate("azure"), {
				resource: "  acme  ",
			}).options,
		).toEqual({ resource: "acme", deploymentType: "openai" });
	});

	it("derives regional hosts", () => {
		const vertex = getProviderTemplate("google-vertex");
		expect(deriveProviderTemplateBaseUrl(vertex, { region: "global" })).toBe(
			"https://aiplatform.googleapis.com",
		);
		expect(
			deriveProviderTemplateBaseUrl(vertex, { region: "europe-west4" }),
		).toBe("https://europe-west4-aiplatform.googleapis.com");
		expect(
			deriveProviderTemplateBaseUrl(getProviderTemplate("aws-bedrock"), {
				awsRegion: "eu-central-1",
			}),
		).toBe("https://bedrock-runtime.eu-central-1.amazonaws.com");
		expect(
			deriveProviderTemplateBaseUrl(getProviderTemplate("azure"), {}),
		).toBeNull();
	});

	it("flags service-account credentials", () => {
		expect(
			providerTemplateUsesServiceAccount(
				getProviderTemplate("vertex-anthropic"),
				{},
			),
		).toBe(true);
		expect(
			providerTemplateUsesServiceAccount(getProviderTemplate("google-vertex"), {
				tokenType: "oauth",
			}),
		).toBe(true);
		expect(
			providerTemplateUsesServiceAccount(getProviderTemplate("google-vertex"), {
				tokenType: "api-key",
			}),
		).toBe(false);
	});
});
