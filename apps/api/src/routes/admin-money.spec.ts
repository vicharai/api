import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { app } from "@/index.js";
import { adminRoleAllows } from "@/middleware/admin.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { apiKeyHourlyStats, db, tables } from "@llmgateway/db";

const ORG_ID = "money-org";
const OTHER_ORG_ID = "money-other-org";

function post(cookie: string, path: string, body: unknown) {
	return app.request(path, {
		method: "POST",
		headers: { Cookie: cookie, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function credits(orgId: string) {
	const org = await db.query.organization.findFirst({
		where: { id: { eq: orgId } },
	});
	return Number(org?.credits);
}

describe("admin money", () => {
	let cookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await db.insert(tables.organization).values([
			{
				id: ORG_ID,
				name: "Money Org",
				billingEmail: "money@example.com",
				credits: "10",
			},
			{
				id: OTHER_ORG_ID,
				name: "Other Org",
				billingEmail: "other@example.com",
				credits: "0",
			},
		]);
		await db.insert(tables.userOrganization).values({
			userId: "test-user-id",
			organizationId: ORG_ID,
			role: "owner",
		});
	});

	afterEach(async () => {
		await deleteAll();
	});

	describe("balance adjustments", () => {
		test("adds and deducts as credit_adjustment rows with an audit event", async () => {
			let res = await post(
				cookie,
				`/admin/organizations/${ORG_ID}/balance-adjustments`,
				{ amount: 15, reason: "goodwill" },
			);
			expect(res.status).toBe(200);
			const added = await res.json();
			expect(added.balance).toBe(25);

			res = await post(
				cookie,
				`/admin/organizations/${ORG_ID}/balance-adjustments`,
				{ amount: -20, reason: "chargeback" },
			);
			expect(res.status).toBe(200);
			expect((await res.json()).balance).toBe(5);
			expect(await credits(ORG_ID)).toBe(5);

			const rows = await db.query.transaction.findMany({
				where: { organizationId: { eq: ORG_ID } },
				orderBy: { createdAt: "asc" },
			});
			expect(rows.map((r) => [r.type, Number(r.creditAmount)])).toEqual([
				["credit_adjustment", 15],
				["credit_adjustment", -20],
			]);
			expect(rows[0].id).toBe(added.transactionId);

			const audit = await db.query.auditLog.findMany({
				where: { organizationId: { eq: ORG_ID }, action: "credits.adjust" },
			});
			expect(audit).toHaveLength(2);
		});

		test("refuses to go negative unless allowNegative is set", async () => {
			let res = await post(
				cookie,
				`/admin/organizations/${ORG_ID}/balance-adjustments`,
				{ amount: -11, reason: "too much" },
			);
			expect(res.status).toBe(409);
			expect(await credits(ORG_ID)).toBe(10);
			expect(
				await db.query.transaction.findMany({
					where: { organizationId: { eq: ORG_ID } },
				}),
			).toHaveLength(0);

			res = await post(
				cookie,
				`/admin/organizations/${ORG_ID}/balance-adjustments`,
				{ amount: -11, reason: "debt", allowNegative: true },
			);
			expect(res.status).toBe(200);
			expect(await credits(ORG_ID)).toBe(-1);
		});

		test("concurrent deductions never overdraw the balance", async () => {
			const results = await Promise.all(
				Array.from({ length: 5 }, () =>
					post(cookie, `/admin/organizations/${ORG_ID}/balance-adjustments`, {
						amount: -4,
						reason: "race",
					}),
				),
			);
			const statuses = results.map((r) => r.status).sort();
			expect(statuses).toEqual([200, 200, 409, 409, 409]);
			expect(await credits(ORG_ID)).toBe(2);
		});

		test("validates amount and reason", async () => {
			for (const body of [
				{ amount: 0, reason: "zero" },
				{ amount: 100001, reason: "huge" },
				{ amount: 5, reason: "" },
			]) {
				const res = await post(
					cookie,
					`/admin/organizations/${ORG_ID}/balance-adjustments`,
					body,
				);
				expect(res.status).toBe(400);
			}
			const missing = await post(
				cookie,
				"/admin/organizations/nope/balance-adjustments",
				{ amount: 5, reason: "x" },
			);
			expect(missing.status).toBe(404);
		});

		test("user endpoint only adjusts one of the user's organizations", async () => {
			let res = await post(
				cookie,
				"/admin/users/test-user-id/balance-adjustments",
				{ organizationId: OTHER_ORG_ID, amount: 5, reason: "x" },
			);
			expect(res.status).toBe(404);
			res = await post(
				cookie,
				"/admin/users/test-user-id/balance-adjustments",
				{
					organizationId: ORG_ID,
					amount: 5,
					reason: "support credit",
				},
			);
			expect(res.status).toBe(200);
			expect((await res.json()).balance).toBe(15);
		});

		test("adjustments stay out of revenue and gifted metrics", async () => {
			await db.insert(tables.transaction).values([
				{
					organizationId: ORG_ID,
					type: "credit_topup",
					amount: "21",
					creditAmount: "20",
					status: "completed",
				},
				{
					organizationId: ORG_ID,
					type: "credit_gift",
					creditAmount: "3",
					status: "completed",
				},
				{
					organizationId: ORG_ID,
					type: "promo_credit",
					creditAmount: "2",
					status: "completed",
				},
				{
					organizationId: ORG_ID,
					type: "signup_bonus",
					creditAmount: "1",
					status: "completed",
				},
			]);
			await post(cookie, `/admin/organizations/${ORG_ID}/balance-adjustments`, {
				amount: 100,
				reason: "correction",
			});

			const res = await app.request("/admin/metrics", {
				headers: { Cookie: cookie },
			});
			expect(res.status).toBe(200);
			const metrics = await res.json();
			expect(metrics.totalRevenue).toBe(20);
			expect(metrics.totalProcessed).toBe(21);
			expect(metrics.totalGiftedCredits).toBe(6);

			const series = await app.request("/admin/metrics/timeseries?range=7d", {
				headers: { Cookie: cookie },
			});
			expect((await series.json()).totals.revenue).toBe(20);
		});
	});

	describe("role policy", () => {
		test("ledger and adjustments are admin-only; support reads promo codes", () => {
			expect(adminRoleAllows("support", "GET", "/admin/transactions")).toBe(
				false,
			);
			expect(adminRoleAllows("viewer", "GET", "/admin/transactions.csv")).toBe(
				false,
			);
			expect(adminRoleAllows("admin", "GET", "/admin/transactions")).toBe(true);
			expect(
				adminRoleAllows(
					"support",
					"POST",
					"/admin/organizations/x/balance-adjustments",
				),
			).toBe(false);
			expect(adminRoleAllows("support", "GET", "/admin/promo-codes")).toBe(
				true,
			);
			expect(adminRoleAllows("support", "POST", "/admin/promo-codes")).toBe(
				false,
			);
			expect(
				adminRoleAllows("support", "PUT", "/admin/content/legal/terms"),
			).toBe(false);
			expect(adminRoleAllows("support", "GET", "/admin/api-keys")).toBe(true);
		});
	});

	describe("global ledger", () => {
		beforeEach(async () => {
			await db.insert(tables.transaction).values([
				{
					id: "tx-1",
					organizationId: ORG_ID,
					type: "credit_topup",
					amount: "21",
					creditAmount: "20",
					status: "completed",
					createdAt: new Date("2026-03-01T10:00:00Z"),
				},
				{
					id: "tx-2",
					organizationId: OTHER_ORG_ID,
					type: "credit_gift",
					creditAmount: "5",
					status: "completed",
					description: "=HYPERLINK(evil)",
					createdAt: new Date("2026-03-02T10:00:00Z"),
				},
				{
					id: "tx-3",
					organizationId: ORG_ID,
					type: "credit_topup",
					amount: "105",
					creditAmount: "100",
					status: "failed",
					createdAt: new Date("2026-03-03T10:00:00Z"),
				},
			]);
		});

		async function ledger(query = "") {
			const res = await app.request(`/admin/transactions${query}`, {
				headers: { Cookie: cookie },
			});
			expect(res.status).toBe(200);
			return (await res.json()) as {
				transactions: {
					id: string;
					organizationName: string;
					amount: number | null;
					creditAmount: number | null;
				}[];
				total: number;
			};
		}

		test("lists every organization newest first with paging", async () => {
			const page = await ledger("?limit=2");
			expect(page.total).toBe(3);
			expect(page.transactions.map((t) => t.id)).toEqual(["tx-3", "tx-2"]);
			expect(page.transactions[1]).toMatchObject({
				organizationName: "Other Org",
				amount: null,
				creditAmount: 5,
			});
			expect((await ledger("?limit=2&offset=2")).transactions[0].id).toBe(
				"tx-1",
			);
		});

		test("filters by type, status, organization, date and amount", async () => {
			const ids = async (query: string) =>
				(await ledger(query)).transactions.map((t) => t.id);
			expect(await ids("?type=credit_gift,credit_refund")).toEqual(["tx-2"]);
			expect(await ids("?status=failed")).toEqual(["tx-3"]);
			expect(await ids(`?organizationId=${ORG_ID}`)).toEqual(["tx-3", "tx-1"]);
			expect(await ids("?from=2026-03-02&to=2026-03-02")).toEqual(["tx-2"]);
			expect(await ids("?minAmount=10&maxAmount=50")).toEqual(["tx-1"]);
			const bad = await app.request("/admin/transactions?type=bogus", {
				headers: { Cookie: cookie },
			});
			expect(bad.status).toBe(400);
		});

		test("exports filtered rows as CSV with formula cells neutralised", async () => {
			const res = await app.request(
				"/admin/transactions.csv?type=credit_gift",
				{ headers: { Cookie: cookie } },
			);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toContain("text/csv");
			const lines = (await res.text()).trim().split("\n");
			expect(lines[0]).toBe(
				"id,createdAt,organizationId,organizationName,type,status,amount,creditAmount,currency,paymentMethod,description",
			);
			expect(lines).toHaveLength(2);
			expect(lines[1]).toContain("tx-2");
			expect(lines[1]).toContain("'=HYPERLINK(evil)");
		});
	});

	describe("global API-key search", () => {
		beforeEach(async () => {
			await db.insert(tables.project).values({
				id: "money-project",
				name: "Money Project",
				organizationId: ORG_ID,
			});
			await db.insert(tables.apiKey).values([
				{
					id: "key-one",
					tokenHash: "hash-one",
					tokenMasked: "vcdev_abcdef•••••",
					description: "Production key",
					projectId: "money-project",
					createdBy: "test-user-id",
					usage: "1.5",
					usageLimit: "10",
					createdAt: new Date("2026-03-01T00:00:00Z"),
				},
				{
					id: "key-two",
					tokenHash: "hash-two",
					tokenMasked: "vcdev_zzzzzz•••••",
					description: "Staging",
					status: "inactive",
					projectId: "money-project",
					createdBy: "test-user-id",
					createdAt: new Date("2026-03-02T00:00:00Z"),
				},
			]);
			await db.insert(apiKeyHourlyStats).values({
				apiKeyId: "key-one",
				projectId: "money-project",
				hourTimestamp: new Date("2026-04-01T05:00:00Z"),
				requestCount: 3,
			});
		});

		async function search(query: string) {
			const res = await app.request(`/admin/api-keys${query}`, {
				headers: { Cookie: cookie },
			});
			expect(res.status).toBe(200);
			return (await res.json()) as {
				apiKeys: {
					id: string;
					organizationName: string;
					projectName: string;
					lastUsedAt: string | null;
					usage: number | null;
					usageLimit: number | null;
				}[];
				total: number;
			};
		}

		test("finds keys by id, token prefix, name and organization", async () => {
			expect(
				(await search("?search=key-two")).apiKeys.map((k) => k.id),
			).toEqual(["key-two"]);
			expect(
				(await search("?search=vcdev_abcdef123456789")).apiKeys.map(
					(k) => k.id,
				),
			).toEqual(["key-one"]);
			expect(
				(await search("?search=production")).apiKeys.map((k) => k.id),
			).toEqual(["key-one"]);
			const byOrg = await search("?search=money%20org");
			expect(byOrg.total).toBe(2);
			expect(byOrg.apiKeys[1]).toMatchObject({
				id: "key-one",
				organizationName: "Money Org",
				projectName: "Money Project",
				lastUsedAt: "2026-04-01T05:00:00.000Z",
				usage: 1.5,
				usageLimit: 10,
			});
			expect(byOrg.apiKeys[0].lastUsedAt).toBeNull();
		});

		test("filters by status", async () => {
			const inactive = await search("?status=inactive");
			expect(inactive.apiKeys.map((k) => k.id)).toEqual(["key-two"]);
		});
	});
});
