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

export type SessionLookup =
	| { status: "ok"; user: CurrentUser | null }
	| { status: "unreachable"; message: string };

/**
 * The signed-in user, or `unreachable` when the API cannot answer (network
 * failure or 5xx). A missing or invalid session is `ok` with `user: null`.
 */
export const getSession = cache(async (): Promise<SessionLookup> => {
	const client = await createServerApiClient();
	try {
		const { data, response } = await client.GET("/user/me");
		if (response.status >= 500) {
			const message = `API returned ${response.status} for /user/me`;
			console.warn(`[admin] ${message}`);
			return { status: "unreachable", message };
		}
		return { status: "ok", user: data?.user ?? null };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[admin] API unreachable for /user/me: ${message}`);
		return { status: "unreachable", message };
	}
});

/** The signed-in user; null without a session or when the API is unreachable. */
export async function getUserMe(): Promise<CurrentUser | null> {
	const session = await getSession();
	return session.status === "ok" ? session.user : null;
}
