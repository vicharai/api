import { describe, expect, test } from "vitest";

import { app } from "@/app.js";
import { createGatewayApiTestHarness } from "@/test-utils/gateway-api-test-harness.js";

import { db, tables } from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

describe("/v1/key", () => {
	createGatewayApiTestHarness();

	async function insertApiKey(
		values: Partial<typeof tables.apiKey.$inferInsert> = {},
	) {
		await db.insert(tables.apiKey).values({
			id: "token-id",
			...hashApiKeyForStorage("real-token"),
			projectId: "project-id",
			description: "Test API Key",
			createdBy: "user-id",
			...values,
		});
	}

	function getKey(token?: string) {
		return app.request("/v1/key", {
			headers: token ? { Authorization: `Bearer ${token}` } : {},
		});
	}

	test("401 without an API key", async () => {
		const res = await getKey();
		expect(res.status).toBe(401);
	});

	test("401 for an unknown token", async () => {
		const res = await getKey("unknown-token");
		expect(res.status).toBe(401);
	});

	test("401 for an inactive key", async () => {
		await insertApiKey({ status: "inactive" });
		const res = await getKey("real-token");
		expect(res.status).toBe(401);
	});

	test("403 for non-user key types", async () => {
		await insertApiKey({ keyType: "platform_publishable" });
		const res = await getKey("real-token");
		expect(res.status).toBe(403);
	});

	test("401 for platform_secret keys, which the gateway treats as nonexistent", async () => {
		// findApiKeyByToken excludes platform_secret on every gateway route, so
		// the response must not acknowledge that the token exists (401, not 403).
		await insertApiKey({ keyType: "platform_secret" });
		const res = await getKey("real-token");
		expect(res.status).toBe(401);
	});

	test("returns key info with devPlan none for PAYG orgs", async () => {
		await insertApiKey({ usage: "12.5", usageLimit: "50" });

		const res = await getKey("real-token");
		expect(res.status).toBe(200);
		const { data } = await res.json();
		expect(data).toEqual({
			label: "Test API Key",
			usage: "12.5",
			limit: "50",
			devPlan: "none",
			devPlanCreditsUsed: "0",
			devPlanCreditsLimit: "0",
			devPlanCreditsRemaining: "0",
			devPlanPremiumWeeklyLimit: "0",
			devPlanPremiumCreditsUsed: "0",
			devPlanPremiumWeekResetsAt: null,
		});
	});

	test("does not echo the key token", async () => {
		await insertApiKey();

		const res = await getKey("real-token");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).not.toContain("real-token");
	});
});
