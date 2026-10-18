import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { redisClient } from "@llmgateway/cache";
import { db, eq, tables } from "@llmgateway/db";

import { PROMO_REDEEM_RATE_LIMIT } from "./promo-codes.js";

const ORG_ID = "promo-org";
const OTHER_ORG_ID = "promo-other-org";

async function request(
	cookie: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<Response> {
	return await app.request(path, {
		method,
		headers: { Cookie: cookie, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

async function credits(orgId: string) {
	const org = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
	});
	return Number(org?.credits);
}

describe("promo codes", () => {
	let cookie: string;

	const redeem = (code: string, orgId = ORG_ID) =>
		request(cookie, "POST", `/orgs/${orgId}/promo-codes/redeem`, { code });

	async function createCode(body: Record<string, unknown>) {
		const res = await request(cookie, "POST", "/admin/promo-codes", body);
		expect(res.status).toBe(200);
		return (await res.json()).code as {
			id: string;
			code: string;
			amount: number;
			redemptionCount: number;
			active: boolean;
		};
	}

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await redisClient.del(`${PROMO_REDEEM_RATE_LIMIT.keyPrefix}:test-user-id`);
		await db.insert(tables.organization).values([
			{ id: ORG_ID, name: "Promo Org", billingEmail: "p@example.com" },
			{ id: OTHER_ORG_ID, name: "Other", billingEmail: "o@example.com" },
		]);
		await db.insert(tables.userOrganization).values([
			{ userId: "test-user-id", organizationId: ORG_ID, role: "owner" },
			{ userId: "test-user-id", organizationId: OTHER_ORG_ID, role: "admin" },
		]);
	});

	afterEach(async () => {
		await deleteAll();
	});

	describe("admin CRUD", () => {
		test("creates, lists, updates and deactivates codes", async () => {
			const generated = await createCode({ amount: 5 });
			expect(generated.code).toMatch(/^[A-Z2-9]{10}$/);

			const named = await createCode({
				code: " spring-26 ",
				amount: 12.5,
				maxRedemptions: 100,
				expiresAt: "2030-01-01T00:00:00Z",
			});
			expect(named).toMatchObject({ code: "SPRING-26", amount: 12.5 });

			const duplicate = await request(cookie, "POST", "/admin/promo-codes", {
				code: "Spring-26",
				amount: 1,
			});
			expect(duplicate.status).toBe(409);

			const invalid = await request(cookie, "POST", "/admin/promo-codes", {
				code: "no spaces!",
				amount: 1,
			});
			expect(invalid.status).toBe(400);

			const list = await request(cookie, "GET", "/admin/promo-codes");
			const { codes } = await list.json();
			expect(codes.map((c: { code: string }) => c.code)).toEqual([
				"SPRING-26",
				generated.code,
			]);
			expect(codes[0]).toMatchObject({
				maxRedemptions: 100,
				perOrgLimit: 1,
				redemptionCount: 0,
				expiresAt: "2030-01-01T00:00:00.000Z",
				createdByEmail: "admin@example.com",
			});

			const patched = await request(
				cookie,
				"PATCH",
				`/admin/promo-codes/${named.id}`,
				{ maxRedemptions: null, expiresAt: null },
			);
			expect((await patched.json()).code).toMatchObject({
				maxRedemptions: null,
				expiresAt: null,
				active: true,
			});

			const removed = await request(
				cookie,
				"DELETE",
				`/admin/promo-codes/${named.id}`,
			);
			expect(removed.status).toBe(200);
			const row = await db.query.promoCode.findFirst({
				where: { id: { eq: named.id } },
			});
			expect(row?.active).toBe(false);
		});
	});

	describe("redeem", () => {
		test("credits the organization once, case-insensitively", async () => {
			const code = await createCode({ code: "WELCOME10", amount: 10 });

			const res = await redeem("welcome10");
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ amount: 10, balance: 10 });
			expect(await credits(ORG_ID)).toBe(10);

			const again = await redeem("WELCOME10");
			expect(again.status).toBe(409);
			expect(await credits(ORG_ID)).toBe(10);

			const txns = await db.query.transaction.findMany({
				where: { organizationId: { eq: ORG_ID } },
			});
			expect(txns.map((t) => [t.type, Number(t.creditAmount)])).toEqual([
				["promo_credit", 10],
			]);

			const redemptions = await request(
				cookie,
				"GET",
				`/admin/promo-codes/${code.id}/redemptions`,
			);
			const body = await redemptions.json();
			expect(body.redemptions).toHaveLength(1);
			expect(body.redemptions[0]).toMatchObject({
				organizationId: ORG_ID,
				organizationName: "Promo Org",
				userEmail: "admin@example.com",
				amount: 10,
			});

			const audit = await db.query.auditLog.findMany({
				where: { organizationId: { eq: ORG_ID }, action: "promo_code.redeem" },
			});
			expect(audit).toHaveLength(1);
		});

		test("rejects unknown, inactive, expired and exhausted codes", async () => {
			expect((await redeem("NOPE")).status).toBe(404);

			const inactive = await createCode({ code: "OFF", amount: 1 });
			await request(cookie, "DELETE", `/admin/promo-codes/${inactive.id}`);
			expect((await redeem("OFF")).status).toBe(404);

			await createCode({
				code: "OLD",
				amount: 1,
				expiresAt: "2020-01-01T00:00:00Z",
			});
			expect((await redeem("OLD")).status).toBe(409);

			await createCode({ code: "ONCE", amount: 1, maxRedemptions: 1 });
			expect((await redeem("ONCE")).status).toBe(200);
			expect((await redeem("ONCE", OTHER_ORG_ID)).status).toBe(409);
			expect(await credits(OTHER_ORG_ID)).toBe(0);
		});

		test("honours a per-organization limit above one", async () => {
			await createCode({ code: "TWICE", amount: 2, perOrgLimit: 2 });
			expect((await redeem("TWICE")).status).toBe(200);
			expect((await redeem("TWICE")).status).toBe(200);
			expect((await redeem("TWICE")).status).toBe(409);
			expect(await credits(ORG_ID)).toBe(4);
		});

		test("concurrent redemptions never exceed the global limit", async () => {
			const code = await createCode({
				code: "RACE",
				amount: 3,
				maxRedemptions: 3,
				perOrgLimit: 100,
			});
			const results = await Promise.all(
				Array.from({ length: 8 }, () => redeem("RACE")),
			);
			const statuses = results.map((r) => r.status);
			expect(statuses.filter((s) => s === 200)).toHaveLength(3);
			expect(statuses.filter((s) => s === 409)).toHaveLength(5);
			expect(await credits(ORG_ID)).toBe(9);
			const row = await db.query.promoCode.findFirst({
				where: { id: { eq: code.id } },
			});
			expect(row?.redemptionCount).toBe(3);
			expect(
				await db.query.promoCodeRedemption.findMany({
					where: { promoCodeId: { eq: code.id } },
				}),
			).toHaveLength(3);
		});

		test("requires billing rights and a regular organization", async () => {
			await createCode({ code: "GATE", amount: 1 });
			await db
				.update(tables.userOrganization)
				.set({ role: "developer" })
				.where(eq(tables.userOrganization.organizationId, ORG_ID));
			expect((await redeem("GATE")).status).toBe(403);

			await db
				.update(tables.organization)
				.set({ riskFlagged: true })
				.where(eq(tables.organization.id, OTHER_ORG_ID));
			expect((await redeem("GATE", OTHER_ORG_ID)).status).toBe(403);
			expect((await redeem("GATE", "missing-org")).status).toBe(404);
		});

		test("rate-limits attempts per user", async () => {
			for (let i = 0; i < PROMO_REDEEM_RATE_LIMIT.maxRequests; i++) {
				expect((await redeem(`MISSING${i}`)).status).toBe(404);
			}
			expect((await redeem("MISSING")).status).toBe(429);
		});
	});
});
