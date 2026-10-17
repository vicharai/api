import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "@/index.js";
import { createTestUser, deleteAll } from "@/testing.js";

import { db, tables } from "@llmgateway/db";

import type * as LlmGatewayDb from "@llmgateway/db";

const { invalidateSpy } = vi.hoisted(() => ({ invalidateSpy: vi.fn() }));

vi.mock("@llmgateway/db", async (importOriginal) => {
	const actual = await importOriginal<typeof LlmGatewayDb>();
	return {
		...actual,
		invalidateCacheTags: async (tags: string[]) => {
			invalidateSpy(tags);
			await actual.invalidateCacheTags(tags);
		},
	};
});

const originalAdminEmails = process.env.ADMIN_EMAILS;

describe("admin routing overrides", () => {
	let cookie: string;

	async function call(method: string, path: string, body?: unknown) {
		return await app.request(`/admin/routing-overrides${path}`, {
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
		await db.delete(tables.routingOverride);
		invalidateSpy.mockClear();
	});

	afterEach(async () => {
		if (originalAdminEmails === undefined) {
			delete process.env.ADMIN_EMAILS;
		} else {
			process.env.ADMIN_EMAILS = originalAdminEmails;
		}
		await db.delete(tables.routingOverride);
		await deleteAll();
	});

	it("rejects non-admins", async () => {
		process.env.ADMIN_EMAILS = "someone-else@example.com";
		expect((await call("GET", "")).status).toBe(403);
	});

	it("creates, lists and deletes kill switches", async () => {
		const created = await call("POST", "", {
			scope: "mapping",
			target: "azure/gpt-5.5",
			reason: "Elevated 5xx",
		});
		expect(created.status).toBe(200);
		const { override } = await created.json();
		expect(override).toMatchObject({
			scope: "mapping",
			target: "azure/gpt-5.5",
			reason: "Elevated 5xx",
			expiresAt: null,
			createdByEmail: "admin@example.com",
			active: true,
		});
		expect(invalidateSpy).toHaveBeenCalledWith(["routing-overrides"]);

		const expiring = new Date(Date.now() + 3_600_000).toISOString();
		await call("POST", "", {
			scope: "provider",
			target: "deepseek",
			reason: "Outage",
			expiresAt: expiring,
		});
		await db.insert(tables.routingOverride).values({
			scope: "model",
			target: "old-model",
			reason: "Expired",
			expiresAt: new Date(Date.now() - 60_000),
		});

		const list = await (await call("GET", "")).json();
		expect(list.overrides).toHaveLength(3);
		const byTarget = Object.fromEntries(
			list.overrides.map((o: { target: string; active: boolean }) => [
				o.target,
				o.active,
			]),
		);
		expect(byTarget).toEqual({
			"azure/gpt-5.5": true,
			deepseek: true,
			"old-model": false,
		});

		invalidateSpy.mockClear();
		expect((await call("DELETE", `/${override.id}`)).status).toBe(200);
		expect(invalidateSpy).toHaveBeenCalledWith(["routing-overrides"]);
		expect((await call("DELETE", `/${override.id}`)).status).toBe(404);
	});

	it("validates targets and expiry", async () => {
		expect(
			(
				await call("POST", "", {
					scope: "mapping",
					target: "gpt-5.5",
					reason: "x",
				})
			).status,
		).toBe(400);
		expect(
			(
				await call("POST", "", {
					scope: "provider",
					target: "openai",
					reason: "x",
					expiresAt: new Date(Date.now() - 1000).toISOString(),
				})
			).status,
		).toBe(400);
	});
});
