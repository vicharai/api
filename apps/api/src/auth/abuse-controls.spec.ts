import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { app } from "@/index.js";

import {
	clearPlatformConfigMemo,
	db,
	ilike,
	mergeStoredPlatformConfig,
	tables,
} from "@llmgateway/db";
import { randomInt } from "@llmgateway/shared/random";

import { apiAuth } from "./config.js";

const suffix = Date.now();
const PASSWORD = "Password123!";

function randomIp(): string {
	return `198.18.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

async function authRequest(path: string, body: unknown, ip = randomIp()) {
	return await apiAuth.handler(
		new Request(`http://localhost:4002/auth${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
			body: JSON.stringify(body),
		}),
	);
}

async function signUp(email: string, ip?: string) {
	return await authRequest(
		"/sign-up/email",
		{ email, password: PASSWORD, name: "User" },
		ip,
	);
}

async function cleanup() {
	await db.delete(tables.systemSetting);
	clearPlatformConfigMemo();
	await db.delete(tables.user).where(ilike(tables.user.email, `%-${suffix}@%`));
}

describe("abuse controls at signup and login", () => {
	const originalAdminEmails = process.env.ADMIN_EMAILS;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = `boss-${suffix}@example.com`;
		await cleanup();
	});

	afterEach(async () => {
		process.env.ADMIN_EMAILS = originalAdminEmails;
		await cleanup();
	});

	test("disposable emails are blocked only when enabled, minus the allowlist", async () => {
		await mergeStoredPlatformConfig({ "abuse.blockDisposableEmails": false });
		expect((await signUp(`off-${suffix}@mailinator.com`)).status).toBe(200);

		await mergeStoredPlatformConfig({ "abuse.blockDisposableEmails": true });
		const blocked = await signUp(`on-${suffix}@mailinator.com`);
		expect(blocked.status).toBe(400);
		expect(await blocked.json()).toMatchObject({ error: "invalid_email" });
		expect((await signUp(`ok-${suffix}@example.com`)).status).toBe(200);

		await mergeStoredPlatformConfig({
			"abuse.disposableEmailAllowlist": ["mailinator.com"],
		});
		expect((await signUp(`listed-${suffix}@mailinator.com`)).status).toBe(200);
	});

	test("the user-create hook blocks disposable emails on every path", async () => {
		await mergeStoredPlatformConfig({ "abuse.blockDisposableEmails": true });
		const ctx = await apiAuth.$context;
		await expect(
			ctx.internalAdapter.createUser({
				email: `social-${suffix}@mailinator.com`,
				name: "Social",
				emailVerified: true,
			}),
		).rejects.toThrow("Disposable email addresses are not allowed");
	});

	test("blocked IPs cannot sign up, sign in or use an existing session", async () => {
		const email = `member-${suffix}@example.com`;
		const created = await signUp(email);
		expect(created.status).toBe(200);
		const cookie = created.headers.get("set-cookie")!;

		await mergeStoredPlatformConfig({
			"abuse.blockedIps": ["203.0.113.0/24"],
		});

		const signUpBlocked = await signUp(
			`blocked-${suffix}@example.com`,
			"203.0.113.5",
		);
		expect(signUpBlocked.status).toBe(403);
		expect(await signUpBlocked.json()).toMatchObject({
			error: "access_blocked",
		});

		const signIn = await authRequest(
			"/sign-in/email",
			{ email, password: PASSWORD },
			"::ffff:203.0.113.6",
		);
		expect(signIn.status).toBe(403);
		expect(
			(await authRequest("/sign-in/email", { email, password: PASSWORD }))
				.status,
		).toBe(200);

		const me = (ip: string) =>
			app.request("/user/me", {
				headers: { Cookie: cookie, "X-Forwarded-For": ip },
			});
		expect((await me("203.0.113.7")).status).toBe(403);
		expect((await me(randomIp())).status).toBe(200);
	});

	test("ADMIN_EMAILS owners are exempt from the IP blocklist", async () => {
		const email = `boss-${suffix}@example.com`;
		expect((await signUp(email)).status).toBe(200);
		await mergeStoredPlatformConfig({ "abuse.blockedIps": ["203.0.113.0/24"] });
		expect(
			(
				await authRequest(
					"/sign-in/email",
					{ email, password: PASSWORD },
					"203.0.113.8",
				)
			).status,
		).toBe(200);
	});
});
