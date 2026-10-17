import { describe, expect, test } from "vitest";

import {
	db,
	invalidateCacheTags,
	systemSettingCacheTag,
	tables,
} from "@llmgateway/db";
import {
	DEFAULT_MAINTENANCE_MESSAGE,
	GATEWAY_MAINTENANCE_SETTING_ID,
} from "@llmgateway/shared";

import { app } from "./app.js";
import { createGatewayApiTestHarness } from "./test-utils/gateway-api-test-harness.js";

async function setMaintenance(enabled: boolean, value: string | null) {
	await db
		.insert(tables.systemSetting)
		.values({ id: GATEWAY_MAINTENANCE_SETTING_ID, enabled, value })
		.onConflictDoUpdate({
			target: tables.systemSetting.id,
			set: { enabled, value },
		});
}

async function postJson(path: string) {
	return await app.request(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: "gpt-4o-mini",
			messages: [{ role: "user", content: "hi" }],
		}),
	});
}

describe("gateway maintenance mode", () => {
	createGatewayApiTestHarness();

	test("rejects inference endpoints with 503 while enabled", async () => {
		await setMaintenance(true, "Back at 10:00 UTC");

		const chat = await postJson("/v1/chat/completions");
		expect(chat.status).toBe(503);
		expect(chat.headers.get("Retry-After")).toBe("60");
		expect(await chat.json()).toMatchObject({
			error: { message: "Back at 10:00 UTC", type: "maintenance" },
		});

		const messages = await postJson("/v1/messages");
		expect(messages.status).toBe(503);
		expect(await messages.json()).toEqual({
			type: "error",
			error: { type: "maintenance", message: "Back at 10:00 UTC" },
		});

		expect((await postJson("/v1/embeddings")).status).toBe(503);
		expect((await app.request("/v1/models")).status).toBe(200);
	});

	test("falls back to the default message", async () => {
		await setMaintenance(true, null);

		const res = await postJson("/v1/responses");
		expect(res.status).toBe(503);
		expect((await res.json()).error.message).toBe(DEFAULT_MAINTENANCE_MESSAGE);
	});

	test("reads the cached setting until the admin write evicts it", async () => {
		await setMaintenance(true, null);
		expect((await postJson("/v1/chat/completions")).status).toBe(503);

		await setMaintenance(false, null);
		expect((await postJson("/v1/chat/completions")).status).toBe(503);

		await invalidateCacheTags([
			systemSettingCacheTag(GATEWAY_MAINTENANCE_SETTING_ID),
		]);
		expect((await postJson("/v1/chat/completions")).status).toBe(401);
	});

	test("lets requests through when disabled", async () => {
		expect((await postJson("/v1/chat/completions")).status).toBe(401);
	});
});
