import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { redisClient } from "@llmgateway/cache";
import { db, eq, inArray, tables } from "@llmgateway/db";

import { adminDigestSentKey, runAdminDigest } from "./admin-digest.js";

const send = vi.fn();

vi.mock("@llmgateway/shared/email", () => ({
	fromEmail: "noreply@example.com",
	replyToEmail: "reply@example.com",
	getResendClient: () => ({ emails: { send } }),
}));

const NOW = new Date("2026-10-17T09:05:00.000Z");
const HOUR = 60 * 60 * 1000;
const RECENT = new Date(NOW.getTime() - HOUR);
const TWO_DAYS = 48 * HOUR;
const TWO_DAYS_AGO = new Date(NOW.getTime() - TWO_DAYS);
const USERS = [
	"digest-admin",
	"digest-unverified",
	"digest-new",
	"digest-flag",
];
const ORG = "digest-org";
const CONVERSATIONS = ["digest-chat-unread", "digest-chat-read"];

async function saveSettings(enabled: boolean, hourUtc: number) {
	const value = JSON.stringify({ enabled, hourUtc });
	await db
		.insert(tables.systemSetting)
		.values({ id: "admin_digest", enabled, value })
		.onConflictDoUpdate({ target: tables.systemSetting.id, set: { value } });
}

async function cleanup() {
	await db.delete(tables.systemSetting);
	await db.delete(tables.modelProviderMappingHistoryHourly);
	await db
		.delete(tables.chatSupportConversation)
		.where(inArray(tables.chatSupportConversation.id, CONVERSATIONS));
	await db.delete(tables.organization).where(eq(tables.organization.id, ORG));
	await db.delete(tables.user).where(inArray(tables.user.id, USERS));
	await redisClient.del(adminDigestSentKey(NOW));
}

describe("runAdminDigest", () => {
	beforeEach(async () => {
		await cleanup();
		process.env.ADMIN_EMAILS =
			"digest-admin@example.com,digest-unverified@example.com";
		send.mockReset().mockResolvedValue({ data: { id: "msg" }, error: null });

		const recent = RECENT;
		await db.insert(tables.user).values([
			{
				id: "digest-admin",
				email: "Digest-Admin@example.com",
				emailVerified: true,
				createdAt: TWO_DAYS_AGO,
			},
			{
				id: "digest-unverified",
				email: "digest-unverified@example.com",
				createdAt: TWO_DAYS_AGO,
			},
			{
				id: "digest-new",
				email: "digest-new@example.com",
				emailVerified: true,
				createdAt: recent,
			},
			{
				id: "digest-flag",
				email: "digest-flag@example.com",
				createdAt: recent,
				riskStatus: "flagged",
				riskFlaggedAt: recent,
			},
		]);
		await db.insert(tables.organization).values({
			id: ORG,
			name: "Digest Org",
			billingEmail: "billing@example.com",
		});
		await db.insert(tables.transaction).values([
			{
				organizationId: ORG,
				type: "credit_topup",
				amount: "40",
				creditAmount: "40",
				createdAt: recent,
			},
			{
				organizationId: ORG,
				type: "credit_gift",
				creditAmount: "10",
				createdAt: recent,
			},
		]);
		await db.insert(tables.modelProviderMappingHistoryHourly).values({
			modelId: "gpt-x",
			providerId: "openai",
			modelProviderMappingId: "digest-mapping",
			hourTimestamp: recent,
			logsCount: 100,
			upstreamErrorsCount: 7,
			gatewayErrorsCount: 3,
		});
		await db.insert(tables.chatSupportConversation).values([
			{ id: "digest-chat-unread", messageCount: 2 },
			{ id: "digest-chat-read", messageCount: 1 },
		]);
		await db.insert(tables.chatSupportReadStatus).values({
			conversationId: "digest-chat-read",
			adminUserId: "digest-admin",
			lastReadMessageCount: 1,
		});
	});

	afterEach(async () => {
		await cleanup();
	});

	it("does nothing when disabled or before the configured hour", async () => {
		expect(await runAdminDigest(NOW)).toEqual([]);
		await saveSettings(true, 10);
		expect(await runAdminDigest(NOW)).toEqual([]);
		expect(send).not.toHaveBeenCalled();
	});

	it("emails verified ADMIN_EMAILS once per day", async () => {
		await saveSettings(true, 9);

		expect(await runAdminDigest(NOW)).toEqual(["Digest-Admin@example.com"]);
		expect(await runAdminDigest(new Date(NOW.getTime() + HOUR))).toEqual([]);
		expect(send).toHaveBeenCalledTimes(1);

		const email = send.mock.calls[0]![0];
		expect(email.to).toEqual(["Digest-Admin@example.com"]);
		expect(email.text).toContain("Signups: 2 (1 verified)");
		expect(email.text).toContain("Payments: 1 totalling $40.00");
		expect(email.text).toContain("Flagged accounts awaiting review: 1 (1 new)");
		expect(email.text).toContain("Unread support chats: 1");
		expect(email.text).toContain("openai/gpt-x: 10 errors / 100 requests");
	});

	it("releases the day's claim when sending fails", async () => {
		await saveSettings(true, 9);
		send.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

		await expect(runAdminDigest(NOW)).rejects.toThrow("boom");
		expect(await redisClient.exists(adminDigestSentKey(NOW))).toBe(0);
		expect(await runAdminDigest(NOW)).toHaveLength(1);
	});
});
