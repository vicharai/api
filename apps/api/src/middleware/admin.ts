import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import { db, tables, type AdminRole } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

import type { ServerTypes } from "@/vars.js";

export function getAdminEmails(): string[] {
	return (process.env.ADMIN_EMAILS ?? "")
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
	if (!email) {
		return false;
	}
	return getAdminEmails().includes(email.toLowerCase());
}

/**
 * ADMIN_EMAILS owners are always "admin"; everyone else needs an
 * admin_member row. Admin authority keys on the email address, so an
 * unverified one never counts.
 */
export async function resolveAdminRole(user: {
	id: string;
	email: string | null | undefined;
	emailVerified: boolean;
}): Promise<AdminRole | null> {
	if (!user.emailVerified) {
		return null;
	}
	if (isAdminEmail(user.email)) {
		return "admin";
	}
	const member = await db.query.adminMember.findFirst({
		where: { userId: { eq: user.id } },
		columns: { role: true },
	});
	return member?.role ?? null;
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Revenue and staff management stay with full admins.
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
];

export function adminRoleAllows(
	role: AdminRole,
	method: string,
	path: string,
): boolean {
	if (role === "admin") {
		return true;
	}
	if (ADMIN_ONLY_PATHS.some((pattern) => pattern.test(path))) {
		return false;
	}
	if (READ_METHODS.has(method)) {
		return true;
	}
	if (role === "viewer") {
		return false;
	}
	return SUPPORT_MUTATIONS.some(
		(rule) => rule.method === method && rule.path.test(path),
	);
}

/**
 * Every admin router installs this. Routers share the /admin prefix, so it
 * runs once per mounted router; the role is resolved on the first pass only.
 */
export const adminMiddleware = createMiddleware<ServerTypes>(
	async (c, next) => {
		let role = c.get("adminRole");

		if (!role) {
			const authUser = c.get("user");
			if (!authUser) {
				throw new HTTPException(401, { message: "Unauthorized" });
			}
			const resolved = await resolveAdminRole(authUser);
			if (!resolved) {
				throw new HTTPException(403, { message: "Admin access required" });
			}
			role = resolved;
			c.set("adminRole", role);
		}

		if (!adminRoleAllows(role, c.req.method, c.req.path)) {
			throw new HTTPException(403, {
				message: `The ${role} admin role cannot perform this action`,
			});
		}

		return await next();
	},
);

const REDACTED_KEY =
	/(key|token|secret|password|credential|authorization|webhook|cookie)/i;
const MAX_STRING_LENGTH = 500;

export function redactAdminRequestBody(value: unknown, depth = 0): unknown {
	if (depth > 5) {
		return "[truncated]";
	}
	if (typeof value === "string") {
		return value.length > MAX_STRING_LENGTH
			? `${value.slice(0, MAX_STRING_LENGTH)}…`
			: value;
	}
	if (Array.isArray(value)) {
		return value.slice(0, 50).map((v) => redactAdminRequestBody(v, depth + 1));
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [
				k,
				REDACTED_KEY.test(k)
					? "[redacted]"
					: redactAdminRequestBody(v, depth + 1),
			]),
		);
	}
	return value;
}

function matchParam(path: string, pattern: RegExp): string | null {
	return pattern.exec(path)?.[1] ?? null;
}

/**
 * Records every mutating /admin request (including rejected ones) in
 * admin_action_log. Mounted once on the /admin prefix, ahead of the routers.
 */
export const adminActionLogMiddleware = createMiddleware<ServerTypes>(
	async (c, next) => {
		if (READ_METHODS.has(c.req.method)) {
			return await next();
		}

		let body: unknown = null;
		if (c.req.header("content-type")?.includes("application/json")) {
			try {
				body = await c.req.json();
			} catch {
				body = "[unparseable json]";
			}
		}

		let statusCode = 500;
		try {
			await next();
			statusCode = c.res.status;
		} finally {
			const authUser = c.get("user");
			const role = c.get("adminRole");
			if (authUser && role) {
				const path = c.req.path;
				try {
					await db.insert(tables.adminActionLog).values({
						adminUserId: authUser.id,
						adminEmail: authUser.email,
						adminRole: role,
						method: c.req.method,
						path,
						targetOrganizationId: matchParam(
							path,
							/^\/admin\/organizations\/(?!bulk-block)([^/]+)/,
						),
						targetUserId: matchParam(
							path,
							/^\/admin\/(?:users|flagged-accounts|team)\/([^/]+)/,
						),
						statusCode,
						requestSummary:
							body === null ? null : { body: redactAdminRequestBody(body) },
					});
				} catch (error) {
					logger.error("Failed to write admin action log", {
						error,
						path,
						method: c.req.method,
					});
				}
			}
		}
	},
);
