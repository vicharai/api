export interface AppConfig {
	hosted: boolean;
	appUrl: string;
	apiUrl: string;
	apiBackendUrl: string;
	gatewayUrl: string;
	githubUrl: string;
	discordUrl: string;
	twitterUrl: string;
	docsUrl: string;
	adminUrl: string;
	posthogKey?: string;
	posthogHost?: string;
	githubAuth: boolean;
	googleAuth: boolean;
	ssoEnabled: boolean;
}

export function getConfig(): AppConfig {
	const apiUrl = process.env.API_URL ?? "http://localhost:4002";
	return {
		hosted: process.env.HOSTED === "true",
		appUrl: process.env.APP_URL ?? "http://localhost:3002",
		apiUrl,
		apiBackendUrl: process.env.API_BACKEND_URL ?? apiUrl,
		gatewayUrl: process.env.GATEWAY_URL ?? "http://localhost:4001",
		githubUrl: process.env.GITHUB_URL ?? "https://github.com/vicharai/api",
		discordUrl: process.env.DISCORD_URL ?? "https://app.vichar.io/discord",
		twitterUrl: process.env.TWITTER_URL ?? "https://x.com/llmgateway",
		docsUrl: process.env.DOCS_URL ?? "http://localhost:3005",
		adminUrl: process.env.ADMIN_URL ?? "http://localhost:3006",
		posthogKey: process.env.POSTHOG_KEY,
		posthogHost: process.env.POSTHOG_HOST,
		githubAuth: !!process.env.GITHUB_CLIENT_ID,
		googleAuth: !!process.env.GOOGLE_CLIENT_ID,
		ssoEnabled: process.env.SSO_ENABLED === "true",
	};
}
