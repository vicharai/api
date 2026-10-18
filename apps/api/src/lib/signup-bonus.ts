import {
	and,
	eq,
	getPlatformConfig,
	isNull,
	sql,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

import type { db } from "@llmgateway/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Grants the signup bonus to `organizationId` inside `tx`, at most once per
 * user (claimed via `user.signupBonusGrantedAt`). Only verified users that
 * are not risk-flagged qualify. Returns the granted amount (0 if none).
 */
export async function grantSignupBonus(
	tx: Tx,
	userId: string,
	organizationId: string,
): Promise<number> {
	const amount = (await getPlatformConfig())["billing.signupBonusCredits"];
	if (amount <= 0) {
		return 0;
	}

	const [claimed] = await tx
		.update(tables.user)
		.set({ signupBonusGrantedAt: new Date() })
		.where(
			and(
				eq(tables.user.id, userId),
				isNull(tables.user.signupBonusGrantedAt),
				eq(tables.user.emailVerified, true),
				sql`${tables.user.riskStatus} <> 'flagged'`,
			),
		)
		.returning({ id: tables.user.id });
	if (!claimed) {
		return 0;
	}

	await tx.insert(tables.transaction).values({
		organizationId,
		type: "signup_bonus",
		creditAmount: amount.toString(),
		amount: null,
		currency: "USD",
		status: "completed",
		description: "Signup bonus",
	});
	await tx
		.update(tables.organization)
		.set({ credits: sql`${tables.organization.credits} + ${amount}` })
		.where(eq(tables.organization.id, organizationId));

	logger.info("Granted signup bonus", { userId, organizationId, amount });
	return amount;
}
