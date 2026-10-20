import createFetchClient, { type Middleware } from "openapi-fetch";
import createClient from "openapi-react-query";
import { useMemo } from "react";

import { useAppConfig } from "./config";

import type { paths } from "./api/v1";

export const ACCOUNT_BLOCKED_PATH = "/account-blocked";

// A deactivated user's session gets 403 `account_deactivated` on every call;
// send them to the explanation screen instead of letting each page fail.
const accountBlockedRedirect: Middleware = {
	async onResponse({ response }) {
		if (
			response.status !== 403 ||
			typeof window === "undefined" ||
			window.location.pathname === ACCOUNT_BLOCKED_PATH ||
			!response.headers.get("content-type")?.includes("application/json")
		) {
			return undefined;
		}
		const body: unknown = await response.clone().json();
		if (
			typeof body === "object" &&
			body !== null &&
			"error" in body &&
			body.error === "account_deactivated"
		) {
			window.location.replace(ACCOUNT_BLOCKED_PATH);
		}
		return undefined;
	},
};

// React hook to get the fetch client
export function useFetchClient() {
	const config = useAppConfig();

	return useMemo(() => {
		const client = createFetchClient<paths>({
			baseUrl: config.apiUrl,
			credentials: "include",
		});
		client.use(accountBlockedRedirect);
		return client;
	}, [config.apiUrl]);
}

// React hook to get the API client
export function useApi() {
	const fetchClient = useFetchClient();

	return useMemo(() => {
		return createClient(fetchClient);
	}, [fetchClient]);
}
