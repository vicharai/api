import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "@/index.js";

import { redisClient } from "@llmgateway/cache";
import { db, tables } from "@llmgateway/db";

import { PUBLIC_CONTACT_RATE_LIMIT } from "./public-contact.js";

const IP = "198.51.100.7";

async function submit(body: Record<string, unknown>, ip = IP) {
	return await app.request("/public/contact", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
		body: JSON.stringify(body),
	});
}

const valid = () => ({
	name: "Ada",
	email: "ada@example.com",
	company: "Analytical Engines",
	topic: "sales",
	size: "11-50",
	message: "We would like volume pricing.",
	clientTimestampMs: Date.now() - 10_000,
});

describe("public contact form", () => {
	beforeEach(async () => {
		await redisClient.del(`${PUBLIC_CONTACT_RATE_LIMIT.keyPrefix}:${IP}`);
		await db.delete(tables.enterpriseContactSubmission);
	});

	afterEach(async () => {
		await redisClient.del(`${PUBLIC_CONTACT_RATE_LIMIT.keyPrefix}:${IP}`);
		await db.delete(tables.enterpriseContactSubmission);
	});

	it("stores a submission without authentication", async () => {
		const res = await submit(valid());
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		const rows = await db.query.enterpriseContactSubmission.findMany();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			name: "Ada",
			email: "ada@example.com",
			country: "unknown",
			size: "11-50",
			message:
				"Topic: Sales\nCompany: Analytical Engines\n\nWe would like volume pricing.",
			ipAddress: IP,
			spamFilterStatus: "pending",
			rejectionReason: null,
		});
	});

	it("silently rejects honeypot and too-fast submissions", async () => {
		const honeypot = await submit({ ...valid(), honeypot: "http://spam" });
		expect(honeypot.status).toBe(200);
		const fast = await submit({ ...valid(), clientTimestampMs: Date.now() });
		expect(fast.status).toBe(200);
		const rows = await db.query.enterpriseContactSubmission.findMany({
			orderBy: { createdAt: "asc" },
		});
		expect(rows.map((r) => [r.spamFilterStatus, r.rejectionReason])).toEqual([
			["rejected", "honeypot"],
			["rejected", "submitted_too_fast"],
		]);
	});

	it("validates input", async () => {
		expect((await submit({ ...valid(), email: "nope" })).status).toBe(400);
		expect((await submit({ ...valid(), message: "" })).status).toBe(400);
		expect((await submit({ ...valid(), size: "huge" })).status).toBe(400);
	});

	it("rate limits by IP", async () => {
		for (let i = 0; i < PUBLIC_CONTACT_RATE_LIMIT.maxRequests; i++) {
			expect((await submit(valid())).status).toBe(200);
		}
		expect((await submit(valid())).status).toBe(429);
	});
});
