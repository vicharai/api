/**
 * Client-side mirror of the API's admin role policy
 * (apps/api/src/middleware/admin.ts). Only used to hide or disable controls;
 * the API is the enforcement point.
 */
export type AdminRole = "admin" | "support" | "viewer";

const ADMIN_ONLY_PATHS = [
	/^\/admin\/metrics(\/|$)/,
	/^\/admin\/global-stats(\/|$)/,
	/^\/admin\/team(\/|$)/,
];

const SUPPORT_MUTATIONS: { method: string; path: RegExp }[] = [
	{
		method: "POST",
		path: /^\/admin\/organizations\/[^/]+\/transactions\/[^/]+\/refund$/,
	},
	{ method: "POST", path: /^\/admin\/chat-support-logs\/[^/]+\/(reply|read)$/ },
	{ method: "PATCH", path: /^\/admin\/chat-support-logs\/[^/]+\/archive$/ },
	{ method: "POST", path: /^\/admin\/contact-submissions\/[^/]+\/reply$/ },
	{ method: "PATCH", path: /^\/admin\/contact-submissions\/[^/]+\/archive$/ },
	{ method: "POST", path: /^\/admin\/send-email$/ },
	{ method: "POST", path: /^\/admin\/users\/[^/]+\/verify-email$/ },
	{ method: "POST", path: /^\/admin\/flagged-accounts\/[^/]+\/approve$/ },
	{ method: "PATCH", path: /^\/admin\/flagged-accounts\/[^/]+\/archive$/ },
	{ method: "POST", path: /^\/admin\/crm\/accounts\/[^/]+\/activities$/ },
	{ method: "PATCH", path: /^\/admin\/crm\/activities\/[^/]+$/ },
	{ method: "DELETE", path: /^\/admin\/crm\/activities\/[^/]+$/ },
	// Phase 2: notes, tags, password resets.
	{ method: "POST", path: /^\/admin\/notes$/ },
	{ method: "PATCH", path: /^\/admin\/notes\/[^/]+$/ },
	{ method: "DELETE", path: /^\/admin\/notes\/[^/]+$/ },
	{ method: "PUT", path: /^\/admin\/tags$/ },
	{ method: "POST", path: /^\/admin\/users\/[^/]+\/password-reset$/ },
];

export function roleAllows(
	role: AdminRole | null | undefined,
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
	path: string,
): boolean {
	if (!role) {
		return false;
	}
	if (role === "admin") {
		return true;
	}
	if (ADMIN_ONLY_PATHS.some((pattern) => pattern.test(path))) {
		return false;
	}
	if (method === "GET") {
		return true;
	}
	if (role === "viewer") {
		return false;
	}
	return SUPPORT_MUTATIONS.some(
		(rule) => rule.method === method && rule.path.test(path),
	);
}

export const ROLE_LABELS: Record<AdminRole, string> = {
	admin: "Admin",
	support: "Support",
	viewer: "Viewer",
};
