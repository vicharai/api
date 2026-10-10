import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";

import { db, eq, inArray, tables } from "@llmgateway/db";

import {
	acquireLock,
	cleanupExpiredLogData,
	cleanupExpiredModelHistory,
	processAutoTopUp,
} from "./worker.js";

const dodoMock = vi.hoisted(() => ({
	subscriptions: {
		charge: vi.fn(),
	},
}));

// The worker constructs its own `new DodoPayments()` client lazily; mocking
// the package intercepts it.
vi.mock("dodopayments", () => ({
	default: function MockDodo() {
		return dodoMock;
	},
}));

process.env.DODO_PAYMENTS_API_KEY ??= "dodo_test_mock";

describe("worker", () => {
	const previousDataRetentionCleanup =
		process.env.ENABLE_DATA_RETENTION_CLEANUP;
	const retentionTestIds = {
		apiKeyId: "retention-test-api-key",
		lockKeys: [
			"data_retention_cleanup",
			"test-lock-1",
			"test-lock-2",
			"test-lock-3",
			"test-lock-4a",
			"test-lock-4b",
		],
		logId: "retention-test-log",
		orgId: "retention-test-org",
		projectId: "retention-test-project",
		requestId: "retention-test-request",
		userId: "retention-test-user",
	};

	const cleanupWorkerTestData = async () => {
		await db.delete(tables.auditLog);
		await db.delete(tables.log);
		await db.delete(tables.transaction);
		await db.delete(tables.paymentMethod);
		await db.delete(tables.apiKey);
		await db.delete(tables.project);
		await db.delete(tables.userOrganization);
		await db.delete(tables.organization);
		await db.delete(tables.user);
		await db.delete(tables.lock);
	};

	const cleanupRetentionTestData = async () => {
		await db
			.delete(tables.modelProviderMappingHistory)
			.where(
				inArray(tables.modelProviderMappingHistory.id, [
					"mph-old",
					"mph-recent",
				]),
			);
		await db
			.delete(tables.modelHistory)
			.where(inArray(tables.modelHistory.id, ["mh-old", "mh-recent"]));
		await db
			.delete(tables.log)
			.where(eq(tables.log.id, retentionTestIds.logId));
		await db
			.delete(tables.apiKey)
			.where(eq(tables.apiKey.id, retentionTestIds.apiKeyId));
		await db
			.delete(tables.project)
			.where(eq(tables.project.id, retentionTestIds.projectId));
		await db
			.delete(tables.organization)
			.where(eq(tables.organization.id, retentionTestIds.orgId));
		await db
			.delete(tables.user)
			.where(eq(tables.user.id, retentionTestIds.userId));
		await db
			.delete(tables.lock)
			.where(inArray(tables.lock.key, retentionTestIds.lockKeys));
	};

	beforeEach(async () => {
		await cleanupWorkerTestData();
		await cleanupRetentionTestData();
	});

	afterEach(() => {
		process.env.ENABLE_DATA_RETENTION_CLEANUP = previousDataRetentionCleanup;
	});

	afterAll(async () => {
		await cleanupWorkerTestData();
		await cleanupRetentionTestData();
	});

	describe("acquireLock", () => {
		test("should return true when acquiring a new lock", async () => {
			const lockKey = "test-lock-1";
			const result = await acquireLock(lockKey);

			expect(result).toBe(true);

			const locks = await db.query.lock.findMany({
				where: {
					key: { eq: lockKey },
				},
			});
			expect(locks).toHaveLength(1);
			expect(locks[0].key).toBe(lockKey);
		});

		test("should return false when acquiring a duplicate lock", async () => {
			const lockKey = "test-lock-2";

			const firstResult = await acquireLock(lockKey);
			expect(firstResult).toBe(true);

			const secondResult = await acquireLock(lockKey);
			expect(secondResult).toBe(false);

			const locks = await db.query.lock.findMany({
				where: {
					key: { eq: lockKey },
				},
			});
			expect(locks).toHaveLength(1);
		});

		test("should clean up expired locks and allow re-acquisition", async () => {
			const lockKey = "test-lock-3";

			// eslint-disable-next-line no-mixed-operators
			const expiredTime = new Date(Date.now() - 15 * 60 * 1000);
			await db.insert(tables.lock).values({
				key: lockKey,
				updatedAt: expiredTime,
				createdAt: expiredTime,
			});

			const expiredLocks = await db.query.lock.findMany({
				where: {
					key: { eq: lockKey },
				},
			});
			expect(expiredLocks).toHaveLength(1);

			const result = await acquireLock(lockKey);
			expect(result).toBe(true);

			const newLocks = await db.query.lock.findMany({
				where: {
					key: { eq: lockKey },
				},
			});
			expect(newLocks).toHaveLength(1);
			const timeDiff = Date.now() - newLocks[0].updatedAt.getTime();
			expect(timeDiff).toBeLessThan(5000);
		});

		test("should handle multiple different locks simultaneously", async () => {
			const lockKey1 = "test-lock-4a";
			const lockKey2 = "test-lock-4b";

			const result1 = await acquireLock(lockKey1);
			const result2 = await acquireLock(lockKey2);

			expect(result1).toBe(true);
			expect(result2).toBe(true);

			const locks = await db.query.lock.findMany();
			expect(locks).toHaveLength(2);

			const lockKeys = locks.map((lock) => lock.key).sort();
			expect(lockKeys).toEqual([lockKey1, lockKey2].sort());
		});
	});

	describe("processAutoTopUp", () => {
		const seedAutoTopUpOrg = async (
			overrides: Record<string, unknown> = {},
		) => {
			await db.insert(tables.user).values({
				id: "worker-test-user",
				email: "worker@example.com",
			});
			await db.insert(tables.organization).values({
				id: "org-auto-topup",
				name: "Auto Top-up Org",
				billingEmail: "billing@example.com",
				credits: "5",
				autoTopUpEnabled: true,
				autoTopUpThreshold: "10",
				autoTopUpAmount: "10",
				dodoCustomerId: "cus_dodo_1",
				dodoAutoTopUpSubscriptionId: "sub_mandate_1",
				...overrides,
			});
			await db.insert(tables.userOrganization).values({
				userId: "worker-test-user",
				organizationId: "org-auto-topup",
				role: "owner",
			});
		};

		beforeEach(() => {
			dodoMock.subscriptions.charge.mockReset();
			dodoMock.subscriptions.charge.mockResolvedValue({});
		});

		test("charges the mandate only when below the threshold", async () => {
			await seedAutoTopUpOrg({ credits: "15" });
			await processAutoTopUp();
			expect(dodoMock.subscriptions.charge).not.toHaveBeenCalled();

			await db
				.update(tables.organization)
				.set({ credits: "5" })
				.where(eq(tables.organization.id, "org-auto-topup"));
			await processAutoTopUp();

			expect(dodoMock.subscriptions.charge).toHaveBeenCalledTimes(1);
			const [mandateId, body] = dodoMock.subscriptions.charge.mock.calls[0];
			expect(mandateId).toBe("sub_mandate_1");
			expect(body.product_price).toBe(1050); // 10 credits + 5% fee, in cents
			expect(body.metadata).toMatchObject({
				organizationId: "org-auto-topup",
				purpose: "auto_top_up",
			});

			const txns = await db.query.transaction.findMany({
				where: { organizationId: { eq: "org-auto-topup" } },
			});
			expect(txns).toHaveLength(1);
			expect(txns[0].status).toBe("pending");
			expect(txns[0].creditAmount).toBe("10");
		});

		test("skips when a recent pending auto top-up exists", async () => {
			await seedAutoTopUpOrg();
			await db.insert(tables.transaction).values({
				organizationId: "org-auto-topup",
				type: "credit_topup",
				creditAmount: "10",
				amount: "10.50",
				status: "pending",
				description: "Auto top-up",
			});
			await processAutoTopUp();
			expect(dodoMock.subscriptions.charge).not.toHaveBeenCalled();
		});

		test("respects exponential backoff after failures", async () => {
			await seedAutoTopUpOrg({
				autoTopUpFailureCount: 2,
				// 2 failures -> 2h backoff; last failure 30 minutes ago
				autoTopUpLastFailureAt: new Date(Date.now() - 30 * 60 * 1000),
			});
			await processAutoTopUp();
			expect(dodoMock.subscriptions.charge).not.toHaveBeenCalled();

			await db
				.update(tables.organization)
				.set({
					autoTopUpLastFailureAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
				})
				.where(eq(tables.organization.id, "org-auto-topup"));
			await processAutoTopUp();
			expect(dodoMock.subscriptions.charge).toHaveBeenCalledTimes(1);
		});

		test("disables auto top-up after three consecutive failures", async () => {
			await seedAutoTopUpOrg({ autoTopUpFailureCount: 2 });
			dodoMock.subscriptions.charge.mockRejectedValue(
				new Error("card declined"),
			);
			await processAutoTopUp();

			const org = await db.query.organization.findFirst({
				where: { id: { eq: "org-auto-topup" } },
			});
			expect(org?.autoTopUpFailureCount).toBe(3);
			expect(org?.autoTopUpEnabled).toBe(false);

			const txns = await db.query.transaction.findMany({
				where: { organizationId: { eq: "org-auto-topup" } },
			});
			expect(txns[0]?.status).toBe("failed");
		});
	});

	describe("cleanupExpiredLogData", () => {
		test("should clear expired payloads and routing metadata", async () => {
			process.env.ENABLE_DATA_RETENTION_CLEANUP = "true";

			const testUser = await db
				.insert(tables.user)
				.values({
					id: retentionTestIds.userId,
					email: "retention@example.com",
					name: "Retention Test User",
				})
				.returning()
				.then((rows) => rows[0]);

			const testOrg = await db
				.insert(tables.organization)
				.values({
					id: retentionTestIds.orgId,
					name: "Retention Test Org",
					billingEmail: testUser.email,
				})
				.returning()
				.then((rows) => rows[0]);

			const testProject = await db
				.insert(tables.project)
				.values({
					id: retentionTestIds.projectId,
					organizationId: testOrg.id,
					name: "Retention Test Project",
					mode: "credits",
				})
				.returning()
				.then((rows) => rows[0]);

			const testApiKey = await db
				.insert(tables.apiKey)
				.values({
					id: retentionTestIds.apiKeyId,
					projectId: testProject.id,
					tokenHash: "retention-test-token",
					tokenMasked: "retention-test-token",
					description: "Retention Test API Key",
					createdBy: testUser.id,
				})
				.returning()
				.then((rows) => rows[0]);

			// eslint-disable-next-line no-mixed-operators
			const oldCreatedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

			const [expiredLog] = await db
				.insert(tables.log)
				.values({
					id: retentionTestIds.logId,
					requestId: retentionTestIds.requestId,
					createdAt: oldCreatedAt,
					updatedAt: oldCreatedAt,
					organizationId: testOrg.id,
					projectId: testProject.id,
					apiKeyId: testApiKey.id,
					duration: 100,
					requestedModel: "openai/gpt-4o-mini",
					requestedProvider: "openai",
					usedModel: "gpt-4o-mini",
					usedProvider: "openai",
					responseSize: 100,
					content: "response content",
					messages: [{ role: "user", content: "hello" }],
					rawRequest: { input: "hello" },
					upstreamResponse: { output: "response content" },
					userAgent: "test-user-agent",
					routingMetadata: {
						selectedProvider: "openai",
						// Classifier verdicts are derived from the prompt, so they must
						// not outlive the payloads they were derived from.
						smartRouting: {
							classifier: "jev",
							eligibleModels: ["gpt-4o"],
							candidateModels: ["gpt-4o"],
							difficulty: "high",
							task: "coding",
							selectedModel: "gpt-4o",
							classifierFailed: false,
						},
						dynamicRoute: {
							name: "smart",
							version: 1,
							path: ["rate", "big"],
							classifier: { kind: "jev", difficulty: "high", task: "coding" },
						},
					},
					gatewayContentFilterResponse: [
						{
							id: "modr-retention-test",
							model: "omni-moderation-latest",
							results: [
								{
									flagged: true,
									categories: {
										violence: true,
									},
									category_scores: {
										violence: 0.95,
									},
								},
							],
						},
					],
					mode: "credits",
					usedMode: "credits",
				})
				.returning();

			await db.insert(tables.log).values({
				...expiredLog,
				id: "retention-recent-log",
				requestId: "retention-recent-request",
				createdAt: new Date(),
			});

			await cleanupExpiredLogData();

			const cleanedLog = await db.query.log.findFirst({
				where: {
					id: {
						eq: retentionTestIds.logId,
					},
				},
			});

			expect(cleanedLog).toBeTruthy();
			expect(cleanedLog?.content).toBeNull();
			expect(cleanedLog?.messages).toBeNull();
			expect(cleanedLog?.rawRequest).toBeNull();
			expect(cleanedLog?.upstreamResponse).toBeNull();
			expect(cleanedLog?.userAgent).toBeNull();
			expect(cleanedLog?.gatewayContentFilterResponse).toBeNull();
			// Nulling the whole column is what clears the classifier verdicts too.
			expect(cleanedLog?.routingMetadata).toBeNull();
			expect(cleanedLog?.dataRetentionCleanedUp).toBe(true);

			const recentLog = await db.query.log.findFirst({
				where: { id: { eq: "retention-recent-log" } },
			});
			expect(recentLog?.routingMetadata).toEqual(expiredLog.routingMetadata);
			expect(recentLog?.dataRetentionCleanedUp).toBe(false);
		});
	});

	describe("cleanupExpiredModelHistory", () => {
		test("should delete history rows older than the retention window", async () => {
			process.env.ENABLE_DATA_RETENTION_CLEANUP = "true";

			// eslint-disable-next-line no-mixed-operators
			const oldTimestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
			// eslint-disable-next-line no-mixed-operators
			const recentTimestamp = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

			await db.insert(tables.modelProviderMappingHistory).values([
				{
					id: "mph-old",
					modelId: "retention-model",
					providerId: "retention-provider",
					modelProviderMappingId: "retention-mapping",
					minuteTimestamp: oldTimestamp,
				},
				{
					id: "mph-recent",
					modelId: "retention-model",
					providerId: "retention-provider",
					modelProviderMappingId: "retention-mapping",
					minuteTimestamp: recentTimestamp,
				},
			]);

			await db.insert(tables.modelHistory).values([
				{
					id: "mh-old",
					modelId: "retention-model",
					minuteTimestamp: oldTimestamp,
				},
				{
					id: "mh-recent",
					modelId: "retention-model",
					minuteTimestamp: recentTimestamp,
				},
			]);

			await cleanupExpiredModelHistory();

			const mappingRows = await db.query.modelProviderMappingHistory.findMany({
				where: { id: { in: ["mph-old", "mph-recent"] } },
			});
			const modelRows = await db.query.modelHistory.findMany({
				where: { id: { in: ["mh-old", "mh-recent"] } },
			});

			expect(mappingRows.map((r) => r.id)).toEqual(["mph-recent"]);
			expect(modelRows.map((r) => r.id)).toEqual(["mh-recent"]);
		});
	});
});
