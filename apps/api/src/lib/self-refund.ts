import { z } from "@hono/zod-openapi";
import { logAuditEvent } from "@vichar/audit";
import { Decimal } from "decimal.js";
import { HTTPException } from "hono/http-exception";

import { getDodo } from "@/billing/dodo.js";

import { db, tables } from "@llmgateway/db";
import {
	isRefundFeedbackComplete,
	REFUND_COMMENTS_MAX_LENGTH,
	REFUND_REASONS,
	SELF_REFUND_USAGE_PERCENT,
	SELF_REFUND_WINDOW_DAYS,
} from "@llmgateway/shared";

import type { RefundFeedbackKind } from "@llmgateway/db";
import type { RefundReason } from "@llmgateway/shared";

type OrganizationRow = typeof tables.organization.$inferSelect;
type TransactionRow = typeof tables.transaction.$inferSelect;

const SELF_REFUND_WINDOW_MS = SELF_REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Reset Passes get a shorter window than plan payments: an unused pass can be
// returned within its own window, after which the purchase is final.

// Usage at or above the threshold share of the purchased credits denies the
// self-refund; equivalently, repeat top-ups require the balance to still cover
// the remainder.
const SELF_REFUND_USAGE_THRESHOLD = new Decimal(SELF_REFUND_USAGE_PERCENT).div(
	100,
);
const SELF_REFUND_BALANCE_FLOOR = new Decimal(1).minus(
	SELF_REFUND_USAGE_THRESHOLD,
);

function dec(value: string | number | null | undefined): Decimal {
	return new Decimal(value ?? 0);
}

function usageExceedsThreshold(used: Decimal, total: Decimal): boolean {
	return used.gte(total.times(SELF_REFUND_USAGE_THRESHOLD));
}

export type SelfRefundIneligibilityReason =
	| "unsupported_type"
	| "not_completed"
	| "already_refunded"
	| "window_expired"
	| "not_owner"
	| "not_latest_purchase"
	| "plan_inactive"
	| "usage_exceeded"
	| "pass_already_used";

export interface SelfRefundEligibility {
	eligible: boolean;
	reason?: SelfRefundIneligibilityReason;
}

export const SELF_REFUNDABLE_TYPES = ["credit_topup"] as const;

export type SelfRefundableType = (typeof SELF_REFUNDABLE_TYPES)[number];

export function isSelfRefundCandidateType(
	type: string,
): type is SelfRefundableType {
	return (SELF_REFUNDABLE_TYPES as readonly string[]).includes(type);
}

/**
 * Whether a billing-history row should surface a refund control at all. Every
 * customer charge gets one — disabled, with a reason, when it cannot actually
 * be refunded — so a payment never silently lacks the button. Refund rows and
 * zero-amount lifecycle bookkeeping (plan cancelled/resumed/ended, gifts,
 * rewards) get nothing.
 */
export function hasRefundAction(transaction: TransactionRow): boolean {
	return transaction.type !== "credit_refund" && dec(transaction.amount).gt(0);
}

const REFUND_FEEDBACK_KIND_BY_TYPE: Record<
	SelfRefundableType,
	RefundFeedbackKind
> = {
	credit_topup: "credits",
};

export function refundFeedbackKindForType(type: string): RefundFeedbackKind {
	return isSelfRefundCandidateType(type)
		? REFUND_FEEDBACK_KIND_BY_TYPE[type]
		: "credits";
}

/**
 * Body both self-refund endpoints take: a required category so every refund
 * yields comparable data, plus optional freeform detail.
 */
export const refundFeedbackBodySchema = z.object({
	reason: z.enum(REFUND_REASONS).openapi({
		description: "Closest category for why the customer wants a refund",
	}),
	comments: z
		.string()
		.trim()
		.max(REFUND_COMMENTS_MAX_LENGTH)
		.optional()
		.openapi({
			description:
				"Freeform detail. Optional, except when reason is 'other' — that category carries no signal on its own.",
		}),
});

function ineligible(
	reason: SelfRefundIneligibilityReason,
): SelfRefundEligibility {
	return { eligible: false, reason };
}

function isCompleted(t: TransactionRow): boolean {
	return t.status === "completed";
}

function latestOf(rows: TransactionRow[]): TransactionRow | undefined {
	return rows.reduce<TransactionRow | undefined>(
		(latest, row) =>
			!latest || row.createdAt > latest.createdAt ? row : latest,
		undefined,
	);
}

/**
 * Total credits ever consumed by the org, reconstructed from the pooled
 * balance: every credit grant and drain besides gateway usage is recorded
 * either as a transaction row (topups, manual payments, gifts, refunds,
 * end-user bonuses) or on
 * the org row itself (referral earnings, which are only ever incremented), so
 * usage = grants − balance. Referral-bonus reversals aren't reconstructed,
 * which only over-counts usage — erring toward denying the refund.
 */
function computeUsedCredits(
	organization: OrganizationRow,
	transactions: TransactionRow[],
): Decimal {
	let granted = dec(organization.referralEarnings);
	for (const t of transactions) {
		if (!isCompleted(t)) {
			continue;
		}
		if (
			t.type === "credit_topup" ||
			t.type === "credit_gift" ||
			t.type === "credit_manual_payment" ||
			t.type === "credit_refund"
		) {
			// credit_refund rows carry a negative creditAmount, netting out the
			// refunded grant.
			granted = granted.plus(dec(t.creditAmount));
		} else if (t.type === "end_user_bonus") {
			// End-user signup bonuses are funded from the org balance.
			granted = granted.minus(dec(t.amount));
		}
	}
	return granted.minus(dec(organization.credits));
}

function checkCreditTopupEligibility(
	organization: OrganizationRow,
	transactions: TransactionRow[],
	transaction: TransactionRow,
): SelfRefundEligibility {
	const creditAmount = dec(transaction.creditAmount);
	if (!creditAmount.gt(0)) {
		return ineligible("unsupported_type");
	}

	const completedTopups = transactions.filter(
		(t) => t.type === "credit_topup" && isCompleted(t),
	);

	if (completedTopups.length <= 1) {
		// First-ever top-up: all consumption counts, including gift/signup
		// credits, so free credits can't be burned and the paid top-up refunded
		// in full afterwards.
		const usedCredits = computeUsedCredits(organization, transactions);
		if (usageExceedsThreshold(usedCredits, creditAmount)) {
			return ineligible("usage_exceeded");
		}
		return { eligible: true };
	}

	// Repeat top-ups: only the most recent purchase is refundable, and only
	// while the remaining balance still covers at least 90% of it (the
	// remaining pool is attributed to the newest purchase first).
	const latestTopup = latestOf(completedTopups);
	if (latestTopup?.id !== transaction.id) {
		return ineligible("not_latest_purchase");
	}
	if (
		dec(organization.credits).lt(creditAmount.times(SELF_REFUND_BALANCE_FLOOR))
	) {
		return ineligible("usage_exceeded");
	}
	return { eligible: true };
}

/**
 * Decide whether a transaction can be self-refunded by the org owner.
 * `transactions` must be the org's complete transaction list (any order); the
 * same list the transactions endpoints already fetch.
 */
export function computeSelfRefundEligibility({
	organization,
	role,
	transactions,
	transaction,
	now = new Date(),
}: {
	organization: OrganizationRow;
	role: string | null | undefined;
	transactions: TransactionRow[];
	transaction: TransactionRow;
	now?: Date;
}): SelfRefundEligibility {
	if (!isSelfRefundCandidateType(transaction.type)) {
		return ineligible("unsupported_type");
	}
	if (!isCompleted(transaction)) {
		return ineligible("not_completed");
	}
	if (!dec(transaction.amount).gt(0) || !transaction.dodoPaymentId) {
		return ineligible("unsupported_type");
	}
	if (
		transactions.some(
			(t) =>
				t.type === "credit_refund" && t.relatedTransactionId === transaction.id,
		)
	) {
		return ineligible("already_refunded");
	}
	const windowMs = SELF_REFUND_WINDOW_MS;
	if (now.getTime() - new Date(transaction.createdAt).getTime() > windowMs) {
		return ineligible("window_expired");
	}
	if (role !== "owner") {
		return ineligible("not_owner");
	}

	return checkCreditTopupEligibility(organization, transactions, transaction);
}

/**
 * Issue the Dodo refund for an already-eligibility-checked transaction and
 * record a pending credit_refund row; the refund.succeeded webhook completes
 * it and deducts the credits.
 */
export async function executeSelfRefund({
	organization,
	transaction,
	userId,
	reason,
	comments,
}: {
	organization: OrganizationRow;
	transaction: TransactionRow;
	userId: string;
	reason: RefundReason;
	comments?: string;
}): Promise<{ dodoRefundId: string }> {
	if (!isRefundFeedbackComplete(reason, comments)) {
		throw new HTTPException(400, {
			message: "Tell us what happened so we know what to fix.",
		});
	}

	await db
		.insert(tables.refundFeedback)
		.values({
			organizationId: organization.id,
			userId,
			transactionId: transaction.id,
			kind: refundFeedbackKindForType(transaction.type),
			reason,
			comments: comments ?? null,
		})
		.onConflictDoUpdate({
			target: tables.refundFeedback.transactionId,
			set: { reason, comments: comments ?? null, userId },
		});

	if (!transaction.dodoPaymentId) {
		throw new HTTPException(400, {
			message: "No refundable payment found for this transaction",
		});
	}

	const refund = await getDodo().refunds.create({
		payment_id: transaction.dodoPaymentId,
		reason: "Customer-requested refund",
		metadata: {
			organizationId: organization.id,
			transactionId: transaction.id,
		},
	});

	// Pending until the refund.succeeded webhook applies the credit deduction.
	await db.insert(tables.transaction).values({
		organizationId: organization.id,
		type: "credit_refund",
		amount: `-${transaction.amount}`,
		creditAmount: `-${transaction.creditAmount}`,
		currency: transaction.currency ?? "USD",
		status: "pending",
		dodoRefundId: refund.refund_id,
		relatedTransactionId: transaction.id,
		description: `Refund of credit top-up`,
		refundReason: reason,
	});

	await logAuditEvent({
		organizationId: organization.id,
		userId,
		action: "payment.self_refund",
		resourceType: "payment",
		resourceId: transaction.id,
		metadata: {
			dodoRefundId: refund.refund_id,
			transactionType: transaction.type,
			amount: transaction.amount,
		},
	});

	return { dodoRefundId: refund.refund_id };
}
