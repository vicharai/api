import { afterAll, beforeEach, describe, expect, test } from "vitest";

import {
	db,
	eq,
	apiKey,
	organization,
	project,
	tables,
	user,
	userOrganization,
} from "@llmgateway/db";
import { hashApiKeyForStorage } from "@llmgateway/shared/api-key-hash";

import {
	estimateReservationCost,
	InsufficientAllowanceError,
	releaseAllowance,
	reserveAllowance,
} from "./allowance-reservation.js";

import type { ProviderModelMapping } from "@llmgateway/models";

const testUserId = "test-user-allowance";
const testOrgId = "test-org-allowance";
const testDevPlanOrgId = "test-org-allowance-devplan";
const testProjectId = "test-project-allowance";
const testApiKeyId = "test-api-key-allowance";
const testApiKeyToken = "sk-test-allowance-token";

const STALE_CYCLE_AGE_MS = 31 * 24 * 60 * 60 * 1000;

async function getOrg(orgId: string) {
	return await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
	});
}

async function getReservation(id: string) {
	return await db.query.allowanceReservation.findFirst({
		where: { id: { eq: id } },
	});
}

function reserve(
	orgId: string,
	reservationId: string,
	amountUsd: number,
): Promise<void> {
	return reserveAllowance({
		reservationId,
		organizationId: orgId,
		apiKeyId: testApiKeyId,
		projectId: testProjectId,
		amountUsd,
	});
}

describe("allowance reservations", () => {
	beforeEach(async () => {
		// Clean only this suite's rows; the test DB is shared.
		await db
			.delete(tables.allowanceReservation)
			.where(eq(tables.allowanceReservation.organizationId, testOrgId));
		await db
			.delete(tables.allowanceReservation)
			.where(eq(tables.allowanceReservation.organizationId, testDevPlanOrgId));
		await db.delete(apiKey).where(eq(apiKey.id, testApiKeyId));
		await db.delete(project).where(eq(project.id, testProjectId));
		await db.delete(organization).where(eq(organization.id, testDevPlanOrgId));
		await db.delete(organization).where(eq(organization.id, testOrgId));
		await db.delete(userOrganization);
		await db.delete(user).where(eq(user.id, testUserId));

		await db.insert(user).values({
			id: testUserId,
			name: "Allowance Test User",
			email: "test-allowance@example.com",
		});

		await db.insert(organization).values({
			id: testOrgId,
			name: "Allowance Test Org",
			billingEmail: "test-allowance@example.com",
			plan: "pro",
			credits: "10.00",
		});

		await db.insert(userOrganization).values({
			id: "test-user-org-allowance",
			userId: testUserId,
			organizationId: testOrgId,
		});

		await db.insert(project).values({
			id: testProjectId,
			name: "Allowance Test Project",
			organizationId: testOrgId,
			mode: "credits",
		});

		await db.insert(apiKey).values({
			id: testApiKeyId,
			...hashApiKeyForStorage(testApiKeyToken),
			projectId: testProjectId,
			description: "Allowance reservation test key",
			status: "active",
			createdBy: testUserId,
		});
	});

	afterAll(async () => {
		await db
			.delete(tables.allowanceReservation)
			.where(eq(tables.allowanceReservation.organizationId, testOrgId));
		await db
			.delete(tables.allowanceReservation)
			.where(eq(tables.allowanceReservation.organizationId, testDevPlanOrgId));
		await db.delete(apiKey).where(eq(apiKey.id, testApiKeyId));
		await db.delete(project).where(eq(project.id, testProjectId));
		await db.delete(organization).where(eq(organization.id, testDevPlanOrgId));
		await db.delete(organization).where(eq(organization.id, testOrgId));
		await db.delete(userOrganization);
		await db.delete(user).where(eq(user.id, testUserId));
	});

	test("reserves when under the balance and records an open row", async () => {
		await reserve(testOrgId, "resv-basic-1", 4);

		const org = await getOrg(testOrgId);
		expect(Number(org!.reservedCredits)).toBe(4);

		const row = await getReservation("resv-basic-1");
		expect(row).toBeTruthy();
		expect(row!.state).toBe("open");
		expect(Number(row!.reservedAmount)).toBe(4);
		expect(row!.apiKeyId).toBe(testApiKeyId);
		expect(row!.projectId).toBe(testProjectId);
	});

	test("rejects when the estimate does not fit the remaining balance", async () => {
		await reserve(testOrgId, "resv-fill-1", 8);

		await expect(reserve(testOrgId, "resv-over-1", 3)).rejects.toBeInstanceOf(
			InsufficientAllowanceError,
		);

		// The failed attempt left no row and did not grow the hold.
		const org = await getOrg(testOrgId);
		expect(Number(org!.reservedCredits)).toBe(8);
		expect(await getReservation("resv-over-1")).toBeFalsy();
	});

	test("two concurrent reserves of the remaining balance: exactly one wins", async () => {
		// 10 credits; two parallel attempts to hold 8 each. The guarded update
		// can only pass for one of them.
		const results = await Promise.allSettled([
			reserve(testOrgId, "resv-race-a", 8),
			reserve(testOrgId, "resv-race-b", 8),
		]);

		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
			InsufficientAllowanceError,
		);

		const org = await getOrg(testOrgId);
		expect(Number(org!.reservedCredits)).toBe(8);
	});

	test("a second reserve on the same id grows the hold (retry attempt)", async () => {
		await reserve(testOrgId, "resv-grow-1", 3);
		await reserve(testOrgId, "resv-grow-1", 2.5);

		const row = await getReservation("resv-grow-1");
		expect(Number(row!.reservedAmount)).toBeCloseTo(5.5, 6);
		expect(row!.state).toBe("open");

		const org = await getOrg(testOrgId);
		expect(Number(org!.reservedCredits)).toBeCloseTo(5.5, 6);
	});

	test("releaseAllowance frees the whole hold for an undispatched request", async () => {
		await reserve(testOrgId, "resv-release-1", 6);
		await releaseAllowance("resv-release-1");

		const org = await getOrg(testOrgId);
		expect(Number(org!.reservedCredits)).toBe(0);

		const row = await getReservation("resv-release-1");
		expect(row!.state).toBe("settled");
		expect(Number(row!.settledAmount)).toBe(0);
		expect(row!.settledAt).toBeInstanceOf(Date);
	});

	test("dev-plan orgs guard on used + reserved + estimate <= limit", async () => {
		await db.insert(organization).values({
			id: testDevPlanOrgId,
			name: "Allowance DevPlan Org",
			billingEmail: "test-allowance-dev@example.com",
			plan: "pro",
			kind: "devpass",
			devPlan: "pro",
			devPlanCreditsUsed: "5",
			devPlanCreditsLimit: "10",
			devPlanBillingCycleStart: new Date(),
			credits: "100",
			devPlanPaygEnabled: false,
		});

		// 5 used of 10: a 6 USD hold must fail even though the org sits on a
		// (unspendable, no-PAYG) 100 credit balance.
		await expect(
			reserve(testDevPlanOrgId, "resv-devplan-1", 6),
		).rejects.toBeInstanceOf(InsufficientAllowanceError);

		await reserve(testDevPlanOrgId, "resv-devplan-2", 5);
		const row = await getReservation("resv-devplan-2");
		expect(row!.state).toBe("open");
	});

	test("lazy monthly reset zeroes dev-plan usage when the cycle is stale", async () => {
		const stale = new Date(Date.now() - STALE_CYCLE_AGE_MS);
		await db.insert(organization).values({
			id: testDevPlanOrgId,
			name: "Allowance DevPlan Org",
			billingEmail: "test-allowance-dev@example.com",
			plan: "pro",
			kind: "devpass",
			devPlan: "pro",
			devPlanCreditsUsed: "9",
			devPlanCreditsLimit: "10",
			devPlanBillingCycleStart: stale,
		});

		// Used 9/10 with an expired cycle: the reset must zero usage inside the
		// same transaction so a 5 USD hold now fits.
		await reserve(testDevPlanOrgId, "resv-reset-1", 5);

		const org = await getOrg(testDevPlanOrgId);
		expect(Number(org!.devPlanCreditsUsed)).toBe(0);
		expect(org!.devPlanBillingCycleStart!.getTime()).toBeGreaterThan(
			stale.getTime(),
		);
		expect(Number(org!.reservedCredits)).toBe(5);
	});

	test("exhausted dev-plan org renews at the next cycle boundary", async () => {
		const stale = new Date(Date.now() - STALE_CYCLE_AGE_MS);
		await db.insert(organization).values({
			id: testDevPlanOrgId,
			name: "Allowance DevPlan Org",
			billingEmail: "test-allowance-dev@example.com",
			plan: "pro",
			kind: "devpass",
			devPlan: "pro",
			// Exhausted: used == limit — admission must still succeed post-reset.
			devPlanCreditsUsed: "10",
			devPlanCreditsLimit: "10",
			devPlanBillingCycleStart: stale,
		});

		await reserve(testDevPlanOrgId, "resv-renew-exhausted", 5);

		const org = await getOrg(testDevPlanOrgId);
		expect(Number(org!.devPlanCreditsUsed)).toBe(0);
		expect(Number(org!.reservedCredits)).toBe(5);
	});

	test("a stale cycle resets without touching an outstanding hold", async () => {
		const stale = new Date(Date.now() - STALE_CYCLE_AGE_MS);
		await db.insert(organization).values({
			id: testDevPlanOrgId,
			name: "Allowance DevPlan Org",
			billingEmail: "test-allowance-dev@example.com",
			plan: "pro",
			kind: "devpass",
			devPlan: "pro",
			devPlanCreditsUsed: "8",
			devPlanCreditsLimit: "10",
			devPlanBillingCycleStart: stale,
			reservedCredits: "3",
		});
		await db.insert(tables.allowanceReservation).values({
			id: "resv-held-across-cycle",
			organizationId: testDevPlanOrgId,
			apiKeyId: testApiKeyId,
			projectId: testProjectId,
			reservedAmount: "3",
		});

		// Renewal keeps the existing hold and counts it against the new cycle.
		await reserve(testDevPlanOrgId, "resv-after-renewal", 5);

		const org = await getOrg(testDevPlanOrgId);
		expect(Number(org!.devPlanCreditsUsed)).toBe(0);
		expect(Number(org!.reservedCredits)).toBe(8);
		const oldRow = await getReservation("resv-held-across-cycle");
		expect(oldRow!.state).toBe("open");
	});

	test("PAYG-enabled dev-plan orgs may reserve against their credits balance", async () => {
		await db.insert(organization).values({
			id: testDevPlanOrgId,
			name: "Allowance DevPlan Org",
			billingEmail: "test-allowance-dev@example.com",
			plan: "pro",
			kind: "devpass",
			devPlan: "pro",
			devPlanCreditsUsed: "10",
			devPlanCreditsLimit: "10",
			devPlanBillingCycleStart: new Date(),
			credits: "50",
			devPlanPaygEnabled: true,
		});

		await reserve(testDevPlanOrgId, "resv-payg-1", 20);
		const row = await getReservation("resv-payg-1");
		expect(row!.state).toBe("open");
	});

	test("zero and negative estimates are a no-op", async () => {
		await reserve(testOrgId, "resv-zero-1", 0);
		await reserve(testOrgId, "resv-zero-2", -1);

		expect(await getReservation("resv-zero-1")).toBeFalsy();
		expect(await getReservation("resv-zero-2")).toBeFalsy();
		expect(Number((await getOrg(testOrgId))!.reservedCredits)).toBe(0);
	});
});

describe("estimateReservationCost", () => {
	const mapping: ProviderModelMapping = {
		providerId: "openai",
		externalId: "gpt-test",
		streaming: true,
		inputPrice: "1e-6",
		outputPrice: "2e-6",
		maxOutput: 1000,
	};

	test("estimates prompt + capped completion + request fee", () => {
		const estimate = estimateReservationCost({
			providerMapping: {
				...mapping,
				requestPrice: "0.01",
			},
			messages: [{ role: "user", content: "hello" }],
			maxTokens: 100,
		});

		// prompt (few tokens * 1e-6) + 100 * 2e-6 + 0.01
		expect(estimate).toBeGreaterThan(0.01);
		expect(estimate).toBeLessThan(0.02);
	});

	test("clamps completion budget to maxOutput when no max_tokens", () => {
		const estimate = estimateReservationCost({
			providerMapping: mapping,
			messages: [],
			maxTokens: undefined,
		});
		// 0 prompt + min(8192, 1000) * 2e-6 = 0.002
		expect(estimate).toBeCloseTo(0.002, 6);
	});

	test("multiplies by n choices", () => {
		const one = estimateReservationCost({
			providerMapping: mapping,
			messages: [],
			maxTokens: 10,
		});
		const three = estimateReservationCost({
			providerMapping: mapping,
			messages: [],
			maxTokens: 10,
			n: 3,
		});
		expect(three).toBeCloseTo(one * 3, 9);
	});

	test("unpriced mappings estimate zero", () => {
		expect(
			estimateReservationCost({
				providerMapping: {
					providerId: "custom",
					externalId: "x",
					streaming: false,
				},
				messages: [{ role: "user", content: "hello" }],
				maxTokens: 100,
			}),
		).toBe(0);
	});
});
