import { cookies } from "next/headers";
import createFetchClient from "openapi-fetch";
import { cache } from "react";

import { getConfig } from "./config-server";

import type { paths } from "./api/v1";

const SESSION_COOKIE = "better-auth.session_token";

async function createServerApiClient() {
	const config = getConfig();
	const cookieStore = await cookies();
	const secure = cookieStore.get(`__Secure-${SESSION_COOKIE}`);
	const plain = cookieStore.get(SESSION_COOKIE);

	return createFetchClient<paths>({
		baseUrl: config.apiBackendUrl,
		headers: {
			Cookie: secure
				? `__Secure-${SESSION_COOKIE}=${secure.value}`
				: plain
					? `${SESSION_COOKIE}=${plain.value}`
					: "",
		},
	});
}

export type CurrentUser = NonNullable<
	paths["/user/me"]["get"]["responses"]["200"]["content"]["application/json"]["user"]
>;

/** The signed-in user, or null when there is no valid session. */
export const getUserMe = cache(async (): Promise<CurrentUser | null> => {
	const client = await createServerApiClient();
	const { data } = await client.GET("/user/me");
	return data?.user ?? null;
});
