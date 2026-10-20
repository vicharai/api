import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { redisClient } from "@llmgateway/cache";
import { db, eq, tables } from "@llmgateway/db";

import {
	SUPPORT_CREATE_RATE_LIMIT,
	SUPPORT_MESSAGE_RATE_LIMIT,
} from "./support.js";

const originalAdminEmails = process.env.ADMIN_EMAILS;

const PASSWORD_HASH =
	"c11ef27a7f9264be08db228ebb650888:a4d985a9c6bd98608237fd507534424950aa7fc255930d972242b81cbe78594f8568feb0d067e95ddf7be242ad3e9d013f695f4414fce68bfff091079f1dc460";

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

async function clearRateLimits() {
	for (const userId of ["test-user-id", "other-user"]) {
		await redisClient.del(
			`${SUPPORT_CREATE_RATE_LIMIT.keyPrefix}:${userId}`,
			`${SUPPORT_MESSAGE_RATE_LIMIT.keyPrefix}:${userId}`,
		);
	}
}

describe("support conversations", () => {
	let cookie: string;
	let otherCookie: string;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = "admin@example.com";
		cookie = await createTestUser();
		await db.insert(tables.user).values({
			id: "other-user",
			name: "Other User",
			email: "other@example.com",
			emailVerified: true,
		});
		await db.insert(tables.account).values({
			id: "other-account",
			providerId: "credential",
			accountId: "other-account",
			userId: "other-user",
			password: PASSWORD_HASH,
		});
		const signIn = await app.request("/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: "other@example.com",
				password: "admin@example.com1A",
			}),
		});
		expect(signIn.status).toBe(200);
		otherCookie = signIn.headers.get("set-cookie")!;
		await db.insert(tables.organization).values({
			id: "support-org",
			name: "Support Org",
			billingEmail: "admin@example.com",
		});
		await db.insert(tables.userOrganization).values({
			userId: "test-user-id",
			organizationId: "support-org",
			role: "owner",
		});
		await clearRateLimits();
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await db.delete(tables.chatSupportConversation);
		await db.delete(tables.notification);
		await clearRateLimits();
		await deleteAll();
	});

	it("requires authentication", async () => {
		expect((await app.request("/support/conversations")).status).toBe(401);
	});

	it("creates, lists, replies to and resolves a conversation", async () => {
		const created = await request(cookie, "POST", "/support/conversations", {
			subject: "Billing question",
			message: "How do invoices work?",
			organizationId: "support-org",
		});
		expect(created.status).toBe(200);
		const conversation = await created.json();
		expect(conversation).toMatchObject({
			subject: "Billing question",
			status: "open",
			messageCount: 1,
			workspaceId: "support-org",
			messages: [{ role: "user", content: "How do invoices work?" }],
		});

		const stored = await db.query.chatSupportConversation.findFirst({
			where: { id: { eq: conversation.id } },
		});
		expect(stored).toMatchObject({
			clientId: "test-user-id",
			email: "admin@example.com",
			name: "Test User",
		});

		const list = await request(cookie, "GET", "/support/conversations");
		expect(list.status).toBe(200);
		const { conversations } = await list.json();
		expect(conversations).toHaveLength(1);
		expect(conversations[0]).toMatchObject({
			id: conversation.id,
			subject: "Billing question",
			status: "open",
			lastMessage: { role: "user", preview: "How do invoices work?" },
		});

		const reply = await request(
			cookie,
			"POST",
			`/admin/chat-support-logs/${conversation.id}/reply`,
			{ content: "Invoices are emailed monthly." },
		);
		expect(reply.status).toBe(200);

		const answered = await request(
			cookie,
			"GET",
			`/support/conversations/${conversation.id}`,
		);
		expect(await answered.json()).toMatchObject({
			status: "answered",
			messageCount: 2,
			messages: [
				{ role: "user" },
				{ role: "admin", content: "Invoices are emailed monthly." },
			],
		});

		const alerts = await request(cookie, "GET", "/notifications");
		const { notifications } = await alerts.json();
		expect(notifications).toEqual([
			expect.objectContaining({
				type: "support_reply",
				href: `/dashboard/support?conversation=${conversation.id}`,
			}),
		]);

		const resolved = await request(
			cookie,
			"POST",
			`/support/conversations/${conversation.id}/resolve`,
		);
		expect((await resolved.json()).status).toBe("resolved");

		await db
			.update(tables.chatSupportConversation)
			.set({ archivedAt: new Date() })
			.where(eq(tables.chatSupportConversation.id, conversation.id));

		const followUp = await request(
			cookie,
			"POST",
			`/support/conversations/${conversation.id}/messages`,
			{ message: "One more thing." },
		);
		expect(followUp.status).toBe(200);
		const reopened = await followUp.json();
		expect(reopened).toMatchObject({
			status: "open",
			resolvedAt: null,
			messageCount: 3,
		});
		expect(reopened.messages.map((m: { role: string }) => m.role)).toEqual([
			"user",
			"admin",
			"user",
		]);

		const after = await db.query.chatSupportConversation.findFirst({
			where: { id: { eq: conversation.id } },
		});
		expect(after?.archivedAt).toBeNull();
		const sequences = await db.query.chatSupportMessage.findMany({
			where: { conversationId: { eq: conversation.id } },
			orderBy: { sequence: "asc" },
		});
		expect(sequences.map((m) => m.sequence)).toEqual([0, 1, 2]);
	});

	it("isolates conversations between users", async () => {
		const created = await request(cookie, "POST", "/support/conversations", {
			message: "Private question",
		});
		const { id } = await created.json();

		expect(
			(await request(otherCookie, "GET", `/support/conversations/${id}`))
				.status,
		).toBe(404);
		expect(
			(
				await request(
					otherCookie,
					"POST",
					`/support/conversations/${id}/messages`,
					{ message: "hijack" },
				)
			).status,
		).toBe(404);
		expect(
			(
				await request(
					otherCookie,
					"POST",
					`/support/conversations/${id}/resolve`,
				)
			).status,
		).toBe(404);
		const list = await request(otherCookie, "GET", "/support/conversations");
		expect((await list.json()).conversations).toEqual([]);
	});

	it("rejects workspaces the user does not belong to", async () => {
		const res = await request(otherCookie, "POST", "/support/conversations", {
			message: "Hello",
			organizationId: "support-org",
		});
		expect(res.status).toBe(404);
	});

	it("validates input", async () => {
		const empty = await request(cookie, "POST", "/support/conversations", {
			message: "   ",
		});
		expect(empty.status).toBe(400);
		const multiline = await request(cookie, "POST", "/support/conversations", {
			subject: "a\nb",
			message: "Hello",
		});
		expect(multiline.status).toBe(400);
	});

	it("rate limits new conversations", async () => {
		for (let i = 0; i < SUPPORT_CREATE_RATE_LIMIT.maxRequests; i++) {
			const res = await request(cookie, "POST", "/support/conversations", {
				message: `Question ${i}`,
			});
			expect(res.status).toBe(200);
		}
		const limited = await request(cookie, "POST", "/support/conversations", {
			message: "One too many",
		});
		expect(limited.status).toBe(429);
	});

	it("lets support staff resolve conversations", async () => {
		const created = await request(cookie, "POST", "/support/conversations", {
			message: "Please close me",
			organizationId: "support-org",
		});
		const { id } = await created.json();
		const res = await request(
			cookie,
			"PATCH",
			`/admin/chat-support-logs/${id}/resolve`,
			{ resolved: true },
		);
		expect(res.status).toBe(200);
		const detail = await request(
			cookie,
			"GET",
			`/admin/chat-support-logs/${id}`,
		);
		expect(await detail.json()).toMatchObject({
			organizationId: "support-org",
			organizationName: "Support Org",
		});
		const list = await request(cookie, "GET", "/admin/chat-support-logs");
		expect((await list.json()).conversations[0]).toMatchObject({
			id,
			lastMessageRole: "user",
		});
		const own = await request(cookie, "GET", `/support/conversations/${id}`);
		expect((await own.json()).status).toBe("resolved");

		const reads = await Promise.all(
			[1, 1].map((messageCount) =>
				request(cookie, "POST", `/admin/chat-support-logs/${id}/read`, {
					messageCount,
				}),
			),
		);
		expect(reads.map((r) => r.status)).toEqual([200, 200]);
		const statuses = await request(
			cookie,
			"GET",
			"/admin/chat-support-logs/read-statuses",
		);
		expect((await statuses.json()).readStatuses).toEqual({ [id]: 1 });
	});
});
