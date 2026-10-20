import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, test } from "vitest";

import { encryptProviderKeyForStorage } from "@llmgateway/actions";
import { db, eq, invalidateOrganizationsCache, tables } from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

import { app } from "./app.js";
import { createGatewayApiTestHarness } from "./test-utils/gateway-api-test-harness.js";

describe("organization suspension", () => {
	const harness = createGatewayApiTestHarness();

	beforeEach(async () => {
		await db.insert(tables.apiKey).values({
			id: "token-id",
			...hashApiKeyForStorage("test-token"),
			projectId: "project-id",
			createdBy: "user-id",
			description: "Test API Key",
		});
		await db.insert(tables.providerKey).values({
			id: "provider-key-openai",
			...encryptProviderKeyForStorage(
				"test-token",
				"provider-key-openai",
				"org-id",
			),
			provider: "openai",
			organizationId: "org-id",
			baseUrl: harness.mockServerUrl,
		});
	});

	// Mirrors the admin endpoints: plain write, then evict the cached org row.
	async function setSuspension(until: Date | null, reason: string | null) {
		await db
			.update(tables.organization)
			.set({ suspendedUntil: until, suspendReason: reason })
			.where(eq(tables.organization.id, "org-id"));
		await invalidateOrganizationsCache(["org-id"]);
	}

	const chat = () =>
		app.request("/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer test-token",
				"x-request-id": randomUUID(),
			},
			body: JSON.stringify({
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: `hi ${randomUUID()}` }],
			}),
		});

	test("rejects a suspended organization with the expiry and reason", async () => {
		const until = new Date(Date.now() + 3_600_000);
		await setSuspension(until, "Payment dispute");

		const res = await chat();
		expect(res.status).toBe(403);
		const body = await res.text();
		expect(body).toContain(`suspended until ${until.toISOString()}`);
		expect(body).toContain("Payment dispute");

		const key = await app.request("/v1/key", {
			headers: { Authorization: "Bearer test-token" },
		});
		expect(key.status).toBe(403);
	});

	test("serves again once the suspension has expired", async () => {
		await setSuspension(new Date(Date.now() - 1000), "Payment dispute");
		const res = await chat();
		expect(res.status, await res.clone().text()).toBe(200);
	});
});
