import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, tables } from "@llmgateway/db";

const ORG_ID = "test-org-id";

async function seedOrg() {
	await db.insert(tables.organization).values({
		id: ORG_ID,
		name: "Test Organization",
		billingEmail: "admin@example.com",
		credits: "10",
	});
	await db.insert(tables.userOrganization).values({
		userId: "test-user-id",
		organizationId: ORG_ID,
		role: "owner",
	});
}

describe("admin ops", () => {
	let cookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await seedOrg();
	});

	afterEach(async () => {
		await deleteAll();
	});

	test("rejects a non-admin user with 403", async () => {
		process.env.ADMIN_EMAILS = "someone-else@example.com";
		const res = await app.request(`/admin/organizations/${ORG_ID}/credits`, {
			method: "POST",
			headers: { Cookie: cookie, "Content-Type": "application/json" },
			body: JSON.stringify({ creditAmount: 5, reason: "test" }),
		});
		expect(res.status).toBe(403);
	});

	test("credit grant writes a transaction and updates the balance once", async () => {
		const body = JSON.stringify({
			creditAmount: 5,
			reason: "support grant",
		});
		for (let i = 0; i < 2; i++) {
			const res = await app.request(`/admin/organizations/${ORG_ID}/credits`, {
				method: "POST",
				headers: { Cookie: cookie, "Content-Type": "application/json" },
				body,
			});
			expect(res.status).toBe(200);
		}

		const org = await db.query.organization.findFirst({
			where: { id: { eq: ORG_ID } },
		});
		expect(Number(org?.credits)).toBe(20);

		const txns = await db.query.transaction.findMany({
			where: { organizationId: { eq: ORG_ID }, type: { eq: "credit_gift" } },
		});
		expect(txns).toHaveLength(2);
		expect(Number(txns[0].creditAmount)).toBe(5);
	});

	test("credit deduction subtracts the balance", async () => {
		const res = await app.request(`/admin/organizations/${ORG_ID}/credits`, {
			method: "POST",
			headers: { Cookie: cookie, "Content-Type": "application/json" },
			body: JSON.stringify({ creditAmount: -4, reason: "clawback" }),
		});
		expect(res.status).toBe(200);
		const org = await db.query.organization.findFirst({
			where: { id: { eq: ORG_ID } },
		});
		expect(Number(org?.credits)).toBe(6);
	});

	test("risk flag toggles and disables auto top-up", async () => {
		let res = await app.request(`/admin/organizations/${ORG_ID}/risk-flag`, {
			method: "POST",
			headers: { Cookie: cookie, "Content-Type": "application/json" },
			body: JSON.stringify({ flagged: true, reason: "fraud check" }),
		});
		expect(res.status).toBe(200);
		let org = await db.query.organization.findFirst({
			where: { id: { eq: ORG_ID } },
		});
		expect(org?.riskFlagged).toBe(true);

		res = await app.request(
			`/admin/organizations/${ORG_ID}/auto-top-up/disable`,
			{
				method: "POST",
				headers: { Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify({ reason: "suspicious" }),
			},
		);
		expect(res.status).toBe(200);
		org = await db.query.organization.findFirst({
			where: { id: { eq: ORG_ID } },
		});
		expect(org?.autoTopUpEnabled).toBe(false);
	});

	test("user search returns users with their organizations", async () => {
		const res = await app.request(`/admin/users?search=admin%40example.com`, {
			headers: { Cookie: cookie },
		});
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.users).toHaveLength(1);
		expect(json.users[0].email).toBe("admin@example.com");
		expect(
			json.users[0].organizations.map((o: { id: string }) => o.id),
		).toContain(ORG_ID);
	});

	test("verify-email marks an unverified user", async () => {
		await db.insert(tables.user).values({
			id: "unverified-user",
			name: "Unverified",
			email: "unverified@example.com",
			emailVerified: false,
		});
		const res = await app.request("/admin/users/unverified-user/verify-email", {
			method: "POST",
			headers: { Cookie: cookie, "Content-Type": "application/json" },
			body: JSON.stringify({ reason: "manual check" }),
		});
		expect(res.status).toBe(200);
		const user = await db.query.user.findFirst({
			where: { id: { eq: "unverified-user" } },
		});
		expect(user?.emailVerified).toBe(true);
	});
});
