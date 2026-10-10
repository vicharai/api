import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
	const { pathname, searchParams } = request.nextUrl;

	// Better Auth appends `?error=<code>` (and sometimes `?error_description=`)
	// to the post-OAuth callback URL when a social sign-in fails (e.g.
	// `account_not_linked`). If that lands on `/dashboard`, the dashboard layout
	// redirects unauthenticated users straight to `/login` and drops the query,
	// so the error is never shown. Catch it here first and forward the code to
	// the login page, which renders it as a toast.
	if (pathname.startsWith("/dashboard")) {
		const error = searchParams.get("error");
		if (!error) {
			return NextResponse.next();
		}
		const url = request.nextUrl.clone();
		url.pathname = "/login";
		const preserved = new URLSearchParams();
		preserved.set("error", error);
		const description = searchParams.get("error_description");
		if (description) {
			preserved.set("error_description", description);
		}
		url.search = preserved.toString();
		return NextResponse.redirect(url);
	}

	// MCP protocol traffic on /mcp is forwarded to the gateway's MCP server so
	// agents can connect via the primary domain; browsers still get the
	// marketing page.
	if (pathname === "/mcp") {
		const accept = request.headers.get("accept") ?? "";
		const isProtocolRequest =
			(request.method !== "GET" && request.method !== "HEAD") ||
			!accept.includes("text/html");
		if (isProtocolRequest) {
			const gatewayUrl = process.env.GATEWAY_URL;
			if (!gatewayUrl && process.env.NODE_ENV === "production") {
				throw new Error(
					"GATEWAY_URL is required for MCP forwarding in production",
				);
			}
			return NextResponse.rewrite(
				new URL("/mcp", gatewayUrl || "http://localhost:4001"),
			);
		}
	}

	return NextResponse.next();
}

export const config = {
	// All pages except Next internals, API proxies, and static files (dots).
	matcher: ["/((?!_next/|api/|ingest/|.*\\..*).*)"],
};
