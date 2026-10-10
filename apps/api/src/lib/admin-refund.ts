import { logAuditEvent } from "@vichar/audit";
import { Decimal } from "decimal.js";
import { HTTPException } from "hono/http-exception";

import { getCreditsProductId, getDodo } from "@/billing/dodo.js";

import { and, db, eq, inArray, tables } from "@llmgateway/db";

type OrganizationRow = typeof tables.organization.$inferSelect;
type TransactionRow = typeof tables.transaction.$inferSelect;

/**
 * Purchase types an administrator may refund from the admin panel. Mirrors the
 * types `handleChargeRefunded` knows how to book back, minus the chat-plan ones
 * (a DevPass org never holds a chat plan): anything outside this list would be
 * refunded at Dodo with no matching ledger row on our side.
 */
export const ADMIN_REFUNDABLE_TX_TYPES = [
	"dev_plan_start",
	"dev_plan_renewal",
	"dev_plan_upgrade",
	"dev_plan_reset_pass",
	// PAYG overflow top-ups are DevPass purchases too.
	"credit_topup",
	// Legacy pre-rename DevPass rows, still the only payment record for the
	// earliest subscribers.
	"subscription_start",
] as const;

export type AdminRefundableType = (typeof ADMIN_REFUNDABLE_TX_TYPES)[number];

export function isAdminRefundableType(
	type: string,
): type is AdminRefundableType {
	return (ADMIN_REFUNDABLE_TX_TYPES as readonly string[]).includes(type);
}

export type AdminRefundIneligibilityReason =
	"unsupported_type" | "not_completed" | "no_payment" | "fully_refunded";

export interface AdminRefundability {
	refundable: boolean;
	reason: AdminRefundIneligibilityReason | null;
	/** Amount already refunded against this payment, in dollars. */
	refundedAmount: string;
	/** What is still refundable, in dollars. */
	refundableAmount: string;
}

/**
 * Whether an administrator can still refund a payment, and how much of it is
 * left. Deliberately looser than the customer-facing rules in `self-refund.ts`:
 * no time window, no usage threshold, no owner check — support decides, the
 * only hard requirements are a completed charge we can reach at Dodo and
 * money left to give back.
 */
export function computeAdminRefundability({
	transaction,
	refundedAmount,
}: {
	transaction: Pick<
		TransactionRow,
		"type" | "status" | "amount" | "dodoPaymentId"
	>;
	refundedAmount: Decimal;
}): AdminRefundability {
	const amount = new Decimal(transaction.amount ?? 0);
	const remaining = Decimal.max(0, amount.minus(refundedAmount));
	const base = {
		refundedAmount: refundedAmount.toFixed(2),
		refundableAmount: remaining.toFixed(2),
	};

	if (!isAdminRefundableType(transaction.type)) {
		return { refundable: false, reason: "unsupported_type", ...base };
	}
	if (transaction.status !== "completed") {
		return { refundable: false, reason: "not_completed", ...base };
	}
	if (!amount.gt(0) || !transaction.dodoPaymentId) {
		return { refundable: false, reason: "no_payment", ...base };
	}
	if (!remaining.gt(0)) {
		return { refundable: false, reason: "fully_refunded", ...base };
	}
	return { refundable: true, reason: null, ...base };
}

/**
 * Total already refunded per payment, keyed by the refunded transaction's id.
 * `credit_refund` rows carry the refunded dollar amount as a positive `amount`
 * and point back at the original purchase via `relatedTransactionId`.
 */
export async function sumRefundsByTransaction(
	organizationId: string,
	transactionIds: string[],
): Promise<Map<string, Decimal>> {
	const totals = new Map<string, Decimal>();
	if (transactionIds.length === 0) {
		return totals;
	}

	const rows = await db
		.select({
			relatedTransactionId: tables.transaction.relatedTransactionId,
			amount: tables.transaction.amount,
		})
		.from(tables.transaction)
		.where(
			and(
				eq(tables.transaction.organizationId, organizationId),
				eq(tables.transaction.type, "credit_refund"),
				eq(tables.transaction.status, "completed"),
				inArray(tables.transaction.relatedTransactionId, transactionIds),
			),
		);

	for (const row of rows) {
		if (!row.relatedTransactionId) {
			continue;
		}
		const current = totals.get(row.relatedTransactionId) ?? new Decimal(0);
		totals.set(row.relatedTransactionId, current.plus(row.amount ?? 0));
	}

	return totals;
}

export const ADMIN_REFUND_REASONS = [
	"requested_by_customer",
	"duplicate",
	"fraudulent",
] as const;

export type AdminRefundReason = (typeof ADMIN_REFUND_REASONS)[number];

/**
 * Issue a Dodo refund on behalf of a customer and record a pending
 * credit_refund row; the refund.succeeded webhook completes it and deducts
 * the credits. `amount` refunds only part of the payment; omitting it
 * refunds the rest.
 */
export async function executeAdminRefund({
	organization,
	transaction,
	adminUserId,
	amount,
	refundedAmount,
	reason,
	comment,
}: {
	organization: OrganizationRow;
	transaction: TransactionRow;
	adminUserId: string;
	amount?: number;
	refundedAmount: Decimal;
	reason: AdminRefundReason;
	comment?: string;
}): Promise<{ dodoRefundId: string; amount: string }> {
	const eligibility = computeAdminRefundability({
		transaction,
		refundedAmount,
	});
	if (!eligibility.refundable) {
		throw new HTTPException(400, {
			message: `This payment cannot be refunded: ${eligibility.reason}`,
		});
	}

	const remaining = new Decimal(eligibility.refundableAmount);
	const refundAmount = amount === undefined ? remaining : new Decimal(amount);
	if (!refundAmount.gt(0) || refundAmount.gt(remaining)) {
		throw new HTTPException(400, {
			message: `Refund amount must be between $0.01 and $${remaining.toFixed(2)}`,
		});
	}

	if (!transaction.dodoPaymentId) {
		throw new HTTPException(400, {
			message: "No refundable payment found for this transaction",
		});
	}

	// Omitting items refunds the whole payment; a partial refund scopes the
	// amount to the credits product.
	const partial = refundAmount.lt(remaining);
	const refund = await getDodo().refunds.create({
		payment_id: transaction.dodoPaymentId,
		...(partial
			? {
					items: [
						{
							item_id: getCreditsProductId(),
							amount: refundAmount.times(100).toDecimalPlaces(0).toNumber(),
						},
					],
				}
			: {}),
		reason: comment ?? reason,
		metadata: {
			organizationId: organization.id,
			transactionId: transaction.id,
		},
	});

	// Pending until the refund.succeeded webhook applies the credit deduction.
	const creditsPerDollar =
		Number(transaction.creditAmount) / Number(transaction.amount);
	await db.insert(tables.transaction).values({
		organizationId: organization.id,
		type: "credit_refund",
		amount: `-${refundAmount.toFixed(2)}`,
		creditAmount: refundAmount.times(creditsPerDollar).negated().toFixed(2),
		currency: transaction.currency ?? "USD",
		status: "pending",
		dodoRefundId: refund.refund_id,
		relatedTransactionId: transaction.id,
		description: "Admin refund",
		refundReason: reason,
	});

	await logAuditEvent({
		organizationId: organization.id,
		userId: adminUserId,
		action: "payment.admin_refund",
		resourceType: "payment",
		resourceId: transaction.id,
		metadata: {
			dodoRefundId: refund.refund_id,
			transactionType: transaction.type,
			originalAmount: transaction.amount,
			refundAmount: refundAmount.toFixed(2),
			reason,
			comment,
		},
	});

	return { dodoRefundId: refund.refund_id, amount: refundAmount.toFixed(2) };
}
