import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";
import { useMemo } from "react";

import { useAppConfig } from "./config";

export function useAuthClient() {
	const config = useAppConfig();

	return useMemo(
		() =>
			createAuthClient({
				baseURL: config.apiUrl + "/auth",
				plugins: [passkeyClient()],
			}),
		[config.apiUrl],
	);
}
