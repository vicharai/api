/** All external URLs and contact points in one place. */
export const site = {
	name: "Vichar",
	domain: "https://vichar.io",
	description:
		"Route, manage, and analyze LLM requests across multiple providers through one unified, OpenAI-compatible API.",
	tagline: "vichar · a thought, routed.",
	urls: {
		app: "https://app.vichar.io",
		signup: "https://app.vichar.io/signup",
		login: "https://app.vichar.io/login",
		docs: "https://docs.vichar.io",
		api: "https://api.vichar.io",
		apiModels: "https://api.vichar.io/v1/models",
		apiBase: "https://api.vichar.io/v1",
		terms: "https://app.vichar.io/legal/terms",
		privacy: "https://app.vichar.io/legal/privacy",
	},
	emails: {
		support: "support@vichar.io",
		sales: "hello@vichar.io",
	},
	social: [] as Array<{ name: string; url: string }>,
} as const;
