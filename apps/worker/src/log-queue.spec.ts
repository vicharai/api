import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	claimFromQueue,
	LOG_QUEUE,
	publishToQueue,
	redriveStaleInflight,
	redisClient,
} from "@llmgateway/cache";
import { db, inArray, log } from "@llmgateway/db";

import { logInsertCircuit, processLogQueue } from "./worker.js";

import type { LogInsertData } from "@llmgateway/db";

describe("processLogQueue", () => {
	let logIds: string[] = [];

	beforeEach(async () => {
		logIds = [];
		logInsertCircuit.consecutiveFailures = 0;
		logInsertCircuit.nextAttemptAt = 0;
		await redisClient.del(LOG_QUEUE);
		await redisClient.del(`${LOG_QUEUE}:inflight`);
		await redisClient.del(`${LOG_QUEUE}:inflight_claims`);
	});

	afterEach(async () => {
		await redisClient.del(LOG_QUEUE);
		await redisClient.del(`${LOG_QUEUE}:inflight`);
		await redisClient.del(`${LOG_QUEUE}:inflight_claims`);
		if (logIds.length > 0) {
			await db.delete(log).where(inArray(log.id, logIds));
		}
	});

	it("rounds fractional token limits up when inserting a batch of logs", async () => {
		const baseLog: LogInsertData = {
			requestId: "request-id",
			organizationId: "org-id",
			projectId: "project-id",
			apiKeyId: "api-key-id",
			duration: 100,
			requestedModel: "gpt-4o-mini",
			usedModel: "gpt-4o-mini",
			usedProvider: "openai",
			responseSize: 0,
			mode: "credits",
			usedMode: "credits",
		};
		const fractionalId = randomUUID();
		const validId = randomUUID();
		const unsetId = randomUUID();
		logIds.push(fractionalId, validId, unsetId);
		await publishToQueue(LOG_QUEUE, {
			...baseLog,
			id: fractionalId,
			maxTokens: 128.5,
			reasoningMaxTokens: 64.25,
			hasError: true,
			finishReason: "client_error",
		});
		await publishToQueue(LOG_QUEUE, {
			...baseLog,
			id: validId,
			maxTokens: 1024,
			reasoningMaxTokens: 512,
			promptTokens: "12.5",
		});
		await publishToQueue(LOG_QUEUE, {
			...baseLog,
			id: unsetId,
			maxTokens: null,
		});

		expect(await processLogQueue()).toBe(3);
		expect(await redisClient.llen(LOG_QUEUE)).toBe(0);
		expect(logInsertCircuit.consecutiveFailures).toBe(0);
		const rows = await db.query.log.findMany({
			where: { id: { in: logIds } },
		});
		expect(rows).toHaveLength(3);
		expect(rows.find((row) => row.id === fractionalId)).toMatchObject({
			maxTokens: 129,
			reasoningMaxTokens: 65,
			hasError: true,
			finishReason: "client_error",
		});
		expect(rows.find((row) => row.id === validId)).toMatchObject({
			maxTokens: 1024,
			reasoningMaxTokens: 512,
			promptTokens: "12.5",
		});
		expect(rows.find((row) => row.id === unsetId)).toMatchObject({
			maxTokens: null,
			reasoningMaxTokens: null,
		});
	});

	it("replayed deliveries dedupe on the log id instead of double-writing", async () => {
		const logId = randomUUID();
		logIds.push(logId);
		const payload: LogInsertData = {
			id: logId,
			requestId: "request-id",
			organizationId: "org-id",
			projectId: "project-id",
			apiKeyId: "api-key-id",
			duration: 10,
			requestedModel: "gpt-4o-mini",
			usedModel: "gpt-4o-mini",
			usedProvider: "openai",
			responseSize: 0,
			mode: "credits",
			usedMode: "credits",
		};
		// Same event published twice: replayed queue, retried publish, etc.
		await publishToQueue(LOG_QUEUE, payload);
		await publishToQueue(LOG_QUEUE, payload);

		expect(await processLogQueue()).toBe(2);
		const rows = await db.query.log.findMany({
			where: { id: { eq: logId } },
		});
		expect(rows).toHaveLength(1);
	});

	it("a consumer crash leaves events claimable for redrive, not lost", async () => {
		const logId = randomUUID();
		logIds.push(logId);
		await publishToQueue(LOG_QUEUE, {
			id: logId,
			requestId: "request-id",
			organizationId: "org-id",
			projectId: "project-id",
			apiKeyId: "api-key-id",
			duration: 10,
			requestedModel: "gpt-4o-mini",
			usedModel: "gpt-4o-mini",
			usedProvider: "openai",
			responseSize: 0,
			mode: "credits",
			usedMode: "credits",
		});

		// Simulate the crash window: the message was claimed (LMOVE) but the
		// worker died before inserting or acknowledging.
		const claimed = await claimFromQueue(LOG_QUEUE, 10);
		expect(claimed).toHaveLength(1);
		expect(await redisClient.llen(LOG_QUEUE)).toBe(0);
		expect(await redisClient.llen(`${LOG_QUEUE}:inflight`)).toBe(1);

		// Fresh claims see nothing — the event is parked in-flight.
		expect(await claimFromQueue(LOG_QUEUE, 10)).toBeNull();

		// The redrive pass returns it to the queue; processing then persists it.
		expect(await redriveStaleInflight(LOG_QUEUE, 0)).toBe(1);
		expect(await processLogQueue()).toBe(1);
		expect(
			await db.query.log.findFirst({ where: { id: { eq: logId } } }),
		).toBeTruthy();
		expect(await redisClient.llen(`${LOG_QUEUE}:inflight`)).toBe(0);
	});

	it("fresh in-flight claims are not redriven while still being processed", async () => {
		const logId = randomUUID();
		logIds.push(logId);
		await publishToQueue(LOG_QUEUE, {
			id: logId,
			requestId: "request-id",
			organizationId: "org-id",
			projectId: "project-id",
			apiKeyId: "api-key-id",
			duration: 10,
			requestedModel: "gpt-4o-mini",
			usedProvider: "openai",
			responseSize: 0,
			mode: "credits",
			usedMode: "credits",
		});

		await claimFromQueue(LOG_QUEUE, 10);
		// staleMs huge: nothing claimed recently is stale.
		expect(await redriveStaleInflight(LOG_QUEUE, 60_000)).toBe(0);
		expect(await redisClient.llen(`${LOG_QUEUE}:inflight`)).toBe(1);
	});
});
