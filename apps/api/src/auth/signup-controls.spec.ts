import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { updatePlatformControls } from "@/lib/platform-controls.js";

import { db, eq, ilike, tables } from "@llmgateway/db";
import { randomInt } from "@llmgateway/shared/random";

import { apiAuth } from "./config.js";

const ORG_ID = "signup-controls-org";
const suffix = Date.now();
const HOUR_MS = 60 * 60 * 1000;

function randomIp(): string {
	return `198.18.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

async function signUp(email: string, ip = randomIp()) {
	return await apiAuth.handler(
		new Request("http://localhost:4002/auth/sign-up/email", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
			body: JSON.stringify({ email, password: "Password123!", name: "User" }),
		}),
	);
}

async function expectBlocked(response: Response) {
	expect(response.status).toBe(403);
	expect((await response.json()).error).toBe("signup_not_available");
}

async function cleanup() {
	await db.delete(tables.systemSetting);
	await db.delete(tables.organizationInvite);
	await db
		.delete(tables.organization)
		.where(eq(tables.organization.id, ORG_ID));
	await db
		.delete(tables.user)
		.where(ilike(tables.user.email, `%-${suffix}@example.com`));
}

describe("signup platform controls", () => {
	const invited = `invited-${suffix}@example.com`;

	beforeEach(async () => {
		process.env.ADMIN_EMAILS = `boss-${suffix}@example.com`;
		await cleanup();
		await db.insert(tables.organization).values({
			id: ORG_ID,
			name: "Signup Controls",
			billingEmail: "billing@example.com",
		});
		await db.insert(tables.organizationInvite).values({
			organizationId: ORG_ID,
			email: invited,
			expiresAt: new Date(Date.now() + HOUR_MS),
		});
	});

	afterEach(async () => {
		await cleanup();
	});

	test("invite-only admits invitations and ADMIN_EMAILS only", async () => {
		await updatePlatformControls({ signupMode: "invite_only" });

		await expectBlocked(await signUp(`stranger-${suffix}@example.com`));
		expect((await signUp(invited)).status).toBe(200);
		expect((await signUp(`boss-${suffix}@example.com`)).status).toBe(200);
	});

	test("invite-only ignores expired invitations", async () => {
		await updatePlatformControls({ signupMode: "invite_only" });
		await db
			.update(tables.organizationInvite)
			.set({ expiresAt: new Date(Date.now() - 1000) });

		await expectBlocked(await signUp(invited));
	});

	test("closed admits ADMIN_EMAILS only", async () => {
		await updatePlatformControls({ signupMode: "closed" });

		await expectBlocked(await signUp(invited));
		expect((await signUp(`BOSS-${suffix}@example.com`)).status).toBe(200);
	});

	test("the user-create hook enforces the mode for every creation path", async () => {
		await updatePlatformControls({ signupMode: "closed" });
		const ctx = await apiAuth.$context;

		await expect(
			ctx.internalAdapter.createUser({
				email: `social-${suffix}@example.com`,
				name: "Social",
				emailVerified: true,
			}),
		).rejects.toThrow("Sign-ups are currently closed.");
	});

	test("blocks signups from listed IPs and CIDR ranges", async () => {
		await updatePlatformControls({
			blockedSignupIps: ["203.0.113.0/24", "2001:db8::/32"],
		});

		await expectBlocked(
			await signUp(`ip-a-${suffix}@example.com`, "203.0.113.9"),
		);
		await expectBlocked(
			await signUp(`ip-b-${suffix}@example.com`, "::ffff:203.0.113.10"),
		);
		await expectBlocked(
			await signUp(`ip-c-${suffix}@example.com`, "2001:db8:1::5"),
		);
		expect(
			(
				await signUp(
					`ip-d-${suffix}@example.com`,
					`203.0.114.${randomInt(1, 254)}`,
				)
			).status,
		).toBe(200);
	});

	test("does not block sign-in", async () => {
		await updatePlatformControls({
			signupMode: "closed",
			blockedSignupIps: ["203.0.113.0/24"],
		});
		const response = await apiAuth.handler(
			new Request("http://localhost:4002/auth/sign-in/email", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Forwarded-For": "203.0.113.9",
				},
				body: JSON.stringify({
					email: `nobody-${suffix}@example.com`,
					password: "Password123!",
				}),
			}),
		);
		expect(response.status).not.toBe(403);
	});
});
