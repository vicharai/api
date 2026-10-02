export interface AppConfig {
	hosted: boolean;
	apiUrl: string;
	apiBackendUrl: string;
	uiUrl: string;
	airsideUrl: string;
	playgroundUrl: string;
	docsUrl: string;
	githubUrl: string;
	discordUrl: string;
	twitterUrl: string;
	posthogKey?: string;
	posthogHost?: string;
	googleTagId?: string;
	googleAdsSignupConversion?: string;
	googleAdsPurchaseConversion?: string;
	stripePublishableKey?: string;
	githubAuth: boolean;
	googleAuth: boolean;
}

export function getConfig(): AppConfig {
	const apiUrl = process.env.API_URL ?? "http://localhost:4002";
	return {
		hosted: process.env.HOSTED === "true",
		apiUrl,
		airsideUrl:
			process.env.AIRSIDE_URL ??
			(process.env.NODE_ENV === "development"
				? "http://localhost:3007"
				: "https://app.vichar.io"),
		apiBackendUrl: process.env.API_BACKEND_URL ?? apiUrl,
		uiUrl:
			process.env.UI_URL ??
			(process.env.NODE_ENV === "development"
				? "http://localhost:3002"
				: "https://app.vichar.io"),
		playgroundUrl:
			process.env.PLAYGROUND_URL ??
			(process.env.NODE_ENV === "development"
				? "http://localhost:3003"
				: "https://app.vichar.io"),
		docsUrl: process.env.DOCS_URL ?? "http://localhost:3005",
		githubUrl: process.env.GITHUB_URL ?? "https://github.com/vicharai/api",
		discordUrl: process.env.DISCORD_URL ?? "https://app.vichar.io",
		twitterUrl: process.env.TWITTER_URL ?? "https://app.vichar.io",
		posthogKey: process.env.POSTHOG_KEY,
		posthogHost: process.env.POSTHOG_HOST,
		googleTagId: process.env.GOOGLE_TAG_ID,
		googleAdsSignupConversion: process.env.GOOGLE_ADS_SIGNUP_CONVERSION,
		googleAdsPurchaseConversion: process.env.GOOGLE_ADS_PURCHASE_CONVERSION,
		stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
		githubAuth: !!process.env.GITHUB_CLIENT_ID,
		googleAuth: !!process.env.GOOGLE_CLIENT_ID,
	};
}
