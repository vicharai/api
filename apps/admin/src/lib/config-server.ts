export interface AppConfig {
	apiUrl: string;
	apiBackendUrl: string;
	uiUrl: string;
	gatewayUrl: string;
}

export function getConfig(): AppConfig {
	const apiUrl = process.env.API_URL ?? "http://localhost:4002";
	return {
		apiUrl,
		apiBackendUrl: process.env.API_BACKEND_URL ?? apiUrl,
		uiUrl: process.env.UI_URL ?? "http://localhost:3002",
		gatewayUrl: process.env.GATEWAY_URL ?? "http://localhost:4001",
	};
}
