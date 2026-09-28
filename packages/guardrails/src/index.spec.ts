import { beforeEach, describe, expect, test } from "vitest";

import {
	db,
	defaultSystemRulesConfig,
	eq,
	guardrailConfig,
	guardrailRule,
	guardrailViolation,
	organization,
} from "@llmgateway/db";

import { applyRedactions, checkGuardrails, logViolation } from "./index.js";

const ORG_ID = "gr-test-org";

beforeEach(async () => {
	await db
		.delete(guardrailViolation)
		.where(eq(guardrailViolation.organizationId, ORG_ID));
	await db
		.delete(guardrailRule)
		.where(eq(guardrailRule.organizationId, ORG_ID));
	await db
		.delete(guardrailConfig)
		.where(eq(guardrailConfig.organizationId, ORG_ID));
	await db.delete(organization).where(eq(organization.id, ORG_ID));
	await db.insert(organization).values({
		id: ORG_ID,
		name: "Guardrail Test Org",
		billingEmail: "gr-test@example.com",
	});
});

describe("checkGuardrails", () => {
	test("passes when no config exists (guardrails off)", async () => {
		const r = await checkGuardrails({
			organizationId: ORG_ID,
			messages: [{ role: "user", content: "tell me about cats" }],
		});
		expect(r.passed).toBe(true);
		expect(r.blocked).toBe(false);
	});

	test("secrets system rule blocks a pasted API key", async () => {
		await db
			.insert(guardrailConfig)
			.values({ organizationId: ORG_ID, enabled: true });
		const r = await checkGuardrails({
			organizationId: ORG_ID,
			messages: [
				{
					role: "user",
					content: "here is my key sk-abcdefghijklmnopqrstuvwxyz1234567890",
				},
			],
		});
		expect(r.blocked).toBe(true);
		expect(r.violations.some((v) => v.ruleId === "system:secrets")).toBe(true);
	});

	test("pii detection redacts email addresses", async () => {
		await db.insert(guardrailConfig).values({
			organizationId: ORG_ID,
			enabled: true,
			systemRules: {
				...defaultSystemRulesConfig,
				prompt_injection: { enabled: false, action: "block" },
				jailbreak: { enabled: false, action: "block" },
				secrets: { enabled: false, action: "block" },
				file_types: { enabled: false, action: "block" },
				document_leakage: { enabled: false, action: "warn" },
			},
			piiAction: "redact",
		});
		const r = await checkGuardrails({
			organizationId: ORG_ID,
			messages: [
				{ role: "user", content: "email me at jane.doe@acme-corp.io" },
			],
		});
		expect(r.blocked).toBe(false);
		expect(r.redactions.length).toBeGreaterThan(0);
		const redacted = applyRedactions(
			[{ role: "user", content: "email me at jane.doe@acme-corp.io" }],
			r.redactions,
		);
		expect(redacted[0].content).not.toContain("jane.doe@acme-corp.io");
	});

	test("custom blocked_terms rule blocks", async () => {
		await db
			.insert(guardrailConfig)
			.values({ organizationId: ORG_ID, enabled: true });
		await db.insert(guardrailRule).values({
			organizationId: ORG_ID,
			name: "no competitors",
			type: "blocked_terms",
			config: {
				type: "blocked_terms",
				terms: ["rivalcorp"],
				matchType: "contains",
				caseSensitive: false,
			},
			action: "block",
		});
		const r = await checkGuardrails({
			organizationId: ORG_ID,
			messages: [{ role: "user", content: "compare us to RivalCorp" }],
		});
		expect(r.blocked).toBe(true);
		expect(r.violations[0].ruleName).toBe("no competitors");
	});
});

describe("logViolation", () => {
	test("stores hash instead of content when retention is off", async () => {
		await logViolation(
			ORG_ID,
			{
				ruleId: "r1",
				ruleName: "rule one",
				category: "secrets",
				action: "block",
				matchedContent: "secret-value-123",
			},
			{ apiKeyId: "k1", model: "m1", retainSensitiveContent: false },
		);
		const rows = await db
			.select()
			.from(guardrailViolation)
			.where(eq(guardrailViolation.organizationId, ORG_ID));
		expect(rows.length).toBe(1);
		expect(rows[0].matchedContent).toBeNull();
		expect(rows[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
		expect(rows[0].actionTaken).toBe("blocked");
	});
});
