import { expect, test } from "@playwright/test";

// Agent-readiness surface: OpenAPI mirror, agent-friendly 404, and the MCP
// endpoint. Runs against a local stack (see playwright.config.ts) with the
// gateway on :4001 (GATEWAY_URL).

test.describe("openapi.json", () => {
	test("serves the gateway spec on the primary domain", async ({ request }) => {
		const res = await request.get("/openapi.json");
		expect(res.status()).toBe(200);
		expect(res.headers()["content-type"]).toContain("application/json");
		const spec = await res.json();
		expect(spec.openapi).toBeTruthy();
		expect(spec.paths["/v1/chat/completions"]).toBeTruthy();
		expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
			type: "http",
			scheme: "bearer",
		});
	});
});

test.describe("agent-friendly 404", () => {
	test("nonexistent paths return 404 with recovery links", async ({
		request,
	}) => {
		const res = await request.get("/some-path-that-does-not-exist");
		expect(res.status()).toBe(404);
		const body = await res.text();
		expect(body).toContain("/dashboard");
		expect(body).toContain("/legal");
	});
});

test.describe("mcp endpoint", () => {
	test("JSON-RPC POSTs to /mcp reach the gateway MCP server", async ({
		request,
	}) => {
		// Seeded test API key (packages/db/src/seed.ts) so the request passes
		// MCP auth and exercises a real initialize through the proxy.
		const res = await request.post("/mcp", {
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				authorization: "Bearer test-token",
			},
			data: {
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: { name: "probe", version: "1.0" },
				},
			},
		});
		expect(res.ok()).toBe(true);
		const body = await res.json();
		expect(body.jsonrpc).toBe("2.0");
		expect(body.error).toBeUndefined();
		expect(body.result.protocolVersion).toBeTruthy();
	});

	test("unauthenticated /mcp POSTs get a JSON-RPC auth error, not HTML", async ({
		request,
	}) => {
		const res = await request.post("/mcp", {
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
		});
		const body = await res.json();
		expect(body.jsonrpc).toBe("2.0");
		expect(body.error.code).toBeDefined();
	});
});
