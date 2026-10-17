import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, eq, tables } from "@llmgateway/db";

const originalAdminEmails = process.env.ADMIN_EMAILS;

async function cleanAnnouncements() {
	await db.delete(tables.notification);
	await db.delete(tables.notificationPreference);
	await db.delete(tables.adminAnnouncement);
	await db.delete(tables.adminTag);
}

describe("admin announcements", () => {
	let cookie: string;

	async function call(method: string, path: string, body?: unknown) {
		return await app.request(`/admin/announcements${path}`, {
			method,
			headers: {
				Cookie: cookie,
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	}

	async function preview(query: string): Promise<number> {
		const res = await call("GET", `/preview?${query}`);
		expect(res.status).toBe(200);
		return (await res.json()).recipientCount;
	}

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await cleanAnnouncements();
		await db.insert(tables.user).values([
			{ id: "ann-u1", name: "U1", email: "u1@ann.test" },
			{ id: "ann-u2", name: "U2", email: "u2@ann.test" },
			{
				id: "ann-u3",
				name: "U3",
				email: "u3@ann.test",
				status: "deactivated",
			},
			{ id: "ann-u4", name: "U4", email: "u4@ann.test" },
		]);
		await db.insert(tables.organization).values([
			{
				id: "ann-pro",
				name: "Pro Org",
				billingEmail: "pro@ann.test",
				plan: "pro",
			},
			{ id: "ann-free", name: "Free Org", billingEmail: "free@ann.test" },
		]);
		await db.insert(tables.userOrganization).values([
			{ userId: "ann-u1", organizationId: "ann-pro", role: "owner" },
			{ userId: "ann-u3", organizationId: "ann-pro", role: "developer" },
			{ userId: "ann-u4", organizationId: "ann-pro", role: "developer" },
			{ userId: "ann-u2", organizationId: "ann-free", role: "owner" },
		]);
		await db.insert(tables.adminTag).values([
			{ targetType: "organization", targetId: "ann-pro", tag: "beta" },
			{ targetType: "user", targetId: "ann-u2", tag: "beta" },
		]);
		await db.insert(tables.notificationPreference).values({
			userId: "ann-u4",
			type: "announcement",
			inApp: false,
			email: false,
		});
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await cleanAnnouncements();
		await deleteAll();
	});

	it("rejects non-admins", async () => {
		process.env.ADMIN_EMAILS = "someone-else@example.com";
		expect((await call("GET", "")).status).toBe(403);
	});

	it("previews segments over active users", async () => {
		expect(await preview("type=all")).toBe(4);
		expect(await preview("type=plan&value=pro")).toBe(2);
		// The admin also owns the default org created at sign-in.
		expect(await preview("type=kind&value=default")).toBe(4);
		expect(await preview("type=organizations&value=ann-free,ann-pro")).toBe(3);
		expect(await preview("type=tag&value=beta")).toBe(3);
		expect((await call("GET", "/preview?type=plan&value=gold")).status).toBe(
			400,
		);
		expect((await call("GET", "/preview?type=organizations")).status).toBe(400);
	});

	it("broadcasts in-app notifications, honouring opt-outs", async () => {
		const res = await call("POST", "", {
			title: "Scheduled maintenance",
			message: "We upgrade the gateway on Sunday.",
			href: "/dashboard",
			segment: { type: "all" },
			sendEmail: false,
		});
		expect(res.status).toBe(200);
		const { announcement } = await res.json();
		expect(announcement).toMatchObject({
			title: "Scheduled maintenance",
			href: "/dashboard",
			segment: { type: "all" },
			recipientCount: 3,
			emailSent: false,
			createdByEmail: "admin@example.com",
		});

		const rows = await db
			.select()
			.from(tables.notification)
			.where(eq(tables.notification.type, "announcement"));
		expect(rows.map((r) => r.userId).sort()).toEqual([
			"ann-u1",
			"ann-u2",
			"test-user-id",
		]);
		expect(rows.every((r) => r.inApp && !r.email)).toBe(true);

		const inbox = await app.request("/notifications", {
			headers: { Cookie: cookie },
		});
		const body = await inbox.json();
		expect(body.notifications).toEqual([
			expect.objectContaining({
				type: "announcement",
				title: "Scheduled maintenance",
			}),
		]);

		const list = await (await call("GET", "")).json();
		expect(list.announcements).toHaveLength(1);
	});

	it("queues emails for a segment", async () => {
		const res = await call("POST", "", {
			title: "Pro update",
			message: "New limits for Pro.",
			segment: { type: "plan", value: "pro" },
			sendEmail: true,
		});
		const { announcement } = await res.json();
		expect(announcement.recipientCount).toBe(1);
		expect(announcement.segment).toEqual({ type: "plan", value: ["pro"] });
		const rows = await db
			.select()
			.from(tables.notification)
			.where(eq(tables.notification.type, "announcement"));
		expect(rows).toEqual([
			expect.objectContaining({
				userId: "ann-u1",
				email: true,
				inApp: true,
				href: "",
				eventKey: `announcement:${announcement.id}`,
			}),
		]);

		expect(
			(
				await call("POST", "", {
					title: "x",
					message: "y",
					href: "http://insecure.test",
					segment: { type: "all" },
					sendEmail: false,
				})
			).status,
		).toBe(400);
	});
});
