import createFetchClient from "openapi-fetch";
import createClient from "openapi-react-query";
import { useMemo } from "react";

import { useAppConfig } from "./config";

import type { AdminPaths } from "./api/pending-paths";

export function useFetchClient() {
	const config = useAppConfig();

	return useMemo(
		() =>
			createFetchClient<AdminPaths>({
				baseUrl: config.apiUrl,
				credentials: "include",
			}),
		[config.apiUrl],
	);
}

export function useApi() {
	const fetchClient = useFetchClient();

	return useMemo(() => createClient(fetchClient), [fetchClient]);
}
