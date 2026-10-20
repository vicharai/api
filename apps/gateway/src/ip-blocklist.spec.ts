import { describe, expect, test } from "vitest";

import { app } from "@/app.js";
import { createGatewayApiTestHarness } from "@/test-utils/gateway-api-test-harness.js";

import { mergeStoredPlatformConfig } from "@llmgateway/db";

async function post(path: string, ip: string) {
	return await app.request(path, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
		body: JSON.stringify({
			model: "gpt-4o-mini",
			messages: [{ role: "user", content: "hi" }],
		}),
	});
}

describe("gateway IP blocklist", () => {
	createGatewayApiTestHarness();

	test("rejects listed IPs and CIDR ranges before authentication", async () => {
		await mergeStoredPlatformConfig({
			"abuse.blockedIps": ["203.0.113.0/24", "2001:db8::/32"],
		});

		const chat = await post("/v1/chat/completions", "203.0.113.9, 10.0.0.1");
		expect(chat.status).toBe(403);
		expect(await chat.json()).toMatchObject({
			error: { type: "access_blocked", code: "access_blocked" },
		});

		const messages = await post("/v1/messages", "::ffff:203.0.113.10");
		expect(messages.status).toBe(403);
		expect(await messages.json()).toMatchObject({
			type: "error",
			error: { type: "permission_error" },
		});

		expect((await post("/v1/embeddings", "2001:db8:1::5")).status).toBe(403);
		expect(
			(
				await app.request("/v1/models", {
					headers: { "X-Forwarded-For": "203.0.113.9" },
				})
			).status,
		).toBe(403);

		// Unlisted clients reach authentication as usual.
		expect((await post("/v1/chat/completions", "198.51.100.4")).status).toBe(
			401,
		);
	});

	test("lets everything through with an empty list", async () => {
		expect((await post("/v1/chat/completions", "203.0.113.9")).status).toBe(
			401,
		);
	});
});
