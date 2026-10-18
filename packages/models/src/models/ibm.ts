import type { ModelDefinition } from "@/models.js";

export const ibmModels = [
	{
		id: "granite-4.2-8b",
		name: "Granite 4.2 8B",
		description:
			"IBM's dense 8B reasoning model for math, code generation, multilingual dialogue, and agentic workflows.",
		family: "ibm",
		releasedAt: new Date("2026-09-01"),
		providers: [
			{
				providerId: "deepinfra",
				externalId: "ibm-granite/granite-4.2-8b",
				inputPrice: "0.06e-6",
				cachedInputPrice: "0.015e-6",
				outputPrice: "0.25e-6",
				requestPrice: "0",
				contextSize: 131072,
				maxOutput: 117964,
				quantization: "bf16",
				maxTemperature: 1,
				streaming: true,
				reasoning: true,
				reasoningEfforts: ["none", "low", "medium", "high"],
				vision: false,
				tools: true,
				supportedToolChoices: ["auto", "none", "function"],
				jsonOutput: true,
			},
		],
	},
	{
		id: "granite-4.0-h-micro",
		name: "Granite 4.0 H Micro",
		description:
			"IBM's compact Granite 4.0 hybrid model for efficient general-purpose chat.",
		family: "ibm",
		releasedAt: new Date("2025-10-02"),
		providers: [
			{
				test: "skip",
				providerId: "cloudflare",
				externalId: "@cf/ibm-granite/granite-4.0-h-micro",
				inputPrice: "0.017e-6",
				outputPrice: "0.112e-6",
				requestPrice: "0",
				contextSize: 131000,
				maxOutput: undefined,
				streaming: true,
				tools: true,
				jsonOutput: true,
			},
		],
	},
] as const satisfies ModelDefinition[];
