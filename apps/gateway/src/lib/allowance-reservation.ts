import { Decimal } from "decimal.js";

import { encodeChatMessages } from "@/chat/tools/tokenizer.js";

import { and, db, eq, organization, sql, tables } from "@llmgateway/db";
import { recordAllowanceReservationEvent } from "@llmgateway/instrumentation";

import type { ProviderModelMapping } from "@llmgateway/models";

/**
 * Pre-dispatch allowance holds.
 *
 * Upstream billing is post-paid: the org balance/counters are read before a
 * request is admitted but only debited when the worker batch-processes the
 * finished log row, so concurrent requests can overspend. A reservation makes
 * the admission check atomic: the hold lands in the same transaction as the
 * allowance guard, so two racing requests can never both reserve the same
 * remaining allowance.
 *
 * Lifecycle of a reservation row (id = the request's final log id):
 *   open — held; grown per additional billable dispatch attempt
 *   settled — the worker replaced the hold with the actual billed cost
 *   orphaned — open for >2h with no log row; the hold STAYS because the
 *     upstream outcome is unknown and may have been billed. Released only by
 *     manual reconciliation, never automatically.
 */

export class InsufficientAllowanceError extends Error {
	public readonly organizationId: string;

	public constructor(organizationId: string) {
		super(`Organization ${organizationId} has insufficient allowance`);
		this.name = "InsufficientAllowanceError";
		this.organizationId = organizationId;
	}
}

// Conservative output-token cap for models that declare no maxOutput. Keeps a
// worst-case hold bounded instead of holding an unbounded completion guess.
const DEFAULT_COMPLETION_TOKEN_CAP = 8192;

// A dev-plan billing cycle is one month: usage counters reset once the stored
// cycle start is older than this.
const DEV_PLAN_CYCLE_RESET = sql`now() - interval '30 days'`;

export interface ReserveAllowanceParams {
	/** The request's final log id; also the reservation row's primary key. */
	reservationId: string;
	organizationId: string;
	apiKeyId: string;
	projectId: string;
	/** USD to add to the org's hold for this dispatch attempt. */
	amountUsd: number;
}

/**
 * Worst-case USD estimate for one upstream dispatch: estimated prompt tokens
 * at the input rate plus the full completion budget at the output rate plus
 * any flat per-request fee. The completion budget is the caller's requested
 * cap (or a conservative default) clamped to the model's declared maxOutput —
 * the same bound the request validation enforces, so the hold never
 * understates what the provider could bill for a single attempt.
 */
export function estimateReservationCost(args: {
	providerMapping: ProviderModelMapping | undefined;
	messages: unknown[];
	maxTokens: number | undefined;
	/** Number of choices requested (n>1 bills each choice's completion). */
	n?: number | undefined;
}): number {
	const mapping = args.providerMapping;
	const inputPrice = parseFloat(mapping?.inputPrice ?? "0");
	const outputPrice = parseFloat(mapping?.outputPrice ?? "0");
	const requestPrice = parseFloat(mapping?.requestPrice ?? "0");
	const perImagePrice = Math.max(
		0,
		...Object.values(mapping?.perImagePrice ?? {}).map((p) =>
			Number.isFinite(parseFloat(p)) ? parseFloat(p) : 0,
		),
	);
	if (
		inputPrice <= 0 &&
		outputPrice <= 0 &&
		requestPrice <= 0 &&
		perImagePrice <= 0
	) {
		return 0;
	}

	const promptTokens = encodeChatMessages(args.messages);
	const completionCap = Math.min(
		args.maxTokens ?? DEFAULT_COMPLETION_TOKEN_CAP,
		mapping?.maxOutput ?? DEFAULT_COMPLETION_TOKEN_CAP,
	);
	const choices = Math.max(1, args.n ?? 1);

	const perChoice = new Decimal(promptTokens)
		.times(inputPrice)
		.plus(new Decimal(completionCap).times(outputPrice))
		.plus(requestPrice)
		.plus(perImagePrice);
	return perChoice.times(choices).toNumber();
}

/**
 * Atomically reserves `amountUsd` of allowance for a dispatch attempt.
 *
 * In one transaction:
 *  1. lazy monthly reset — a dev-plan org whose cycle is older than 30 days
 *     restarts its cycle (used=0, cycleStart=now) before being checked;
 *  2. guarded hold — `organization.reservedCredits += amount` only when the
 *     org's pooled available allowance covers it; the pool mirrors
 *     getAvailableCredits (dev-plan pool + chat-plan pool + regular credits,
 *     the last only for orgs with no dev plan or with PAYG overflow enabled);
 *  3. insert or grow the allowance_reservation row (growth keeps the row
 *     open and raises `reservedAmount`, so retries hold per attempt).
 *
 * Throws InsufficientAllowanceError when the guard rejects (map to HTTP 402).
 */
export async function reserveAllowance(
	params: ReserveAllowanceParams,
): Promise<void> {
	const amount = new Decimal(params.amountUsd);
	if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
		// Nothing to hold: unpriced/custom providers and zero-cost dispatches.
		return;
	}
	const amountStr = amount.toString();

	await db.transaction(async (tx) => {
		await tx
			.update(organization)
			.set({
				devPlanCreditsUsed: "0",
				devPlanBillingCycleStart: new Date(),
				devPlanIncludedResetPassesUsed: 0,
			})
			.where(
				and(
					eq(organization.id, params.organizationId),
					sql`${organization.devPlan} <> 'none'`,
					sql`(${organization.devPlanBillingCycleStart} IS NULL OR ${organization.devPlanBillingCycleStart} < ${DEV_PLAN_CYCLE_RESET})`,
				),
			);

		// The chat-plan pool feeds the same admission guard, so a stale
		// chat-plan cycle must reset here too or it shrinks the reservable
		// allowance forever.
		await tx
			.update(organization)
			.set({
				chatPlanCreditsUsed: "0",
				chatPlanBillingCycleStart: new Date(),
			})
			.where(
				and(
					eq(organization.id, params.organizationId),
					sql`${organization.chatPlan} <> 'none'`,
					sql`(${organization.chatPlanBillingCycleStart} IS NULL OR ${organization.chatPlanBillingCycleStart} < ${DEV_PLAN_CYCLE_RESET})`,
				),
			);

		const guarded = await tx
			.update(organization)
			.set({
				reservedCredits: sql`${organization.reservedCredits} + ${amountStr}`,
			})
			.where(
				and(
					eq(organization.id, params.organizationId),
					sql`${organization.reservedCredits} + ${amountStr} <= (
						CASE WHEN ${organization.devPlan} <> 'none'
							THEN ${organization.devPlanCreditsLimit} - ${organization.devPlanCreditsUsed}
							ELSE 0 END
						+ CASE WHEN ${organization.chatPlan} <> 'none'
							THEN ${organization.chatPlanCreditsLimit} - ${organization.chatPlanCreditsUsed}
							ELSE 0 END
						+ CASE WHEN ${organization.devPlan} = 'none' OR ${organization.devPlanPaygEnabled}
							THEN ${organization.credits}
							ELSE 0 END
					)`,
				),
			)
			.returning({ id: organization.id });

		if (guarded.length === 0) {
			recordAllowanceReservationEvent("reserve_rejected");
			throw new InsufficientAllowanceError(params.organizationId);
		}

		const existing = await tx
			.select({ id: tables.allowanceReservation.id })
			.from(tables.allowanceReservation)
			.where(eq(tables.allowanceReservation.id, params.reservationId));

		await tx
			.insert(tables.allowanceReservation)
			.values({
				id: params.reservationId,
				organizationId: params.organizationId,
				apiKeyId: params.apiKeyId,
				projectId: params.projectId,
				reservedAmount: amountStr,
			})
			.onConflictDoUpdate({
				target: tables.allowanceReservation.id,
				set: {
					reservedAmount: sql`${tables.allowanceReservation.reservedAmount} + ${amountStr}`,
					updatedAt: new Date(),
				},
				// Growth only applies to a still-open row: a settled/orphaned row
				// means the outcome is already decided and its accounting closed.
				setWhere: eq(tables.allowanceReservation.state, "open"),
			});

		recordAllowanceReservationEvent(
			existing.length === 0 ? "reserved" : "grown",
		);
	});
}

/**
 * Releases a hold when the request that took it is known to have been
 * rejected locally before any upstream dispatch — the only case where
 * refunding is safe. Once a dispatch may have happened the row must settle
 * through the worker (or flag orphaned), never auto-release, because the
 * upstream may still have billed the attempt.
 */
export async function releaseAllowance(reservationId: string): Promise<void> {
	await db.transaction(async (tx) => {
		const [released] = await tx
			.update(tables.allowanceReservation)
			.set({
				state: "settled",
				settledAmount: "0",
				settledAt: new Date(),
				lastError: "released before dispatch",
			})
			.where(
				and(
					eq(tables.allowanceReservation.id, reservationId),
					eq(tables.allowanceReservation.state, "open"),
				),
			)
			.returning({
				organizationId: tables.allowanceReservation.organizationId,
				reservedAmount: tables.allowanceReservation.reservedAmount,
			});

		if (!released) {
			return;
		}

		await tx
			.update(organization)
			.set({
				reservedCredits: sql`GREATEST(${organization.reservedCredits} - ${released.reservedAmount}, 0)`,
			})
			.where(eq(organization.id, released.organizationId));

		recordAllowanceReservationEvent("released_pre_dispatch");
	});
}
