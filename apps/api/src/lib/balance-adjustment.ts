import { logAuditEvent } from "@vichar/audit";
import { HTTPException } from "hono/http-exception";

import { and, db, eq, sql, tables } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

export interface BalanceAdjustment {
	organizationId: string;
	amount: number;
	reason: string;
	allowNegative: boolean;
	admin: { id: string; email: string };
	relatedTransactionId?: string;
}

/**
 * Adds `amount` (either sign) to an organization's credits as a
 * `credit_adjustment` transaction. The balance check and update are one
 * conditional UPDATE, so concurrent deductions cannot overdraw the balance
 * unless `allowNegative` is set.
 */
export async function applyBalanceAdjustment({
	organizationId,
	amount,
	reason,
	allowNegative,
	admin,
	relatedTransactionId,
}: BalanceAdjustment): Promise<{ balance: number; transactionId: string }> {
	const result = await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(tables.organization)
			.set({ credits: sql`${tables.organization.credits} + ${amount}` })
			.where(
				and(
					eq(tables.organization.id, organizationId),
					sql`${tables.organization.status} IS DISTINCT FROM 'deleted'`,
					allowNegative
						? undefined
						: sql`${tables.organization.credits} + ${amount} >= 0`,
				),
			)
			.returning({ credits: tables.organization.credits });

		if (!updated) {
			const org = await tx.query.organization.findFirst({
				where: { id: { eq: organizationId } },
				columns: { status: true, credits: true },
			});
			if (!org || org.status === "deleted") {
				throw new HTTPException(404, { message: "Organization not found" });
			}
			throw new HTTPException(409, {
				message: `Adjustment would make the balance negative (current balance ${Number(org.credits).toFixed(2)})`,
			});
		}

		const [transaction] = await tx
			.insert(tables.transaction)
			.values({
				organizationId,
				type: "credit_adjustment",
				creditAmount: amount.toString(),
				amount: null,
				currency: "USD",
				status: "completed",
				description: `Balance adjustment by administrator: ${reason}`,
				relatedTransactionId: relatedTransactionId ?? null,
			})
			.returning({ id: tables.transaction.id });

		return {
			balance: Number(updated.credits),
			transactionId: transaction.id,
		};
	});

	await logAuditEvent({
		organizationId,
		userId: admin.id,
		action: "credits.adjust",
		resourceType: "transaction",
		resourceId: result.transactionId,
		metadata: { amount, reason, allowNegative, balance: result.balance },
	});
	logger.info(
		`Admin ${admin.email} adjusted balance of org ${organizationId} by ${amount}: ${reason}`,
	);

	return result;
}
