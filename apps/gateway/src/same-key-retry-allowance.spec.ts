import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "vitest";

import { encryptProviderKeyForStorage } from "@llmgateway/actions";
import { db, tables } from "@llmgateway/db";
import { models } from "@llmgateway/models";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

import { app } from "./app.js";
import { estimateReservationCost } from "./lib/allowance-reservation.js";
import { createGatewayApiTestHarness } from "./test-utils/gateway-api-test-harness.js";
import { resetFailOnceCounter } from "./test-utils/mock-openai-server.js";

// Same-key retries dispatch a second billable upstream attempt under the same
// provider credential without re-resolving provider context, so each attempt
// must grow the allowance hold — otherwise a flaky upstream could bill past
// the org's monthly allowance while the hold only ever covered one attempt.
// These specs pin openai/gpt-4o so cross-provider fallback is off the table
// and the same-key branch is the only retry path, proving a retried dispatch
// holds ~2x the single-attempt estimate, and that BYOK (api-keys) projects
// never touch the platform allowance at all.
describe("same-key retry allowance holds", () => {
	const harness = createGatewayApiTestHarness();

	const savedEnv: Record<string, string | undefined> = {};

	beforeAll(() => {
		for (const key of ["LLM_OPENAI_API_KEY", "LLM_OPENAI_BASE_URL"]) {
			savedEnv[key] = process.env[key];
		}
		process.env.LLM_OPENAI_API_KEY = "sk-retry-test";
		process.env.LLM_OPENAI_BASE_URL = harness.mockServerUrl;
	});

	afterAll(() => {
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value !== undefined) {
				process.env[key] = value;
			} else {
				Reflect.deleteProperty(process.env, key);
			}
		}
	});

	beforeEach(() => {
		resetFailOnceCounter();
	});

	function chatRequest(token: string, model: string, content: string) {
		return app.request("/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content }],
			}),
		});
	}

	async function reservationsForOrg() {
		return await db.query.allowanceReservation.findMany({
			where: { organizationId: { eq: "org-id" } },
		});
	}

	test("a retried same-key dispatch grows the hold to cover both attempts", async () => {
		await harness.setProjectMode("credits");
		// Plain org credits (no dev plan): coding plans cannot pin a provider,
		// and pinning keeps the single-provider invariant deterministic.
		await harness.setOrganizationCredits("100");
		await db.insert(tables.apiKey).values({
			id: "retry-hold-key-id",
			...hashApiKeyForStorage("retry-hold-token"),
			projectId: "project-id",
			description: "Retry hold test key",
			createdBy: "user-id",
		});

		const res = await chatRequest(
			"retry-hold-token",
			"openai/gpt-4o",
			"TRIGGER_FAIL_ONCE hi",
		);
		expect(res.status).toBe(200);

		const gpt4o = models.find((m) => m.id === "gpt-4o")!;
		const openaiMapping = gpt4o.providers.find(
			(p) => p.providerId === "openai",
		);
		const singleAttempt = estimateReservationCost({
			providerMapping: openaiMapping,
			messages: [{ role: "user", content: "TRIGGER_FAIL_ONCE hi" }],
			maxTokens: undefined,
		});
		expect(singleAttempt).toBeGreaterThan(0);

		const rows = await reservationsForOrg();
		expect(rows).toHaveLength(1);
		// Exactly one hold growth per dispatched attempt: the failed alternate-key
		// resolution in between must not leave a phantom hold.
		expect(Number(rows[0]!.reservedAmount)).toBeCloseTo(2 * singleAttempt, 8);

		const org = await db.query.organization.findFirst({
			where: { id: { eq: "org-id" } },
		});
		expect(Number(org!.reservedCredits)).toBeCloseTo(2 * singleAttempt, 8);
	});

	test("api-keys (BYOK) projects never hold platform allowance", async () => {
		await harness.setProjectMode("api-keys");
		await db.insert(tables.apiKey).values({
			id: "byok-no-hold-key-id",
			...hashApiKeyForStorage("byok-no-hold-token"),
			projectId: "project-id",
			description: "BYOK no-hold test key",
			createdBy: "user-id",
		});
		await db.insert(tables.providerKey).values({
			id: "byok-provider-key-id",
			...encryptProviderKeyForStorage(
				"sk-byok-mock",
				"byok-provider-key-id",
				"org-id",
			),
			provider: "openai",
			organizationId: "org-id",
			baseUrl: harness.mockServerUrl,
		});

		const res = await chatRequest("byok-no-hold-token", "openai/gpt-4o", "hi");
		expect(res.status).toBe(200);

		expect(await reservationsForOrg()).toHaveLength(0);

		const org = await db.query.organization.findFirst({
			where: { id: { eq: "org-id" } },
		});
		expect(Number(org!.reservedCredits)).toBe(0);
	});
});
