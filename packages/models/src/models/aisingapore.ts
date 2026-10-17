import type { ModelDefinition } from "@/models.js";

export const aisingaporeModels = [
	{
		id: "gemma-sea-lion-v4-27b-it",
		name: "Gemma SEA-LION v4 27B IT",
		description:
			"AI Singapore's SEA-LION v4 27B instruction model, a Gemma-based Southeast Asian multilingual model.",
		family: "aisingapore",
		releasedAt: new Date("2025-11-01"),
		providers: [
			{
				test: "skip",
				providerId: "cloudflare",
				externalId: "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
				inputPrice: "0.351e-6",
				outputPrice: "0.555e-6",
				requestPrice: "0",
				contextSize: 128000,
				maxOutput: undefined,
				streaming: true,
				jsonOutput: true,
			},
		],
	},
] as const satisfies ModelDefinition[];
