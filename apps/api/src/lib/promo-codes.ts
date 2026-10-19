import { randomInt } from "node:crypto";

import { logAuditEvent } from "@vichar/audit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { and, count, db, eq, sql, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

export const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;

// Codes are stored upper-case and matched case-insensitively.
export function normalizePromoCode(code: string): string {
	return code.trim().toUpperCase();
}

export const promoCodeInputSchema = z
	.string()
	.transform(normalizePromoCode)
	.refine(
		(code) => PROMO_CODE_PATTERN.test(code),
		"Use 3-40 letters, digits, '-' or '_'",
	);

// No 0/O or 1/I so codes survive being read aloud or retyped.
const GENERATED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePromoCode(length = 10): string {
	let code = "";
	for (let i = 0; i < length; i++) {
		code += GENERATED_ALPHABET[randomInt(GENERATED_ALPHABET.length)];
	}
	return code;
}

/**
 * Redeems a promo code for an organization. The promo row is locked for the
 * whole transaction, so the global and per-org limits hold under concurrent
 * redemptions.
 */
export async function redeemPromoCode({
	code,
	organizationId,
	userId,
}: {
	code: string;
	organizationId: string;
	userId: string;
}): Promise<{ amount: number; balance: number }> {
	const normalized = normalizePromoCode(code);

	const result = await db.transaction(async (tx) => {
		const [promo] = await tx
			.select()
			.from(tables.promoCode)
			.where(eq(tables.promoCode.code, normalized))
			.for("update");
		if (!promo?.active) {
			throw new HTTPException(404, { message: "Promo code not found" });
		}
		if (promo.expiresAt && promo.expiresAt.getTime() <= Date.now()) {
			throw new HTTPException(409, { message: "This promo code has expired" });
		}
		if (
			promo.maxRedemptions !== null &&
			promo.redemptionCount >= promo.maxRedemptions
		) {
			throw new HTTPException(409, {
				message: "This promo code has been fully redeemed",
			});
		}

		const [orgRedemptions] = await tx
			.select({ value: count() })
			.from(tables.promoCodeRedemption)
			.where(
				and(
					eq(tables.promoCodeRedemption.promoCodeId, promo.id),
					eq(tables.promoCodeRedemption.organizationId, organizationId),
				),
			);
		if ((orgRedemptions?.value ?? 0) >= promo.perOrgLimit) {
			throw new HTTPException(409, {
				message: "This organization has already redeemed this promo code",
			});
		}

		const [transaction] = await tx
			.insert(tables.transaction)
			.values({
				organizationId,
				type: "promo_credit",
				creditAmount: promo.amount,
				amount: null,
				currency: "USD",
				status: "completed",
				description: `Promo code ${promo.code}`,
			})
			.returning({ id: tables.transaction.id });

		await tx.insert(tables.promoCodeRedemption).values({
			promoCodeId: promo.id,
			organizationId,
			userId,
			amount: promo.amount,
			transactionId: transaction.id,
		});
		await tx
			.update(tables.promoCode)
			.set({ redemptionCount: sql`${tables.promoCode.redemptionCount} + 1` })
			.where(eq(tables.promoCode.id, promo.id));
		const [org] = await tx
			.update(tables.organization)
			.set({
				credits: sql`${tables.organization.credits} + ${promo.amount}`,
			})
			.where(eq(tables.organization.id, organizationId))
			.returning({ credits: tables.organization.credits });

		return {
			promoCodeId: promo.id,
			code: promo.code,
			amount: Number(promo.amount),
			balance: Number(org.credits),
			transactionId: transaction.id,
		};
	});

	await logAuditEvent({
		organizationId,
		userId,
		action: "promo_code.redeem",
		resourceType: "transaction",
		resourceId: result.transactionId,
		metadata: {
			promoCodeId: result.promoCodeId,
			code: result.code,
			amount: result.amount,
		},
	});
	logger.info("Promo code redeemed", {
		organizationId,
		code: result.code,
		amount: result.amount,
	});

	return { amount: result.amount, balance: result.balance };
}
