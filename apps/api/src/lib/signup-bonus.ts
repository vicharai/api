import { and, db, eq, isNull, sql, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const PLATFORM_CONFIG_SETTING_ID = "platform_config";

function parseAmount(value: unknown): number | null {
	const amount = typeof value === "string" ? Number(value) : value;
	return typeof amount === "number" && Number.isFinite(amount) && amount >= 0
		? amount
		: null;
}

/**
 * Credits granted with a user's first organization: platform config
 * (`signupBonusCredits`), then SIGNUP_BONUS_CREDITS, then 0.
 */
export async function getSignupBonusCredits(): Promise<number> {
	const row = await db.query.systemSetting.findFirst({
		where: { id: { eq: PLATFORM_CONFIG_SETTING_ID } },
		columns: { value: true },
	});
	if (row?.value) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(row.value);
		} catch (error) {
			logger.error("Invalid platform_config JSON", error as Error);
		}
		if (
			parsed &&
			typeof parsed === "object" &&
			"signupBonusCredits" in parsed
		) {
			const fromDb = parseAmount(parsed.signupBonusCredits);
			if (fromDb !== null) {
				return fromDb;
			}
		}
	}
	return parseAmount(process.env.SIGNUP_BONUS_CREDITS) ?? 0;
}

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
	const amount = await getSignupBonusCredits();
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
