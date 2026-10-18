import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { deleteAll } from "@/testing.js";

import {
	db,
	eq,
	getPlatformConfig,
	mergeStoredPlatformConfig,
	tables,
} from "@llmgateway/db";

import { getOrCreateDefaultOrganization } from "./default-org.js";

async function seedUser(
	id: string,
	values: Partial<typeof tables.user.$inferInsert> = {},
) {
	await db.insert(tables.user).values({
		id,
		email: `${id}@example.com`,
		emailVerified: true,
		...values,
	});
	return { id, email: `${id}@example.com` };
}

async function bonusRows(orgId: string) {
	return await db.query.transaction.findMany({
		where: { organizationId: { eq: orgId }, type: "signup_bonus" },
	});
}

describe("signup bonus", () => {
	const previousEnv = process.env.SIGNUP_BONUS_CREDITS;

	beforeEach(async () => {
		await deleteAll();
		process.env.SIGNUP_BONUS_CREDITS = "5";
	});

	afterEach(async () => {
		if (previousEnv === undefined) {
			delete process.env.SIGNUP_BONUS_CREDITS;
		} else {
			process.env.SIGNUP_BONUS_CREDITS = previousEnv;
		}
		await deleteAll();
	});

	test("reads platform config before the env fallback", async () => {
		const bonus = async () =>
			(await getPlatformConfig())["billing.signupBonusCredits"];
		expect(await bonus()).toBe(5);
		await mergeStoredPlatformConfig({ "billing.signupBonusCredits": 7.5 });
		expect(await bonus()).toBe(7.5);
		delete process.env.SIGNUP_BONUS_CREDITS;
		await deleteAll();
		expect(await bonus()).toBe(0);
	});

	test("grants the bonus with a verified user's first organization, once", async () => {
		const user = await seedUser("bonus-user");
		const org = await getOrCreateDefaultOrganization(user);
		expect(Number(org.credits)).toBe(5);
		expect(await bonusRows(org.id)).toHaveLength(1);

		// Repeat calls return the same org without a second grant.
		const same = await getOrCreateDefaultOrganization(user);
		expect(same.id).toBe(org.id);

		// Even after the org is deleted, a replacement org gets no bonus.
		await db
			.update(tables.organization)
			.set({ status: "deleted" })
			.where(eq(tables.organization.id, org.id));
		const replacement = await getOrCreateDefaultOrganization(user);
		expect(replacement.id).not.toBe(org.id);
		expect(Number(replacement.credits)).toBe(0);
		expect(await bonusRows(replacement.id)).toHaveLength(0);

		const stored = await db.query.user.findFirst({
			where: { id: { eq: user.id } },
		});
		expect(stored?.signupBonusGrantedAt).toBeInstanceOf(Date);
	});

	test("skips unverified and risk-flagged users", async () => {
		const unverified = await seedUser("bonus-unverified", {
			emailVerified: false,
		});
		const flagged = await seedUser("bonus-flagged", { riskStatus: "flagged" });
		for (const user of [unverified, flagged]) {
			const org = await getOrCreateDefaultOrganization(user);
			expect(Number(org.credits)).toBe(0);
			expect(await bonusRows(org.id)).toHaveLength(0);
		}
	});

	test("concurrent first-org creation grants a single bonus", async () => {
		const user = await seedUser("bonus-race");
		await Promise.allSettled(
			Array.from({ length: 4 }, () => getOrCreateDefaultOrganization(user)),
		);
		const bonuses = await db.query.transaction.findMany({
			where: { type: "signup_bonus" },
		});
		expect(bonuses).toHaveLength(1);
	});
});
