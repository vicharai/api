import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, eq, projectHourlyStats, tables } from "@llmgateway/db";

const originalAdminEmails = process.env.ADMIN_EMAILS;
const DAY_MS = 86_400_000;
const FORTY_DAYS_MS = 40 * DAY_MS;

function hoursAgo(hours: number): Date {
	const offsetMs = hours * 3_600_000;
	const date = new Date(Date.now() - offsetMs);
	date.setMinutes(0, 0, 0);
	return date;
}

async function cleanCrm() {
	await db.delete(tables.crmActivity);
	await db.delete(tables.crmContact);
	await db.delete(tables.crmAccount);
	await db.delete(tables.enterpriseContactSubmission);
}

describe("admin CRM", () => {
	let cookie: string;

	async function call(method: string, path: string, body?: unknown) {
		return await app.request(`/admin/crm${path}`, {
			method,
			headers: {
				Cookie: cookie,
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	}

	async function createAccount(body: Record<string, unknown>) {
		const res = await call("POST", "/accounts", body);
		expect(res.status).toBe(200);
		return (await res.json()).account;
	}

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await cleanCrm();
		await db.insert(tables.organization).values([
			{ id: "crm-org-a", name: "Acme Prod", billingEmail: "billing@acme.test" },
			{ id: "crm-org-b", name: "Acme Lab", billingEmail: "lab@acme.test" },
		]);
		await db.insert(tables.project).values([
			{ id: "crm-proj-a", name: "Prod", organizationId: "crm-org-a" },
			{ id: "crm-proj-b", name: "Lab", organizationId: "crm-org-b" },
		]);
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await cleanCrm();
		await db.delete(tables.adminMember);
		await db.delete(tables.transaction);
		await deleteAll();
	});

	it("rejects non-admins", async () => {
		process.env.ADMIN_EMAILS = "someone-else@example.com";
		expect((await call("GET", "/accounts")).status).toBe(403);
		expect((await call("POST", "/accounts", { name: "Nope" })).status).toBe(
			403,
		);
	});

	it("creates, lists, filters, updates and deletes accounts", async () => {
		const account = await createAccount({
			name: "Acme Corp",
			domain: "https://www.Acme.test/",
			segment: "enterprise",
			stage: "negotiation",
			priority: "high",
			dealValue: 50000,
			annualContractValue: "48000.50",
			expectedCloseDate: "2026-12-01",
			ownerUserId: "test-user-id",
			organizationIds: ["crm-org-a", "crm-org-b", "crm-org-a"],
		});
		expect(account).toMatchObject({
			name: "Acme Corp",
			domain: "acme.test",
			segment: "enterprise",
			stage: "negotiation",
			priority: "high",
			dealValue: "50000",
			annualContractValue: "48000.50",
			ownerEmail: "admin@example.com",
			organizationIds: ["crm-org-a", "crm-org-b"],
			openTaskCount: 0,
			overdueTaskCount: 0,
			lastActivityAt: null,
			last30dSpend: 0,
		});
		expect(account.expectedCloseDate).toMatch(/^2026-12-01/);
		await createAccount({ name: "Tiny Startup", stage: "lead" });

		const list = await (await call("GET", "/accounts")).json();
		expect(list.accounts).toHaveLength(2);
		expect(list.kpis).toEqual({
			contractedAcv: 0,
			openPipeline: 50000,
			trials: 0,
			leads: 1,
			needsAttention: 0,
		});

		const filtered = await (
			await call("GET", "/accounts?stage=lead&search=tiny")
		).json();
		expect(filtered.accounts.map((a: { name: string }) => a.name)).toEqual([
			"Tiny Startup",
		]);
		expect(filtered.kpis.leads).toBe(1);
		const bySegment = await (
			await call("GET", "/accounts?segment=enterprise")
		).json();
		expect(bySegment.accounts).toHaveLength(1);

		const patched = await call("PATCH", `/accounts/${account.id}`, {
			stage: "won",
			notes: "Signed",
			ownerUserId: null,
		});
		expect(patched.status).toBe(200);
		expect((await patched.json()).account).toMatchObject({
			stage: "won",
			notes: "Signed",
			ownerUserId: null,
			ownerEmail: null,
			name: "Acme Corp",
			dealValue: "50000",
		});
		const afterWin = await (await call("GET", "/accounts")).json();
		expect(afterWin.kpis.contractedAcv).toBeCloseTo(48000.5);
		expect(afterWin.kpis.openPipeline).toBe(0);

		const csv = await call("GET", "/accounts.csv");
		expect(csv.status).toBe(200);
		expect(csv.headers.get("content-type")).toContain("text/csv");
		const lines = (await csv.text()).trim().split("\n");
		expect(lines[0].split(",")[0]).toBe("id");
		expect(lines).toHaveLength(3);
		expect(lines.some((line) => line.includes("crm-org-a;crm-org-b"))).toBe(
			true,
		);

		expect((await call("DELETE", `/accounts/${account.id}`)).status).toBe(200);
		expect((await call("GET", `/accounts/${account.id}`)).status).toBe(404);
	});

	it("rejects unknown organizations and owners", async () => {
		expect(
			(
				await call("POST", "/accounts", {
					name: "Ghost",
					organizationIds: ["missing-org"],
				})
			).status,
		).toBe(400);
		expect(
			(await call("POST", "/accounts", { name: "Ghost", ownerUserId: "nope" }))
				.status,
		).toBe(400);
	});

	it("replaces contacts", async () => {
		const account = await createAccount({ name: "Contacts Inc" });
		const first = await (
			await call("PUT", `/accounts/${account.id}/contacts`, {
				contacts: [
					{ name: "Ada", email: "ada@contacts.test", title: "CTO" },
					{ name: "Bob", phone: "+1 555" },
				],
			})
		).json();
		expect(first.contacts).toHaveLength(2);
		const ada = first.contacts.find((c: { name: string }) => c.name === "Ada");

		const second = await (
			await call("PUT", `/accounts/${account.id}/contacts`, {
				contacts: [
					{ id: ada.id, name: "Ada L.", email: "ada@contacts.test" },
					{ name: "Cy" },
				],
			})
		).json();
		expect(second.contacts).toEqual([
			{
				id: ada.id,
				name: "Ada L.",
				email: "ada@contacts.test",
				title: null,
				phone: null,
			},
			expect.objectContaining({ name: "Cy", email: null }),
		]);
		const stored = await db
			.select()
			.from(tables.crmContact)
			.where(eq(tables.crmContact.accountId, account.id));
		expect(stored.map((c) => c.name).sort()).toEqual(["Ada L.", "Cy"]);
	});

	it("tracks activities, tasks and accounts needing attention", async () => {
		const account = await createAccount({ name: "Tasky", stage: "trial" });
		const stale = await createAccount({ name: "Stale", stage: "qualified" });
		await createAccount({ name: "Lost cause", stage: "lost" });
		await db
			.update(tables.crmAccount)
			.set({ createdAt: new Date(Date.now() - FORTY_DAYS_MS) })
			.where(eq(tables.crmAccount.id, stale.id));

		const overdue = await (
			await call("POST", `/accounts/${account.id}/activities`, {
				type: "task",
				body: "Send proposal",
				dueAt: new Date(Date.now() - DAY_MS).toISOString(),
			})
		).json();
		expect(overdue.activity).toMatchObject({
			type: "task",
			body: "Send proposal",
			doneAt: null,
			createdByEmail: "admin@example.com",
		});
		await call("POST", `/accounts/${account.id}/activities`, {
			type: "task",
			body: "Follow up",
		});
		await call("POST", `/accounts/${account.id}/activities`, {
			type: "note",
			body: "Kickoff went well",
		});

		const list = await (await call("GET", "/accounts")).json();
		const tasky = list.accounts.find(
			(a: { id: string }) => a.id === account.id,
		);
		expect(tasky).toMatchObject({ openTaskCount: 2, overdueTaskCount: 1 });
		expect(tasky.lastActivityAt).not.toBeNull();
		expect(list.kpis).toMatchObject({ trials: 1, needsAttention: 2 });

		const tasks = await (await call("GET", "/tasks")).json();
		expect(
			tasks.tasks.map((t: { body: string; accountName: string }) => [
				t.body,
				t.accountName,
			]),
		).toEqual([
			["Send proposal", "Tasky"],
			["Follow up", "Tasky"],
		]);

		const done = await (
			await call("PATCH", `/activities/${overdue.activity.id}`, { done: true })
		).json();
		expect(done.activity.doneAt).not.toBeNull();
		const remaining = await (await call("GET", "/tasks")).json();
		expect(remaining.tasks).toHaveLength(1);

		const afterDone = await (await call("GET", "/accounts")).json();
		expect(afterDone.kpis.needsAttention).toBe(1);

		const reopened = await (
			await call("PATCH", `/activities/${overdue.activity.id}`, {
				done: false,
				dueAt: null,
				body: "Send revised proposal",
			})
		).json();
		expect(reopened.activity).toMatchObject({
			doneAt: null,
			dueAt: null,
			body: "Send revised proposal",
		});

		expect(
			(await call("DELETE", `/activities/${overdue.activity.id}`)).status,
		).toBe(200);
		expect(
			(await call("DELETE", `/activities/${overdue.activity.id}`)).status,
		).toBe(404);
	});

	it("shows linked org usage, revenue and inbound submissions", async () => {
		const account = await createAccount({
			name: "Acme Corp",
			domain: "acme.test",
			organizationIds: ["crm-org-a", "crm-org-b"],
		});
		await db.insert(projectHourlyStats).values([
			{ projectId: "crm-proj-a", hourTimestamp: hoursAgo(5), cost: 12.5 },
			{ projectId: "crm-proj-a", hourTimestamp: hoursAgo(24 * 40), cost: 99 },
			{ projectId: "crm-proj-b", hourTimestamp: hoursAgo(1), cost: 2.5 },
		]);
		await db.insert(tables.transaction).values([
			{ organizationId: "crm-org-a", type: "credit_topup", amount: "100" },
			{
				organizationId: "crm-org-a",
				type: "credit_manual_payment",
				amount: "50",
			},
			{
				organizationId: "crm-org-a",
				type: "enterprise_license_fee",
				amount: "1000",
			},
			{ organizationId: "crm-org-a", type: "credit_gift", amount: "999" },
			{
				organizationId: "crm-org-a",
				type: "credit_topup",
				amount: "777",
				status: "pending",
			},
			{ organizationId: "crm-org-a", type: "credit_topup", amount: "-20" },
		]);
		const submission = {
			country: "US",
			size: "50-200",
			message: "Interested",
		};
		await db.insert(tables.enterpriseContactSubmission).values([
			{ ...submission, name: "Ann", email: "ann@acme.test" },
			{ ...submission, name: "Sub", email: "sub@eu.acme.test" },
			{ ...submission, name: "Other", email: "x@notacme.test" },
			{
				...submission,
				name: "Spam",
				email: "spam@acme.test",
				spamFilterStatus: "rejected",
			},
		]);
		await call("PUT", `/accounts/${account.id}/contacts`, {
			contacts: [{ name: "Ann", email: "ann@acme.test" }],
		});

		const res = await call("GET", `/accounts/${account.id}`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.account.last30dSpend).toBeCloseTo(15);
		expect(body.contacts).toHaveLength(1);
		const orgs = Object.fromEntries(
			body.organizations.map((o: { id: string }) => [o.id, o]),
		);
		expect(orgs["crm-org-a"]).toMatchObject({
			name: "Acme Prod",
			last30dSpend: 12.5,
			totalRevenue: 1150,
		});
		expect(orgs["crm-org-b"]).toMatchObject({
			last30dSpend: 2.5,
			totalRevenue: 0,
		});
		expect(body.inbound.map((s: { email: string }) => s.email).sort()).toEqual([
			"ann@acme.test",
			"sub@eu.acme.test",
		]);
		expect(body.inbound[0].company).toBeNull();

		await db
			.insert(tables.adminMember)
			.values({ userId: "test-user-id", role: "support" });
		process.env.ADMIN_EMAILS = "someone-else@example.com";
		const support = await (await call("GET", `/accounts/${account.id}`)).json();
		expect(support.organizations[0].totalRevenue).toBeNull();
	});
});
