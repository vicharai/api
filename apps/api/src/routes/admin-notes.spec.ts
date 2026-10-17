import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, tables } from "@llmgateway/db";

const originalAdminEmails = process.env.ADMIN_EMAILS;

async function cleanNotes() {
	await db.delete(tables.adminNote);
	await db.delete(tables.adminTag);
}

describe("admin notes and tags", () => {
	let cookie: string;

	async function call(method: string, path: string, body?: unknown) {
		return await app.request(`/admin${path}`, {
			method,
			headers: {
				Cookie: cookie,
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	}

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await cleanNotes();
		await db.insert(tables.organization).values([
			{ id: "notes-org-a", name: "Notes Org A", billingEmail: "a@notes.test" },
			{ id: "notes-org-b", name: "Notes Org B", billingEmail: "b@notes.test" },
		]);
		await db.insert(tables.user).values({
			id: "notes-user",
			name: "Noted User",
			email: "noted@notes.test",
		});
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await cleanNotes();
		await deleteAll();
	});

	it("rejects non-admins", async () => {
		process.env.ADMIN_EMAILS = "someone-else@example.com";
		expect(
			(await call("GET", "/notes?targetType=user&targetId=notes-user")).status,
		).toBe(403);
	});

	it("creates, lists, updates and deletes notes", async () => {
		const first = await (
			await call("POST", "/notes", {
				targetType: "organization",
				targetId: "notes-org-a",
				body: "Called about invoice",
			})
		).json();
		expect(first.note).toMatchObject({
			body: "Called about invoice",
			pinned: false,
			authorEmail: "admin@example.com",
		});
		const second = await (
			await call("POST", "/notes", {
				targetType: "organization",
				targetId: "notes-org-a",
				body: "VIP — handle with care",
				pinned: true,
			})
		).json();

		const list = await (
			await call("GET", "/notes?targetType=organization&targetId=notes-org-a")
		).json();
		expect(list.notes.map((n: { id: string }) => n.id)).toEqual([
			second.note.id,
			first.note.id,
		]);

		const patched = await (
			await call("PATCH", `/notes/${first.note.id}`, {
				body: "Invoice resolved",
				pinned: true,
			})
		).json();
		expect(patched.note).toMatchObject({
			body: "Invoice resolved",
			pinned: true,
		});

		expect((await call("DELETE", `/notes/${first.note.id}`)).status).toBe(200);
		expect((await call("DELETE", `/notes/${first.note.id}`)).status).toBe(404);
		expect(
			(
				await call("POST", "/notes", {
					targetType: "user",
					targetId: "missing",
					body: "x",
				})
			).status,
		).toBe(404);
	});

	it("replaces tags and filters lists by tag", async () => {
		const put = await (
			await call("PUT", "/tags", {
				targetType: "organization",
				targetId: "notes-org-a",
				tags: ["VIP", "enterprise lead", "vip"],
			})
		).json();
		expect(put.tags).toEqual(["enterprise-lead", "vip"]);

		await call("PUT", "/tags", {
			targetType: "organization",
			targetId: "notes-org-b",
			tags: ["vip"],
		});
		await call("PUT", "/tags", {
			targetType: "user",
			targetId: "notes-user",
			tags: ["vip", "churn-risk"],
		});

		const replaced = await (
			await call("PUT", "/tags", {
				targetType: "organization",
				targetId: "notes-org-a",
				tags: ["vip"],
			})
		).json();
		expect(replaced.tags).toEqual(["vip"]);
		expect(
			(
				await (
					await call(
						"GET",
						"/tags?targetType=organization&targetId=notes-org-a",
					)
				).json()
			).tags,
		).toEqual(["vip"]);

		const all = await (await call("GET", "/tags/all")).json();
		expect(all.tags).toEqual([
			{ tag: "vip", count: 3 },
			{ tag: "churn-risk", count: 1 },
		]);
		const orgTags = await (
			await call("GET", "/tags/all?targetType=organization")
		).json();
		expect(orgTags.tags).toEqual([{ tag: "vip", count: 2 }]);

		const orgs = await (await call("GET", "/organizations?tag=vip")).json();
		expect(orgs.organizations.map((o: { id: string }) => o.id).sort()).toEqual([
			"notes-org-a",
			"notes-org-b",
		]);
		expect(orgs.organizations[0].tags).toEqual(["vip"]);
		expect(orgs.total).toBe(2);

		const users = await (await call("GET", "/users?tag=churn-risk")).json();
		expect(users.users).toEqual([
			expect.objectContaining({
				id: "notes-user",
				tags: ["churn-risk", "vip"],
			}),
		]);
		expect((await call("GET", "/users")).status).toBe(400);

		expect(
			(
				await call("PUT", "/tags", {
					targetType: "user",
					targetId: "notes-user",
					tags: ["bad tag!"],
				})
			).status,
		).toBe(400);
	});
});
