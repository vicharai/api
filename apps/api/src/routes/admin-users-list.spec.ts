import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, tables } from "@llmgateway/db";

interface UsersResponse {
	users: {
		id: string;
		email: string;
		status: string;
		riskStatus: string;
		lastActiveAt: string | null;
		totalCredits: number;
		tags: string[];
		organizations: { id: string }[];
	}[];
	total: number;
}

describe("GET /admin/users", () => {
	let cookie: string;

	async function list(query = ""): Promise<UsersResponse> {
		const res = await app.request(`/admin/users${query}`, {
			headers: { Cookie: cookie },
		});
		expect(res.status).toBe(200);
		return (await res.json()) as UsersResponse;
	}

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await db.insert(tables.user).values([
			{
				id: "u-alice",
				email: "alice@example.com",
				name: "Alice",
				emailVerified: true,
				createdAt: new Date("2026-01-01T00:00:00Z"),
			},
			{
				id: "u-bob",
				email: "bob@example.com",
				name: "Bob",
				emailVerified: false,
				status: "deactivated",
				createdAt: new Date("2026-02-01T00:00:00Z"),
			},
			{
				id: "u-carol",
				email: "carol@example.com",
				name: "Carol",
				emailVerified: true,
				riskStatus: "flagged",
				createdAt: new Date("2026-03-01T00:00:00Z"),
			},
		]);
		await db.insert(tables.organization).values([
			{ id: "org-a", name: "A", billingEmail: "a@example.com", credits: "50" },
			{ id: "org-c", name: "C", billingEmail: "c@example.com", credits: "5" },
			{
				id: "org-c-deleted",
				name: "C deleted",
				billingEmail: "c@example.com",
				credits: "1000",
				status: "deleted",
			},
		]);
		await db.insert(tables.userOrganization).values([
			{ userId: "u-alice", organizationId: "org-a", role: "owner" },
			{ userId: "u-carol", organizationId: "org-c", role: "owner" },
			{ userId: "u-carol", organizationId: "org-c-deleted", role: "owner" },
		]);
		await db.insert(tables.session).values([
			{
				id: "s-bob",
				token: "s-bob-token",
				userId: "u-bob",
				expiresAt: new Date("2027-01-01T00:00:00Z"),
				updatedAt: new Date("2026-05-01T00:00:00Z"),
			},
			{
				id: "s-alice",
				token: "s-alice-token",
				userId: "u-alice",
				expiresAt: new Date("2027-01-01T00:00:00Z"),
				updatedAt: new Date("2026-04-01T00:00:00Z"),
			},
		]);
	});

	afterEach(async () => {
		await db.delete(tables.adminTag);
		await deleteAll();
	});

	test("browses every user without a search, paged with a total", async () => {
		const page = await list("?limit=2&sortBy=email&sortOrder=asc");
		expect(page.total).toBe(4);
		expect(page.users.map((u) => u.email)).toEqual([
			"admin@example.com",
			"alice@example.com",
		]);
		const next = await list("?limit=2&offset=2&sortBy=email&sortOrder=asc");
		expect(next.users.map((u) => u.email)).toEqual([
			"bob@example.com",
			"carol@example.com",
		]);
	});

	test("sorts by last activity and by balance", async () => {
		const byActivity = await list("?sortBy=lastActiveAt&sortOrder=desc");
		// The admin's own sign-in session is the newest; users without any
		// session sort last.
		expect(byActivity.users.map((u) => u.id)).toEqual([
			"test-user-id",
			"u-bob",
			"u-alice",
			"u-carol",
		]);
		expect(byActivity.users[1].lastActiveAt).toBe("2026-05-01T00:00:00.000Z");
		expect(byActivity.users[3].lastActiveAt).toBeNull();

		const byCredits = await list("?sortBy=credits&sortOrder=desc&limit=2");
		expect(byCredits.users.map((u) => [u.id, u.totalCredits])).toEqual([
			["u-alice", 50],
			// Deleted organizations do not count toward the balance.
			["u-carol", 5],
		]);
	});

	test("filters by status, risk, verification, signup date and balance", async () => {
		expect((await list("?status=deactivated")).users.map((u) => u.id)).toEqual([
			"u-bob",
		]);
		const flagged = await list("?riskStatus=flagged");
		expect(flagged.users.map((u) => u.id)).toEqual(["u-carol"]);
		expect(flagged.users[0].riskStatus).toBe("flagged");
		expect((await list("?emailVerified=false")).users.map((u) => u.id)).toEqual(
			["u-bob"],
		);
		expect(
			(
				await list("?createdFrom=2026-01-01&createdTo=2026-02-01&sortOrder=asc")
			).users.map((u) => u.id),
		).toEqual(["u-alice", "u-bob"]);
		expect(
			(await list("?hasBalance=true&sortBy=email&sortOrder=asc")).users.map(
				(u) => u.id,
			),
		).toEqual(["u-alice", "u-carol"]);
	});

	test("searches by exact user id as well as email and name", async () => {
		const byId = await list("?search=u-carol");
		expect(byId.users.map((u) => u.id)).toEqual(["u-carol"]);
		expect(byId.users[0].organizations.map((o) => o.id).sort()).toEqual([
			"org-c",
			"org-c-deleted",
		]);
		expect((await list("?search=ALIC")).users.map((u) => u.id)).toEqual([
			"u-alice",
		]);
		// LIKE wildcards in the search match literally.
		expect((await list("?search=%25")).total).toBe(0);
	});

	test("keeps the admin tag filter", async () => {
		await db.insert(tables.adminTag).values({
			targetType: "user",
			targetId: "u-bob",
			tag: "vip",
		});
		const tagged = await list("?tag=vip");
		expect(tagged.users.map((u) => u.id)).toEqual(["u-bob"]);
		expect(tagged.users[0].tags).toEqual(["vip"]);
	});
});
