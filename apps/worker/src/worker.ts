import { Decimal } from "decimal.js";
import DodoPayments from "dodopayments";
import { z } from "zod";

import {
	checkAndReserveTopUp,
	flushLimitHits,
	releaseTopUpReservation,
} from "@llmgateway/actions";
import {
	ackClaimedMessages,
	claimFromQueue,
	closeRedisClient,
	closeStorageRedisClient,
	LOG_QUEUE,
	redriveStaleInflight,
} from "@llmgateway/cache";
import {
	addApiKeyPeriodDuration,
	and,
	apiKey,
	cdb,
	closeDatabase,
	db,
	eq,
	inArray,
	invalidateOrganizationsCache,
	isNotNull,
	isApiKeyPeriodLimitConfigured,
	log,
	type LogInsertData,
	lt,
	organization,
	resolveVerifiedOrgRecipient,
	sql,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import { hasErrorCode } from "@llmgateway/models";
import {
	calculateFees,
	getRemainingPremiumWeeklyAllowance,
	isCreditTopUpAmountInRange,
	isLoungeSource,
	isPremiumUsedModel,
	isPremiumWeekExpired,
} from "@llmgateway/shared";
import {
	getLogRetentionCutoff,
	LOG_RETENTION_DAYS,
} from "@llmgateway/shared/log-retention";

import { posthog } from "./posthog.js";
import { processNextBenchmarkRun } from "./services/benchmark-runs.js";
import {
	runFollowUpEmailsLoop,
	sendLowBalanceEmail,
} from "./services/follow-up-emails.js";
import {
	GLOBAL_STATS_INTERVAL_SECONDS,
	processClosedHours,
} from "./services/global-stats-aggregator.js";
import { processNextModelVerification } from "./services/model-verifications.js";
import { processNotifications } from "./services/notifications.js";
import {
	PROJECT_STATS_REFRESH_INTERVAL_SECONDS,
	refreshProjectHourlyStats,
} from "./services/project-stats-aggregator.js";
import {
	backfillHistoryIfNeeded,
	backfillHourlyHistoryIfNeeded,
	calculateAggregatedStatistics,
	calculateCurrentMinuteHistory,
	calculateHourlyHistory,
	calculateMinutelyHistory,
} from "./services/stats-calculator.js";
import { syncProvidersAndModels } from "./services/sync-models.js";
import {
	processPendingVideoJobs,
	processPendingWebhookDeliveries,
} from "./services/video-jobs.js";
import {
	interruptibleSleep,
	isStopRequested,
	requestStop,
	resetShutdown,
} from "./shutdown.js";

import type { DevPlanTier } from "@llmgateway/shared";

// Configuration for current minute history calculation interval (defaults to 5 seconds)
const CURRENT_MINUTE_HISTORY_INTERVAL_SECONDS =
	Number(process.env.CURRENT_MINUTE_HISTORY_INTERVAL_SECONDS) || 5;

let _dodo: DodoPayments | null = null;

function getDodo(): DodoPayments {
	if (!_dodo) {
		const bearerToken = process.env.DODO_PAYMENTS_API_KEY;
		if (!bearerToken) {
			throw new Error("DODO_PAYMENTS_API_KEY is required for auto top-ups");
		}
		_dodo = new DodoPayments({
			bearerToken,
			environment:
				process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
					? "live_mode"
					: "test_mode",
		});
	}
	return _dodo;
}

const AUTO_TOPUP_LOCK_KEY = "auto_topup_check";
const CREDIT_PROCESSING_LOCK_KEY = "credit_processing";
const DATA_RETENTION_LOCK_KEY = "data_retention_cleanup";
const MODEL_HISTORY_RETENTION_LOCK_KEY = "model_history_retention_cleanup";
const API_KEY_EXPIRATION_LOCK_KEY = "api_key_expiration";
const LIMIT_HIT_FLUSH_LOCK_KEY = "limit_hit_flush";
const LOCK_DURATION_MINUTES = 5;
// crosses below this (USD) on a usage debit.

// Configuration for batch processing
const LOG_QUEUE_BATCH_SIZE = Number(process.env.LOG_QUEUE_BATCH_SIZE) || 100;
// Number of log-drain loops to run concurrently in-process. Each loop pulls an
// independent batch (LPOP is atomic, so there is no double-processing) and
// inserts on its own pool connection, multiplying drain throughput without
// adding worker replicas. Bounded by the DB pool size and Postgres write
// capacity.
const LOG_QUEUE_CONCURRENCY = Math.max(
	1,
	Number(process.env.LOG_QUEUE_CONCURRENCY) || 4,
);
const CREDIT_BATCH_SIZE = Number(process.env.CREDIT_BATCH_SIZE) || 100;
// 1s: this interval is the floor of the spend-to-balance settlement gap the
// credit gates operate on, so it directly bounds how far a burst can
// overshoot a balance. Idle cost is one lock round-trip per tick.
const BATCH_PROCESSING_INTERVAL_SECONDS =
	Number(process.env.CREDIT_BATCH_INTERVAL) || 1;
const VIDEO_JOB_POLL_INTERVAL_SECONDS =
	Number(process.env.VIDEO_JOB_POLL_INTERVAL_SECONDS) || 5;
const VIDEO_WEBHOOK_POLL_INTERVAL_SECONDS =
	Number(process.env.VIDEO_WEBHOOK_POLL_INTERVAL_SECONDS) || 5;
const configuredModelVerificationPollIntervalSeconds = Number(
	process.env.MODEL_VERIFICATION_POLL_INTERVAL_SECONDS,
);
const MODEL_VERIFICATION_POLL_INTERVAL_SECONDS =
	Number.isFinite(configuredModelVerificationPollIntervalSeconds) &&
	configuredModelVerificationPollIntervalSeconds > 0
		? configuredModelVerificationPollIntervalSeconds
		: 2;
const BENCHMARK_RUN_POLL_INTERVAL_SECONDS =
	Number(process.env.BENCHMARK_RUN_POLL_INTERVAL_SECONDS) || 10;

interface ApiKeyUsageEvent {
	cost: Decimal;
	createdAt: Date;
}

type ApiKeyPeriodState = Pick<
	typeof apiKey.$inferSelect,
	| "currentPeriodStartedAt"
	| "currentPeriodUsage"
	| "periodUsageLimit"
	| "periodUsageDurationValue"
	| "periodUsageDurationUnit"
>;

interface ApiKeyUsageUpdate {
	hasPeriodUsageUpdate: boolean;
	currentPeriodStartedAt: Date | null;
	currentPeriodUsage: string;
	totalUsageCost: Decimal;
}

function buildApiKeyUsageUpdate(
	apiKeyState: ApiKeyPeriodState,
	events: ApiKeyUsageEvent[],
): ApiKeyUsageUpdate {
	const totalUsageCost = events.reduce(
		(total, event) => total.plus(event.cost),
		new Decimal(0),
	);

	if (!isApiKeyPeriodLimitConfigured(apiKeyState)) {
		return {
			hasPeriodUsageUpdate: false,
			currentPeriodStartedAt: apiKeyState.currentPeriodStartedAt,
			currentPeriodUsage: String(apiKeyState.currentPeriodUsage ?? "0"),
			totalUsageCost,
		};
	}

	let currentPeriodStartedAt = apiKeyState.currentPeriodStartedAt;
	let currentPeriodUsage = new Decimal(apiKeyState.currentPeriodUsage ?? "0");

	for (const event of events) {
		if (
			currentPeriodStartedAt === null ||
			addApiKeyPeriodDuration(
				currentPeriodStartedAt,
				apiKeyState.periodUsageDurationValue,
				apiKeyState.periodUsageDurationUnit,
			) <= event.createdAt
		) {
			currentPeriodStartedAt = event.createdAt;
			currentPeriodUsage = event.cost;
			continue;
		}

		currentPeriodUsage = currentPeriodUsage.plus(event.cost);
	}

	return {
		hasPeriodUsageUpdate: true,
		currentPeriodStartedAt,
		currentPeriodUsage: currentPeriodUsage.toString(),
		totalUsageCost,
	};
}

const schema = z.object({
	id: z.string(),
	created_at: z.date(),
	request_id: z.string(),
	organization_id: z.string(),
	project_id: z.string(),
	cost: z.number().nullable(),
	billing_cost: z.string().nullable(),
	cached: z.boolean(),
	api_key_id: z.string(),
	provider_key_id: z.string().nullable(),
	end_user_session_id: z.string().nullable(),
	end_customer_wallet_id: z.string().nullable(),
	// A deleted project's row left-joins to null — the log must still be
	// billed, not poison the whole batch.
	project_mode: z.enum(["api-keys", "credits", "hybrid"]).nullable(),
	used_mode: z.enum(["api-keys", "credits"]),
	duration: z.number(),
	requested_model: z.string(),
	requested_provider: z.string().nullable(),
	used_model: z.string(),
	used_model_mapping: z.string().nullable(),
	used_provider: z.string(),
	response_size: z.number(),
	hasError: z.boolean().nullable(),
	data_storage_cost: z.string().nullable(),
	prompt_tokens: z.string().nullable(),
	completion_tokens: z.string().nullable(),
	total_tokens: z.string().nullable(),
	reasoning_tokens: z.string().nullable(),
	cached_tokens: z.string().nullable(),
	cache_write_tokens: z.string().nullable(),
	input_cost: z.number().nullable(),
	output_cost: z.number().nullable(),
	cached_input_cost: z.number().nullable(),
	cache_write_input_cost: z.number().nullable(),
	estimated_cost: z.boolean().nullable(),
	error_details: z
		.object({
			statusCode: z.number(),
			statusText: z.string(),
			responseText: z.string(),
			cause: z.string().optional(),
		})
		.nullable(),
	trace_id: z.string().nullable(),
	unified_finish_reason: z.string().nullable(),
	source: z.string().nullable(),
});

export async function acquireLock(key: string): Promise<boolean> {
	// eslint-disable-next-line no-mixed-operators
	const lockExpiry = new Date(Date.now() - LOCK_DURATION_MINUTES * 60 * 1000);

	try {
		await db.transaction(async (tx) => {
			// First, delete any expired locks with the same key
			await tx
				.delete(tables.lock)
				.where(
					and(eq(tables.lock.key, key), lt(tables.lock.updatedAt, lockExpiry)),
				);

			// Then try to insert the new lock
			try {
				await tx.insert(tables.lock).values({
					key,
				});
			} catch (insertError) {
				// If the insert failed due to a unique constraint violation within the transaction,
				// another process holds the lock - throw a special error to be caught outside
				const actualError = (insertError as any)?.cause ?? insertError;
				if (hasErrorCode(actualError) && actualError.code === "23505") {
					throw new Error("LOCK_EXISTS");
				}
				throw insertError;
			}
		});

		return true;
	} catch (error) {
		// If we threw our special error, return false
		if (error instanceof Error && error.message === "LOCK_EXISTS") {
			return false;
		}
		// Re-throw unexpected errors so they can be handled upstream
		throw error;
	}
}

async function releaseLock(key: string): Promise<void> {
	await db.delete(tables.lock).where(eq(tables.lock.key, key));
}

const AUTO_TOPUP_MAX_FAILURES = 3;

async function recordAutoTopUpFailure(org: {
	id: string;
	autoTopUpFailureCount?: number | null;
}): Promise<void> {
	const failures = (org.autoTopUpFailureCount ?? 0) + 1;
	await db
		.update(tables.organization)
		.set({
			autoTopUpFailureCount: failures,
			autoTopUpLastFailureAt: new Date(),
			...(failures >= AUTO_TOPUP_MAX_FAILURES
				? { autoTopUpEnabled: false }
				: {}),
		})
		.where(eq(tables.organization.id, org.id));
	if (failures >= AUTO_TOPUP_MAX_FAILURES) {
		logger.warn(
			`Disabled auto top-up for organization ${org.id} after ${failures} consecutive failures`,
		);
	}
}

/**
 * Whether auto top-up will actually refill this org. Enabled alone is not
 * enough: risk-flagged and DevPass-without-PAYG orgs are skipped by
 * `processAutoTopUp`, and an org in payment-failure backoff may never get
 * charged before it runs dry.
 */
export function isAutoTopUpEffective(org: {
	autoTopUpEnabled: boolean;
	riskFlagged?: boolean | null;
	kind?: string | null;
	devPlanPaygEnabled?: boolean | null;
	dodoAutoTopUpSubscriptionId?: string | null;
}): boolean {
	if (!org.autoTopUpEnabled) {
		return false;
	}
	if (org.riskFlagged) {
		return false;
	}
	if (org.kind === "devpass" && !org.devPlanPaygEnabled) {
		return false;
	}
	return Boolean(org.dodoAutoTopUpSubscriptionId);
}

export async function processAutoTopUp(): Promise<void> {
	const lockAcquired = await acquireLock(AUTO_TOPUP_LOCK_KEY);
	if (!lockAcquired) {
		return;
	}

	try {
		const orgsNeedingTopUp = await db.query.organization.findMany({
			where: {
				autoTopUpEnabled: {
					eq: true,
				},
			},
		});

		// Filter organizations that need top-up based on credits vs threshold
		const filteredOrgs = orgsNeedingTopUp.filter((org) => {
			// An organization flagged as high risk cannot buy credits manually, so
			// it must not keep charging a card automatically either.
			if (org.riskFlagged) {
				return false;
			}
			// DevPass orgs can only spend credits with the pay-as-you-go
			// overflow opt-in; without it auto-reload would buy credits the
			// org cannot use.
			if (org.kind === "devpass" && !org.devPlanPaygEnabled) {
				return false;
			}
			const credits = Number(org.credits || 0);
			const threshold = Number(org.autoTopUpThreshold ?? 10);
			return credits < threshold;
		});

		for (const org of filteredOrgs) {
			if (isStopRequested()) {
				break;
			}
			try {
				// Check if there's a recent pending transaction
				const recentTransaction = await db.query.transaction.findFirst({
					where: {
						organizationId: {
							eq: org.id,
						},
						type: {
							eq: "credit_topup",
						},
					},
					orderBy: {
						createdAt: "desc",
					},
				});

				// A pending auto top-up from the last 30 minutes means a charge
				// is still in flight; skip rather than double-charge.
				if (recentTransaction) {
					const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
					if (
						recentTransaction.createdAt > thirtyMinutesAgo &&
						recentTransaction.status === "pending" &&
						recentTransaction.description === "Auto top-up"
					) {
						logger.info(
							`Skipping auto top-up for organization ${org.id}: pending transaction exists`,
						);
						continue;
					}
				}

				// Exponential backoff after consecutive auto top-up failures:
				// 1h, 2h, 4h, 8h, 16h, 24h (capped).
				if (
					org.autoTopUpLastFailureAt &&
					(org.autoTopUpFailureCount ?? 0) > 0
				) {
					const failureCount = org.autoTopUpFailureCount ?? 0;
					const backoffHours = Math.min(Math.pow(2, failureCount - 1), 24);
					const backoffMs = backoffHours * 60 * 60 * 1000;
					const nextRetryTime = new Date(
						org.autoTopUpLastFailureAt.getTime() + backoffMs,
					);

					if (new Date() < nextRetryTime) {
						logger.info(
							`Skipping auto top-up for organization ${org.id}: in backoff period (${failureCount} failures, next retry at ${nextRetryTime.toISOString()})`,
						);
						continue;
					}
				}

				if (!org.dodoAutoTopUpSubscriptionId) {
					logger.info(
						`No auto top-up mandate for organization ${org.id}, skipping`,
					);
					continue;
				}

				const topUpAmount = Number(org.autoTopUpAmount ?? "10");

				if (!isCreditTopUpAmountInRange(topUpAmount)) {
					logger.error(
						`Skipping auto top-up for organization ${org.id}: invalid amount ${org.autoTopUpAmount}`,
					);
					continue;
				}

				const feeBreakdown = calculateFees({ amount: topUpAmount });

				// The org row was read once at the start of the pass. Re-read and
				// re-authorize immediately before money moves: a mandate that was
				// cancelled since stops the charge before the pending transaction
				// is ever created.
				const freshOrg = await db.query.organization.findFirst({
					where: {
						id: {
							eq: org.id,
						},
					},
				});
				if (
					!freshOrg ||
					!freshOrg.autoTopUpEnabled ||
					!freshOrg.dodoAutoTopUpSubscriptionId ||
					Number(freshOrg.credits || 0) >=
						Number(freshOrg.autoTopUpThreshold ?? 10)
				) {
					logger.info(
						`Skipping auto top-up for organization ${org.id}: settings changed mid-pass`,
					);
					continue;
				}

				// Tier-based top-up velocity cap, same as the manual path.
				const velocity = await checkAndReserveTopUp({
					org: freshOrg,
					amountUsd: feeBreakdown.totalAmount,
				});
				if (!velocity.allowed) {
					logger.info(
						`Skipping auto top-up for organization ${org.id}: top-up velocity cap reached`,
						{
							capUsd: velocity.capUsd,
							usedUsd: velocity.usedUsd,
							attemptedUsd: feeBreakdown.totalAmount,
						},
					);
					continue;
				}

				let pendingTransaction;
				try {
					pendingTransaction = await db
						.insert(tables.transaction)
						.values({
							organizationId: org.id,
							type: "credit_topup",
							creditAmount: feeBreakdown.baseAmount.toString(),
							amount: feeBreakdown.totalAmount.toString(),
							currency: "USD",
							status: "pending",
							description: "Auto top-up",
						})
						.returning()
						.then((rows) => rows[0]);
				} finally {
					// The pending row now counts in the gate's DB window sum.
					await releaseTopUpReservation(org.id, feeBreakdown.totalAmount);
				}

				try {
					await getDodo().subscriptions.charge(
						freshOrg.dodoAutoTopUpSubscriptionId,
						{
							product_price: Math.round(feeBreakdown.totalAmount * 100),
							product_description: "Vichar credits auto top-up",
							metadata: {
								organizationId: org.id,
								transactionId: pendingTransaction.id,
								purpose: "auto_top_up",
							},
						},
					);
				} catch (chargeError) {
					const status = (chargeError as { status?: number } | undefined)
						?.status;
					// 409 = a charge is already pending on the mandate; drop our
					// placeholder row and let it settle via the existing webhook.
					if (status === 409) {
						logger.info(
							`Auto top-up already in flight for organization ${org.id}; skipping`,
						);
						await db
							.delete(tables.transaction)
							.where(eq(tables.transaction.id, pendingTransaction.id));
					} else {
						logger.error(
							`Auto top-up charge failed for organization ${org.id}`,
							chargeError instanceof Error
								? chargeError
								: new Error(String(chargeError)),
						);
						await db
							.update(tables.transaction)
							.set({
								status: "failed",
								description: `Auto top-up failed: ${chargeError instanceof Error ? chargeError.message : "Unknown error"}`,
							})
							.where(eq(tables.transaction.id, pendingTransaction.id));
						await recordAutoTopUpFailure(org);
					}
				}
			} catch (error) {
				logger.error(
					`Error processing auto top-up for organization ${org.id}`,
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}
	} finally {
		await releaseLock(AUTO_TOPUP_LOCK_KEY);
	}
}

export async function cleanupExpiredLogData(): Promise<void> {
	// Check if data retention cleanup is enabled
	if (process.env.ENABLE_DATA_RETENTION_CLEANUP !== "true") {
		logger.info(
			"Data retention cleanup is disabled. Set ENABLE_DATA_RETENTION_CLEANUP=true to enable.",
		);
		return;
	}

	const lockAcquired = await acquireLock(DATA_RETENTION_LOCK_KEY);
	if (!lockAcquired) {
		return;
	}

	try {
		logger.info("Starting data retention cleanup...");

		const CLEANUP_BATCH_SIZE = 10000;
		const cutoffDate = getLogRetentionCutoff();

		let totalCleaned = 0;

		// Process all organizations in batches (no plan distinction)
		let hasMoreRecords = true;
		while (hasMoreRecords && !isStopRequested()) {
			const batchResult = await db.transaction(async (tx) => {
				// Hint the planner to prefer index scans for this transaction.
				// Without this, PostgreSQL's default random_page_cost=4 causes it to
				// choose a sequential scan over the partial index, even though the index
				// is far more efficient (scanning ~500 rows vs ~11.5M rows).
				// SET LOCAL resets automatically when the transaction commits.
				await tx.execute(sql`SET LOCAL random_page_cost = 1.1`);

				// Find IDs of records to clean up (with LIMIT for batching)
				// IMPORTANT: Use raw SQL for the boolean condition to match the partial index exactly
				// (parameterized values like $20 prevent PostgreSQL from using partial indexes)
				const recordsToClean = await tx
					.select({ id: log.id })
					.from(log)
					.where(
						and(
							lt(log.createdAt, cutoffDate),
							sql`${log.dataRetentionCleanedUp} = false`,
						),
					)
					.limit(CLEANUP_BATCH_SIZE)
					.for("update", { skipLocked: true });

				if (recordsToClean.length === 0) {
					return 0;
				}

				const idsToClean = recordsToClean.map((r) => r.id);

				// Clean up the batch
				await tx
					.update(log)
					.set({
						messages: null,
						content: null,
						reasoningContent: null,
						tools: null,
						toolChoice: null,
						toolResults: null,
						customHeaders: null,
						rawRequest: null,
						rawResponse: null,
						upstreamRequest: null,
						upstreamResponse: null,
						userAgent: null,
						gatewayContentFilterResponse: null,
						responsesApiData: null,
						routingMetadata: null,
						dataRetentionCleanedUp: true,
					})
					// Use `= ANY($1)` with a single array parameter instead of
					// `inArray()`, which expands to `IN ($1, $2, ...)` with a
					// variable number of binds per batch. A varying placeholder
					// count makes pg_stat_statements fingerprint every batch size
					// as a distinct query, so one logical operation shows up as
					// thousands of individual queries. The array form keeps the
					// query text constant.
					.where(sql`${log.id} = ANY(${sql.param(idsToClean)}::text[])`);

				return recordsToClean.length;
			});

			totalCleaned += batchResult;

			if (batchResult < CLEANUP_BATCH_SIZE) {
				hasMoreRecords = false;
			}

			if (batchResult > 0) {
				logger.info(`Cleaned up ${batchResult} logs in batch`);
			}
		}

		if (totalCleaned > 0) {
			logger.info(
				`Total cleaned up verbose data from ${totalCleaned} logs (older than ${LOG_RETENTION_DAYS} days)`,
			);
		}

		logger.info("Data retention cleanup completed successfully");
	} catch (error) {
		logger.error(
			"Error during data retention cleanup",
			error instanceof Error ? error : new Error(String(error)),
		);
	} finally {
		await releaseLock(DATA_RETENTION_LOCK_KEY);
	}
}

// Delete minute-level model/mapping history rows older than the retention
// window. These tables gain one row per active model (and per mapping) every
// minute and otherwise grow unbounded. The hourly rollups
// (model_history_hourly, model_provider_mapping_history_hourly) are kept
// forever and now serve every window beyond 24h (7d/30d/90d public stats), so
// the only readers of the minute tables are short windows (<=24h). 30 days
// leaves a comfortable buffer over the largest minute-level reader.
const MODEL_HISTORY_RETENTION_DAYS = 30;
const MODEL_HISTORY_CLEANUP_BATCH_SIZE = 10000;
// Cap the work per run (per table) so a single cleanup reliably finishes well
// within the lock TTL (LOCK_DURATION_MINUTES), even on a large initial backlog.
// The loop runs hourly, so any remaining rows are drained over subsequent runs.
// At steady state (~640 rows/min across both tables, i.e. a handful of batches
// per hour) this cap is never approached; it only bounds the initial backlog
// drain. Each table gets its own budget so neither starves the other.
const MODEL_HISTORY_MAX_BATCHES_PER_RUN = 50;

async function cleanupModelHistoryTable(
	table: typeof tables.modelHistory | typeof tables.modelProviderMappingHistory,
	cutoffDate: Date,
	maxBatches: number,
): Promise<{ deleted: number; batches: number }> {
	let totalDeleted = 0;
	let batches = 0;
	let hasMoreRecords = true;

	while (hasMoreRecords && batches < maxBatches && !isStopRequested()) {
		const batchDeleted = await db.transaction(async (tx) => {
			// Prefer the minuteTimestamp index over a sequential scan; SET LOCAL
			// resets automatically when the transaction commits.
			await tx.execute(sql`SET LOCAL random_page_cost = 1.1`);

			const recordsToDelete = await tx
				.select({ id: table.id })
				.from(table)
				.where(lt(table.minuteTimestamp, cutoffDate))
				.limit(MODEL_HISTORY_CLEANUP_BATCH_SIZE)
				.for("update", { skipLocked: true });

			if (recordsToDelete.length === 0) {
				return 0;
			}

			const idsToDelete = recordsToDelete.map((r) => r.id);

			// Use `= ANY($1)` with a single array param instead of inArray()'s
			// variable-length `IN (...)`, so pg_stat_statements fingerprints
			// every batch identically.
			await tx
				.delete(table)
				.where(sql`${table.id} = ANY(${sql.param(idsToDelete)}::text[])`);

			return recordsToDelete.length;
		});

		totalDeleted += batchDeleted;
		batches++;

		if (batchDeleted < MODEL_HISTORY_CLEANUP_BATCH_SIZE) {
			hasMoreRecords = false;
		}
	}

	return { deleted: totalDeleted, batches };
}

export async function cleanupExpiredModelHistory(): Promise<void> {
	if (process.env.ENABLE_DATA_RETENTION_CLEANUP !== "true") {
		return;
	}

	const lockAcquired = await acquireLock(MODEL_HISTORY_RETENTION_LOCK_KEY);
	if (!lockAcquired) {
		return;
	}

	try {
		logger.info("Starting model history retention cleanup...");

		const cutoffDate = new Date(
			Date.now() - MODEL_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000, // eslint-disable-line no-mixed-operators
		);

		const mapping = await cleanupModelHistoryTable(
			tables.modelProviderMappingHistory,
			cutoffDate,
			MODEL_HISTORY_MAX_BATCHES_PER_RUN,
		);
		const model = await cleanupModelHistoryTable(
			tables.modelHistory,
			cutoffDate,
			MODEL_HISTORY_MAX_BATCHES_PER_RUN,
		);

		const mappingDeleted = mapping.deleted;
		const modelDeleted = model.deleted;

		if (mappingDeleted > 0 || modelDeleted > 0) {
			logger.info(
				`Model history retention cleanup deleted ${mappingDeleted} model_provider_mapping_history and ${modelDeleted} model_history rows (older than ${MODEL_HISTORY_RETENTION_DAYS} days)`,
			);
		}

		logger.info("Model history retention cleanup completed successfully");
	} catch (error) {
		logger.error(
			"Error during model history retention cleanup",
			error instanceof Error ? error : new Error(String(error)),
		);
	} finally {
		await releaseLock(MODEL_HISTORY_RETENTION_LOCK_KEY);
	}
}

export async function batchProcessLogs(): Promise<number> {
	const lockAcquired = await acquireLock(CREDIT_PROCESSING_LOCK_KEY);
	if (!lockAcquired) {
		return 0;
	}

	let processedCount = 0;
	const deductedOrgIds: string[] = [];
	// Every org whose row was debited this batch (plan pools or regular
	// credits). Their tagged cache entries are evicted after commit so the
	// gateway's credit gates see the new balance immediately.
	const settledOrgIds: string[] = [];
	// Provider keys (BYOK or managed) whose accumulated usage crossed their
	// spend limit this batch — deactivated after the transaction commits.
	let overLimitProviderKeyIds: string[] = [];
	try {
		// Only batches that actually commit count toward processedCount, so a
		// rolled-back transaction leaves it at 0 and the loop backs off instead
		// of hot-looping on a failing batch.
		processedCount = await db.transaction(async (tx) => {
			// Get unprocessed logs with row-level locking to prevent concurrent processing
			const rows = await tx
				.select({
					id: log.id,
					created_at: log.createdAt,
					request_id: log.requestId,
					organization_id: log.organizationId,
					project_id: log.projectId,
					cost: log.cost,
					billing_cost: log.billingCost,
					cached: log.cached,
					api_key_id: log.apiKeyId,
					provider_key_id: log.providerKeyId,
					end_user_session_id: log.endUserSessionId,
					end_customer_wallet_id: log.endCustomerWalletId,
					project_mode: tables.project.mode,
					used_mode: log.usedMode,
					duration: log.duration,
					requested_model: log.requestedModel,
					requested_provider: log.requestedProvider,
					used_model: log.usedModel,
					used_model_mapping: log.usedModelMapping,
					used_provider: log.usedProvider,
					response_size: log.responseSize,
					hasError: log.hasError,
					data_storage_cost: log.dataStorageCost,
					prompt_tokens: log.promptTokens,
					completion_tokens: log.completionTokens,
					total_tokens: log.totalTokens,
					reasoning_tokens: log.reasoningTokens,
					cached_tokens: log.cachedTokens,
					cache_write_tokens: log.cacheWriteTokens,
					input_cost: log.inputCost,
					output_cost: log.outputCost,
					cached_input_cost: log.cachedInputCost,
					cache_write_input_cost: log.cacheWriteInputCost,
					estimated_cost: log.estimatedCost,
					error_details: log.errorDetails,
					trace_id: log.traceId,
					unified_finish_reason: log.unifiedFinishReason,
					source: log.source,
				})
				.from(log)
				.leftJoin(tables.project, eq(tables.project.id, log.projectId))
				.where(sql`${log.processedAt} IS NULL`)
				.orderBy(sql`${log.createdAt} ASC`)
				.limit(CREDIT_BATCH_SIZE)
				.for("update", { of: [log], skipLocked: true });
			const unprocessedLogs = { rows };

			if (unprocessedLogs.rows.length === 0) {
				return 0;
			}

			logger.info(
				`Processing ${unprocessedLogs.rows.length} logs for credit deduction and API key usage`,
			);

			// Group logs by organization and api key to calculate total costs.
			// We split per-org costs into a chat bucket and a default bucket so
			// the deduction step below can prefer chat-plan credits for requests
			// originating from Lounge (matching how users mentally account for
			// their plans), and dev-plan credits everywhere else.
			// Use Decimal.js to avoid floating point rounding errors.
			interface OrgCostBuckets {
				chat: Decimal;
				other: Decimal;
				chatPremium: Decimal;
				otherPremium: Decimal;
			}
			const orgCosts = new Map<string, OrgCostBuckets>();
			const apiKeyEvents = new Map<string, ApiKeyUsageEvent[]>();
			const logIds: string[] = [];
			// Upstream provider spend attributed per provider_key row (BYOK and
			// managed alike). Uses the raw `cost` column — what the credential
			// spends at the provider — not billingCost, which carries plan/margin
			// adjustments on what the org pays us.
			const providerKeyCosts = new Map<string, Decimal>();
			// What each log row actually billed the org (plan pools, regular
			// credits and storage charges alike). Used to settle open allowance
			// reservations at actual cost rather than the held estimate.
			const rowOrgBilledUsd = new Map<string, Decimal>();

			// Accepts both the current and the pre-move Lounge host: logs written
			// before the domain move are still queued here, and rewriting them is
			// not an option.
			const isChatSource = isLoungeSource;

			for (const raw of unprocessedLogs.rows) {
				const row = schema.parse(raw);

				// Log each processed log with JSON format
				logger.info("processing log", {
					kind: "log-process",
					status: row.hasError ? "error" : row.cached ? "cached" : "success",
					logId: row.id,
					createdAt: row.created_at,
					requestId: row.request_id,
					organizationId: row.organization_id,
					projectId: row.project_id,
					cost: row.cost,
					inputCost: row.input_cost,
					outputCost: row.output_cost,
					cachedInputCost: row.cached_input_cost,
					cacheWriteInputCost: row.cache_write_input_cost,
					estimatedCost: row.estimated_cost,
					error: !!row.hasError,
					cached: row.cached,
					apiKeyId: row.api_key_id,
					endUserSessionId: row.end_user_session_id,
					projectMode: row.project_mode,
					usedMode: row.used_mode,
					duration: row.duration,
					requestedModel: row.requested_model,
					requestedProvider: row.requested_provider,
					usedModel: row.used_model,
					usedModelMapping: row.used_model_mapping,
					usedProvider: row.used_provider,
					responseSize: row.response_size,
					promptTokens: row.prompt_tokens,
					completionTokens: row.completion_tokens,
					totalTokens: row.total_tokens,
					reasoningTokens: row.reasoning_tokens,
					cachedTokens: row.cached_tokens,
					cacheWriteTokens: row.cache_write_tokens,
					errorDetails: row.error_details,
					traceId: row.trace_id,
					unifiedFinishReason: row.unified_finish_reason,
				});

				// Cached responses never hit the upstream, so they don't spend
				// against the credential. Runs before the wallet `continue` below so
				// end-user-wallet traffic still attributes provider spend.
				if (
					row.provider_key_id &&
					row.cost !== null &&
					row.cost > 0 &&
					!row.cached
				) {
					providerKeyCosts.set(
						row.provider_key_id,
						(providerKeyCosts.get(row.provider_key_id) ?? new Decimal(0)).plus(
							new Decimal(row.cost),
						),
					);
				}

				const sourceBucket = isChatSource(row.source) ? "chat" : "other";

				const addToBucket = (amount: Decimal, premium: boolean) => {
					const existing = orgCosts.get(row.organization_id) ?? {
						chat: new Decimal(0),
						other: new Decimal(0),
						chatPremium: new Decimal(0),
						otherPremium: new Decimal(0),
					};
					existing[sourceBucket] = existing[sourceBucket].plus(amount);
					if (premium) {
						const premiumBucket =
							sourceBucket === "chat" ? "chatPremium" : "otherPremium";
						existing[premiumBucket] = existing[premiumBucket].plus(amount);
					}
					orgCosts.set(row.organization_id, existing);
				};

				// The org-billed share of this row, for allowance reservation
				// settlement below. Wallet-funded inference debits the wallet, not
				// the org, so it never counts here; storage still does.
				let orgBilledForRow = new Decimal(0);

				// Data retention storage is billed separately from inference (log.cost
				// never includes it), so it is deducted from org credits for every
				// mode: credits, api-keys (BYOK) and wallet-backed end-user traffic
				// alike — and also when inference itself was free or zeroed (e.g.
				// unbilled refusals keep their storage cost).
				if (row.data_storage_cost) {
					const storageCost = new Decimal(row.data_storage_cost);
					if (storageCost.greaterThan(0)) {
						addToBucket(storageCost, false);
						orgBilledForRow = orgBilledForRow.plus(storageCost);
					}
				}

				// Prefer the exact decimal billingCost (realtime and other
				// decimal-billed rows) over the legacy float cost column.
				const effectiveCost =
					row.billing_cost !== null
						? new Decimal(row.billing_cost)
						: row.cost !== null
							? new Decimal(row.cost)
							: null;

				if (effectiveCost && effectiveCost.greaterThan(0) && !row.cached) {
					const apiKeyCost = effectiveCost;
					const usageEvent = {
						cost: apiKeyCost,
						createdAt: row.created_at,
					};
					const existingEvents = apiKeyEvents.get(row.api_key_id) ?? [];
					existingEvents.push(usageEvent);
					apiKeyEvents.set(row.api_key_id, existingEvents);

					// Inference cost: credits mode deducts the full cost from org
					// credits; api-keys mode pays the provider directly (BYOK), so
					// only the storage cost above is billed.
					if (row.used_mode === "credits") {
						addToBucket(
							apiKeyCost,
							Boolean(row.used_model && isPremiumUsedModel(row.used_model)),
						);
						orgBilledForRow = orgBilledForRow.plus(apiKeyCost);
					}
				}

				rowOrgBilledUsd.set(row.id, orgBilledForRow);
				logIds.push(row.id);
			}

			// Batch update organization credits within the same transaction.
			// Also calculate referral earnings (1% of spent credits).
			//
			// Deduction order is source-aware:
			//   • Lounge requests → chat plan → dev plan → regular
			//   • everything else → dev plan → chat plan → regular
			// The non-preferred plan acts as a fallback if the preferred plan's
			// cycle credits are exhausted, so a single org with both plans gets
			// the same total spend ceiling regardless of source.
			const referralEarnings = new Map<string, Decimal>();

			interface PlanPool {
				kind: "chat" | "dev";
				remaining: Decimal;
				premiumCreditsUsed?: Decimal;
				premiumWeekStart?: Date | null;
			}

			const deductFromPlanPool = async (
				orgId: string,
				pool: PlanPool,
				amount: Decimal,
				premiumAmount: Decimal,
			) => {
				const amountStr = amount.toString();
				if (pool.kind === "chat") {
					await tx
						.update(organization)
						.set({
							chatPlanCreditsUsed: sql`${organization.chatPlanCreditsUsed} + ${amountStr}`,
						})
						.where(eq(organization.id, orgId));
					logger.debug(
						`Deducted ${amountStr} chat plan credits from organization ${orgId}`,
					);
				} else {
					const weekExpired = isPremiumWeekExpired(pool.premiumWeekStart);
					const now = new Date();
					const premiumAmountStr = premiumAmount.toString();

					if (premiumAmount.greaterThan(0)) {
						if (weekExpired) {
							await tx
								.update(organization)
								.set({
									devPlanCreditsUsed: sql`${organization.devPlanCreditsUsed} + ${amountStr}`,
									devPlanPremiumCreditsUsed: premiumAmountStr,
									devPlanPremiumWeekStart: now,
								})
								.where(eq(organization.id, orgId));
							pool.premiumCreditsUsed = premiumAmount;
							pool.premiumWeekStart = now;
						} else {
							await tx
								.update(organization)
								.set({
									devPlanCreditsUsed: sql`${organization.devPlanCreditsUsed} + ${amountStr}`,
									devPlanPremiumCreditsUsed: sql`${organization.devPlanPremiumCreditsUsed} + ${premiumAmountStr}`,
								})
								.where(eq(organization.id, orgId));
							pool.premiumCreditsUsed = (
								pool.premiumCreditsUsed ?? new Decimal(0)
							).plus(premiumAmount);
						}
					} else if (weekExpired && pool.premiumWeekStart) {
						await tx
							.update(organization)
							.set({
								devPlanCreditsUsed: sql`${organization.devPlanCreditsUsed} + ${amountStr}`,
								devPlanPremiumCreditsUsed: "0",
								devPlanPremiumWeekStart: now,
							})
							.where(eq(organization.id, orgId));
						pool.premiumCreditsUsed = new Decimal(0);
						pool.premiumWeekStart = now;
					} else {
						await tx
							.update(organization)
							.set({
								devPlanCreditsUsed: sql`${organization.devPlanCreditsUsed} + ${amountStr}`,
							})
							.where(eq(organization.id, orgId));
					}
					logger.debug(
						`Deducted ${amountStr} dev plan credits from organization ${orgId}`,
					);
				}
				pool.remaining = pool.remaining.minus(amount);
			};

			for (const [orgId, buckets] of orgCosts.entries()) {
				const totalCost = buckets.chat.plus(buckets.other);
				if (totalCost.lessThanOrEqualTo(0)) {
					continue;
				}

				settledOrgIds.push(orgId);

				const org = await tx.query.organization.findFirst({
					where: { id: { eq: orgId } },
				});

				const chatPool: PlanPool | null =
					org && org.chatPlan !== "none"
						? {
								kind: "chat",
								remaining: new Decimal(org.chatPlanCreditsLimit || "0").minus(
									new Decimal(org.chatPlanCreditsUsed || "0"),
								),
							}
						: null;

				const devPool: PlanPool | null =
					org && org.devPlan !== "none"
						? {
								kind: "dev",
								remaining: new Decimal(org.devPlanCreditsLimit || "0").minus(
									new Decimal(org.devPlanCreditsUsed || "0"),
								),
								premiumCreditsUsed: new Decimal(
									org.devPlanPremiumCreditsUsed || "0",
								),
								premiumWeekStart: org.devPlanPremiumWeekStart,
							}
						: null;

				const drainBucket = async (
					bucketCost: Decimal,
					premiumCost: Decimal,
					preferred: PlanPool | null,
					fallback: PlanPool | null,
				): Promise<{ remaining: Decimal; remainingPremium: Decimal }> => {
					let remaining = bucketCost;
					let remainingPremium = premiumCost;
					// With PAYG overflow enabled, premium spend past the weekly
					// fair-use allowance must not consume the plan pools: the gateway
					// admits those requests on the strength of the credits balance, so
					// the excess is held out of the pool drain here and falls through
					// to the regular-credits remainder below. Without this the cap
					// would stop limiting anything — over-cap premium would just keep
					// draining the monthly pool.
					// Scoped to buckets whose spend is the dev pool's to pay (its own
					// bucket, or any bucket when there is no chat pool) — a dual-plan
					// org's chat-sourced premium keeps draining the chat pool as before.
					let premiumOverflow = new Decimal(0);
					if (
						org?.devPlanPaygEnabled &&
						devPool &&
						(preferred === devPool || !chatPool) &&
						remainingPremium.greaterThan(0)
					) {
						const allowanceLeft = new Decimal(
							getRemainingPremiumWeeklyAllowance(
								org.devPlan as DevPlanTier,
								devPool.premiumCreditsUsed?.toNumber() ?? 0,
								devPool.premiumWeekStart,
							),
						);
						premiumOverflow = Decimal.max(
							0,
							remainingPremium.minus(allowanceLeft),
						);
						remaining = remaining.minus(premiumOverflow);
						remainingPremium = remainingPremium.minus(premiumOverflow);
					}
					for (const pool of [preferred, fallback]) {
						if (!pool || remaining.lessThanOrEqualTo(0)) {
							continue;
						}
						if (pool.remaining.lessThanOrEqualTo(0)) {
							continue;
						}
						const take = Decimal.min(remaining, pool.remaining);
						const premiumTake =
							pool.kind === "dev"
								? Decimal.min(remainingPremium, take)
								: new Decimal(0);
						await deductFromPlanPool(orgId, pool, take, premiumTake);
						remaining = remaining.minus(take);
						remainingPremium = remainingPremium.minus(premiumTake);
					}
					return {
						remaining: remaining.plus(premiumOverflow),
						remainingPremium,
					};
				};

				const fromChat = buckets.chat.greaterThan(0)
					? await drainBucket(
							buckets.chat,
							buckets.chatPremium,
							chatPool,
							devPool,
						)
					: { remaining: new Decimal(0), remainingPremium: new Decimal(0) };

				const fromOther = buckets.other.greaterThan(0)
					? await drainBucket(
							buckets.other,
							buckets.otherPremium,
							devPool,
							chatPool,
						)
					: { remaining: new Decimal(0), remainingPremium: new Decimal(0) };

				const remainingCost = fromChat.remaining.plus(fromOther.remaining);

				// A dev-plan org that has not opted into pay-as-you-go overflow
				// cannot spend its `credits` balance: getAvailableCredits zeroes
				// that pool, so the gateway rejects the request rather than
				// billing it. Draining `credits` here would therefore charge a
				// balance the org was never allowed to use — silently eating an
				// admin gift, or pushing an empty balance negative so a later
				// top-up first pays off phantom debt. The overshoot exists
				// because requests admitted while the pool still had room can
				// collectively cost more than was left, so keep it on the plan
				// pool: usage stays accounted for and the allowance stays the
				// hard cap the plan promises.
				const plannedOverflowOnly =
					org && org.devPlan !== "none" && !org.devPlanPaygEnabled;

				if (remainingCost.greaterThan(0) && plannedOverflowOnly && devPool) {
					await deductFromPlanPool(
						orgId,
						devPool,
						remainingCost,
						fromChat.remainingPremium.plus(fromOther.remainingPremium),
					);
					logger.debug(
						`Kept ${remainingCost.toString()} on the dev plan pool for organization ${orgId} (pay-as-you-go overflow disabled)`,
					);
				} else if (remainingCost.greaterThan(0)) {
					const costStr = remainingCost.toString();
					await tx
						.update(organization)
						.set({
							credits: sql`${organization.credits} - ${costStr}`,
						})
						.where(eq(organization.id, orgId));

					deductedOrgIds.push(orgId);

					logger.debug(
						`Deducted ${costStr} regular credits from organization ${orgId}`,
					);
				}

				// 1% referral earnings on the full charge regardless of which pool paid.
				const referral = await tx.query.referral.findFirst({
					where: {
						referredOrganizationId: { eq: orgId },
					},
				});

				if (referral) {
					const earnings = totalCost.times(0.01);
					const currentEarnings =
						referralEarnings.get(referral.referrerOrganizationId) ??
						new Decimal(0);
					referralEarnings.set(
						referral.referrerOrganizationId,
						currentEarnings.plus(earnings),
					);
				}
			}

			// deductedOrgIds is populated inside the loop above — only orgs
			// with actual regular-credit deductions are included.

			// Apply referral earnings to referrer organizations
			for (const [referrerOrgId, earnings] of referralEarnings.entries()) {
				if (earnings.greaterThan(0)) {
					const earningsStr = earnings.toString();
					await tx
						.update(organization)
						.set({
							credits: sql`${organization.credits} + ${earningsStr}`,
							referralEarnings: sql`${organization.referralEarnings} + ${earningsStr}`,
						})
						.where(eq(organization.id, referrerOrgId));

					logger.info(
						`Added ${earningsStr} referral credits to organization ${referrerOrgId}`,
					);
				}
			}

			// Batch update API key usage within the same transaction.
			// Period windows are replayed from each log's event time so delayed
			// processing does not shift usage across recurring-limit boundaries.
			const apiKeyIds = Array.from(apiKeyEvents.keys());
			if (apiKeyIds.length > 0) {
				const apiKeyRecords = await tx.query.apiKey.findMany({
					columns: {
						id: true,
						currentPeriodStartedAt: true,
						currentPeriodUsage: true,
						periodUsageLimit: true,
						periodUsageDurationValue: true,
						periodUsageDurationUnit: true,
					},
					where: {
						id: {
							in: apiKeyIds,
						},
					},
				});
				const apiKeyRecordsById = new Map(
					apiKeyRecords.map((record) => [record.id, record]),
				);

				for (const [apiKeyId, events] of apiKeyEvents.entries()) {
					const apiKeyRecord = apiKeyRecordsById.get(apiKeyId);
					if (!apiKeyRecord) {
						logger.warn(
							`Skipping usage update for missing API key ${apiKeyId}`,
						);
						continue;
					}

					const usageUpdate = buildApiKeyUsageUpdate(apiKeyRecord, events);
					const costStr = usageUpdate.totalUsageCost.toString();

					await tx
						.update(apiKey)
						.set({
							usage: sql`${apiKey.usage} + ${costStr}`,
							...(usageUpdate.hasPeriodUsageUpdate && {
								currentPeriodUsage: usageUpdate.currentPeriodUsage,
								currentPeriodStartedAt: usageUpdate.currentPeriodStartedAt,
							}),
						})
						.where(eq(apiKey.id, apiKeyId));

					logger.debug(`Added ${costStr} usage to API key ${apiKeyId}`);
				}
			}

			// Accumulate upstream spend per provider key. Plain (uncached) writes
			// on purpose: nothing hot-path reads `usage`, and invalidating the
			// provider_key read cache every batch would hammer the database.
			if (providerKeyCosts.size > 0) {
				for (const [providerKeyId, keyCost] of providerKeyCosts.entries()) {
					const costStr = keyCost.toString();
					await tx
						.update(tables.providerKey)
						.set({
							usage: sql`${tables.providerKey.usage} + ${costStr}`,
						})
						.where(eq(tables.providerKey.id, providerKeyId));
				}

				// Detect keys that crossed their spend limit; the status flip
				// happens after commit so it can go through the cache-invalidating
				// client without holding the batch transaction open.
				const overLimitKeys = await tx
					.select({ id: tables.providerKey.id })
					.from(tables.providerKey)
					.where(
						and(
							inArray(tables.providerKey.id, [...providerKeyCosts.keys()]),
							eq(tables.providerKey.status, "active"),
							isNotNull(tables.providerKey.usageLimit),
							sql`${tables.providerKey.usage} >= ${tables.providerKey.usageLimit}`,
						),
					);
				overLimitProviderKeyIds = overLimitKeys.map((key) => key.id);
			}

			// Settle open allowance reservations keyed on this batch's log ids.
			// Each hold is released from the org's `reservedCredits` (clamped at
			// 0 — actual may exceed the estimate on multi-attempt requests, the
			// overshoot bounded by estimation error and still debited normally
			// above) and the row records the actual org-billed cost. Logs
			// without a reservation — BYOK/api-keys-mode, wallet-funded, cached —
			// skip silently.
			// 'orphaned' included deliberately: the flag marks age, not a lost
			// cause — when a delayed/redriven log row finally lands, its real
			// billed cost must still replace the held estimate.
			if (logIds.length > 0) {
				const openReservations = await tx
					.select({
						id: tables.allowanceReservation.id,
						organizationId: tables.allowanceReservation.organizationId,
						reservedAmount: tables.allowanceReservation.reservedAmount,
					})
					.from(tables.allowanceReservation)
					.where(
						and(
							inArray(tables.allowanceReservation.id, logIds),
							inArray(tables.allowanceReservation.state, ["open", "orphaned"]),
						),
					)
					.for("update");

				for (const reservation of openReservations) {
					const billed = rowOrgBilledUsd.get(reservation.id) ?? new Decimal(0);
					const overshoot = billed.minus(reservation.reservedAmount);

					await tx
						.update(organization)
						.set({
							reservedCredits: sql`GREATEST(${organization.reservedCredits} - ${reservation.reservedAmount}, 0)`,
						})
						.where(eq(organization.id, reservation.organizationId));

					await tx
						.update(tables.allowanceReservation)
						.set({
							state: "settled",
							settledAmount: billed.toString(),
							settledAt: new Date(),
							...(overshoot.greaterThan(0)
								? {
										lastError: `settled amount exceeded reserved estimate by ${overshoot.toString()}`,
									}
								: {}),
						})
						.where(eq(tables.allowanceReservation.id, reservation.id));

					settledOrgIds.push(reservation.organizationId);
				}
			}

			// Mark all logs as processed within the same transaction.
			// `= ANY($1)` keeps the query text constant across batch sizes; see
			// the data-retention cleanup above for why this matters.
			await tx
				.update(log)
				.set({
					processedAt: new Date(),
				})
				.where(sql`${log.id} = ANY(${sql.param(logIds)}::text[])`);

			logger.debug(`Marked ${logIds.length} logs as processed`);

			return unprocessedLogs.rows.length;
		});

		// Evict the debited orgs' tagged cache entries so the gateway's next
		// org read (and thus its credit gate) sees the new balance now rather
		// than after the cache TTL — the debits above went through the plain
		// client, which never fires cache invalidation. Best-effort.
		await invalidateOrganizationsCache(settledOrgIds);

		// Auto-deactivate provider keys that hit their spend limit. Goes through
		// cdb so the gateway's provider_key read cache and SWR mirrors are
		// invalidated and the key drops out of rotation promptly — and only runs
		// when a key actually crossed, so the 5s batch loop never busts the
		// cache on quiet batches. The predicate is repeated to stay idempotent
		// and to respect a limit raised between commit and flip. If the process
		// dies in between, the key's next attributed batch re-detects it.
		if (overLimitProviderKeyIds.length > 0) {
			const deactivated = await cdb
				.update(tables.providerKey)
				.set({ status: "inactive" })
				.where(
					and(
						inArray(tables.providerKey.id, overLimitProviderKeyIds),
						eq(tables.providerKey.status, "active"),
						isNotNull(tables.providerKey.usageLimit),
						sql`${tables.providerKey.usage} >= ${tables.providerKey.usageLimit}`,
					),
				)
				.returning({
					id: tables.providerKey.id,
					provider: tables.providerKey.provider,
					managed: tables.providerKey.managed,
					organizationId: tables.providerKey.organizationId,
					usage: tables.providerKey.usage,
					usageLimit: tables.providerKey.usageLimit,
				});
			for (const key of deactivated) {
				logger.info("Provider key auto-deactivated: spend limit reached", {
					providerKeyId: key.id,
					provider: key.provider,
					managed: key.managed,
					organizationId: key.organizationId,
					usage: key.usage,
					usageLimit: key.usageLimit,
				});
			}
		}

		// Async low-balance alert check (outside transaction, non-blocking)
		if (deductedOrgIds.length > 0) {
			void checkLowBalanceAlerts(deductedOrgIds);
		}
	} catch (error) {
		logger.error(
			"Error processing batch credit deductions",
			error instanceof Error ? error : new Error(String(error)),
		);
	} finally {
		await releaseLock(CREDIT_PROCESSING_LOCK_KEY);
	}

	return processedCount;
}

export async function checkLowBalanceAlerts(orgIds: string[]): Promise<void> {
	try {
		const orgs = await db
			.select()
			.from(organization)
			.where(inArray(organization.id, orgIds));

		for (const org of orgs) {
			try {
				// The whole point of these emails is "top up / enable auto-reload";
				// an org whose auto top-up will refill it does not need either.
				if (isAutoTopUpEffective(org)) {
					continue;
				}

				const lastTopUp = Number(org.lastTopUpAmount ?? 0);
				if (lastTopUp <= 0) {
					continue;
				}

				const currentBalance = Number(org.credits ?? 0);
				const ratio = currentBalance / lastTopUp;

				if (ratio < 0.2) {
					await enqueueLowBalanceEmail(
						org.id,
						"low_balance_20",
						currentBalance,
					);
				}

				if (ratio < 0.05) {
					await enqueueLowBalanceEmail(org.id, "low_balance_5", currentBalance);
				}
			} catch (error) {
				logger.error(
					`Error checking low balance alerts for org ${org.id}`,
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}
	} catch (error) {
		logger.error(
			"Error checking low balance alerts",
			error instanceof Error ? error : new Error(String(error)),
		);
	}
}

async function enqueueLowBalanceEmail(
	organizationId: string,
	emailType: "low_balance_20" | "low_balance_5",
	currentBalance: number,
): Promise<void> {
	const email = await resolveVerifiedOrgRecipient(organizationId);
	if (!email) {
		return;
	}

	// Check if already sent for this cycle (without inserting yet)
	const existing = await db.query.followUpEmail.findFirst({
		where: {
			organizationId: { eq: organizationId },
			emailType: { eq: emailType },
		},
	});

	if (existing) {
		return;
	}

	const threshold = emailType === "low_balance_20" ? "20" : "5";

	if (process.env.EMAIL_FOLLOW_UPS !== "true") {
		logger.info("Low balance alert (dry run)", {
			kind: "low_balance_alert",
			emailType,
			organizationId,
			to: email,
			currentBalance,
			threshold,
		});
		return;
	}

	// Send first, then persist dedup record on success
	await sendLowBalanceEmail({
		to: email,
		currentBalance,
		threshold,
		organizationId,
	});

	posthog.capture({
		distinctId: "organization",
		event: "low_balance_alert_sent",
		groups: { organization: organizationId },
		properties: { threshold, currentBalance, organization: organizationId },
	});

	// Persist dedup record after successful send
	await db
		.insert(tables.followUpEmail)
		.values({
			organizationId,
			emailType,
			sentTo: email,
		})
		.onConflictDoNothing();

	logger.info("Low balance alert sent", {
		emailType,
		organizationId,
		currentBalance,
		threshold,
	});
}

// Circuit breaker: skip queue consumption while postgres is known-down.
export const logInsertCircuit = {
	consecutiveFailures: 0,
	nextAttemptAt: 0,
};

const LOG_INSERT_BACKOFF_BASE_MS = 1000;
const LOG_INSERT_BACKOFF_MAX_MS = 5 * 60 * 1000;

function recordLogInsertFailure(): void {
	logInsertCircuit.consecutiveFailures += 1;
	const backoff = Math.min(
		LOG_INSERT_BACKOFF_BASE_MS *
			Math.pow(2, logInsertCircuit.consecutiveFailures - 1),
		LOG_INSERT_BACKOFF_MAX_MS,
	);
	logInsertCircuit.nextAttemptAt = Date.now() + backoff;
	logger.warn(
		`Postgres log insertion failing; backing off for ${backoff}ms (consecutive failures: ${logInsertCircuit.consecutiveFailures})`,
	);
}

function recordLogInsertSuccess(): void {
	if (logInsertCircuit.consecutiveFailures > 0) {
		logger.info(
			`Postgres log insertion recovered after ${logInsertCircuit.consecutiveFailures} consecutive failures`,
		);
	}
	logInsertCircuit.consecutiveFailures = 0;
	logInsertCircuit.nextAttemptAt = 0;
}

// Returns the number of messages successfully inserted, so the drain loop can
// decide whether to sleep (partial batch) or immediately fetch the next batch
// (full batch, queue likely still backed up).
export async function processLogQueue(): Promise<number> {
	if (Date.now() < logInsertCircuit.nextAttemptAt) {
		return 0;
	}

	// Claim-then-ack: each message is moved atomically into an in-flight list
	// instead of being popped, so a worker crash after the claim strands the
	// event for the redrive pass rather than losing it before the write.
	const claimed = await claimFromQueue(LOG_QUEUE, LOG_QUEUE_BATCH_SIZE);

	if (!claimed) {
		return 0;
	}

	const MAX_RETRIES = 5;

	try {
		// The gateway decides what to persist: it strips request/response payload
		// fields before publishing for orgs that don't retain data, so the worker
		// inserts the queued rows with no per-batch org retention lookup.
		const logData = claimed.map((i) => {
			const data = JSON.parse(i) as LogInsertData;
			// Failed requests can still carry fractional limits into integer columns.
			if (typeof data.maxTokens === "number") {
				data.maxTokens = Math.ceil(data.maxTokens);
			}
			if (typeof data.reasoningMaxTokens === "number") {
				data.reasoningMaxTokens = Math.ceil(data.reasoningMaxTokens);
			}
			return data;
		});

		// Insert logs with retry logic
		let lastError: Error | undefined;
		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			try {
				const insertStart = Date.now();
				await db
					.insert(log)
					.values(logData)
					// Replayed deliveries — a crash between insert and ack, a
					// redrive racing a live consumer, or an operator replaying the
					// queue — must never fail the batch or create a second row: the
					// log id is the dedupe key, and the billing batch keys on
					// processed_at so each row is charged exactly once.
					.onConflictDoNothing({ target: log.id });
				const insertMs = Date.now() - insertStart;
				recordLogInsertSuccess();
				logger.info(
					`Processed log batch: ${claimed.length} rows (insert ${insertMs}ms)`,
				);
				// Ack only after the durable write committed. A crash here strands
				// the entries in-flight; the redrive pass replays them and the
				// conflict guard turns the replay into a no-op.
				await ackClaimedMessages(LOG_QUEUE, claimed);
				return claimed.length;
			} catch (insertError) {
				lastError =
					insertError instanceof Error
						? insertError
						: new Error(String(insertError));

				if (attempt < MAX_RETRIES && !isStopRequested()) {
					const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s, 16s, ...
					logger.warn(
						`Failed to insert logs (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms...`,
						lastError,
					);
					await interruptibleSleep(delay);
					if (isStopRequested()) {
						break;
					}
				} else {
					break;
				}
			}
		}

		// All retries exhausted: leave the batch in-flight. The redrive loop
		// pushes the payloads back onto the queue once they go stale — no
		// message is dropped and no in-place requeue can be lost to a crash.
		recordLogInsertFailure();
		logger.error(
			`Failed to insert logs after ${MAX_RETRIES + 1} attempts; ${claimed.length} message(s) remain in-flight for redrive`,
			lastError,
		);

		return 0;
	} catch (error) {
		// Opens the circuit when the pre-insert postgres read (cdb.select) throws,
		// so we stop draining the queue while postgres is down.
		recordLogInsertFailure();
		logger.error(
			"Error processing log message",
			error instanceof Error ? error : new Error(String(error)),
		);

		return 0;
	}
}

let isWorkerRunning = false;
let activeLoops = 0;
let stopFailed = false;
// Gate minute-history retention on the hourly backfill having completed this
// process. The hourly rollups are reconstructed from minute rows on startup
// (backfillHourlyHistoryIfNeeded walks oldest->newest); pruning minute rows
// older than 30d before that finishes would permanently truncate the
// kept-forever hourly history. Defaults false so a failed/never-run backfill
// leaves cleanup disabled rather than risking data loss.
let hourlyBackfillComplete = false;

// Independent worker loops
async function runLogQueueLoop(loopIndex = 0) {
	activeLoops++;
	logger.info(`Starting log queue processing loop ${loopIndex}...`);
	try {
		while (!isStopRequested()) {
			try {
				const drained = await processLogQueue();
				// Only idle-poll when the queue came back empty. As long as any
				// messages were drained the queue is still backed up, so loop
				// straight into the next batch instead of sleeping. Tying this to
				// LOG_QUEUE_BATCH_SIZE was wrong: when the batch size is raised
				// above the steady-state queue depth the sleep fired every cycle.
				// 250ms keeps queue latency out of the billing settlement gap at
				// the cost of four cheap LPOPs per idle second.
				if (drained === 0) {
					await interruptibleSleep(250);
				}
			} catch (error) {
				logger.error(
					`Error in log queue loop ${loopIndex}`,
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info(`Log queue loop ${loopIndex} stopped`);
	}
}

async function runAutoTopUpLoop() {
	activeLoops++;
	const interval = (process.env.NODE_ENV === "production" ? 120 : 5) * 1000; // 2 minutes in prod, 5 seconds in dev
	logger.info(
		`Starting auto top-up loop (interval: ${interval / 1000} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				await processAutoTopUp();

				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in auto top-up loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Auto top-up loop stopped");
	}
}

async function runBatchProcessLoop() {
	activeLoops++;
	const interval = BATCH_PROCESSING_INTERVAL_SECONDS * 1000;
	logger.info(
		`Starting batch process loop (interval: ${BATCH_PROCESSING_INTERVAL_SECONDS} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				const processed = await batchProcessLogs();

				// A full batch means more unprocessed logs remain, so loop straight
				// into the next batch instead of sleeping. Without this the loop is
				// hard-capped at CREDIT_BATCH_SIZE / interval logs per second (e.g.
				// 100 / 5s = 20/s) regardless of how far behind credit processing is.
				if (processed < CREDIT_BATCH_SIZE) {
					await interruptibleSleep(interval);
				}
			} catch (error) {
				logger.error(
					"Error in batch process loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Batch process loop stopped");
	}
}

async function runMinutelyHistoryLoop() {
	activeLoops++;
	logger.info(
		"Starting minutely history loop (every 60s, aligned to minute boundary)...",
	);

	try {
		// Initial run immediately
		try {
			await calculateMinutelyHistory();
		} catch (error) {
			logger.error(
				"Error in initial minutely history calculation",
				error instanceof Error ? error : new Error(String(error)),
			);
		}

		try {
			await calculateHourlyHistory();
		} catch (error) {
			logger.error(
				"Error in initial hourly history calculation",
				error instanceof Error ? error : new Error(String(error)),
			);
		}

		while (!isStopRequested()) {
			// Calculate delay to next minute boundary
			const now = new Date();
			const nextMinute = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate(),
				now.getHours(),
				now.getMinutes() + 1,
				0,
				50, // 50ms buffer
			);
			const delay = nextMinute.getTime() - now.getTime();

			await interruptibleSleep(delay);

			if (isStopRequested()) {
				break;
			}

			try {
				await calculateMinutelyHistory();
			} catch (error) {
				logger.error(
					"Error in minutely history calculation",
					error instanceof Error ? error : new Error(String(error)),
				);
			}

			try {
				await calculateHourlyHistory();
			} catch (error) {
				logger.error(
					"Error in hourly history calculation",
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Minutely history loop stopped");
	}
}

async function runCurrentMinuteHistoryLoop() {
	activeLoops++;
	const interval = CURRENT_MINUTE_HISTORY_INTERVAL_SECONDS * 1000;
	logger.info(
		`Starting current minute history loop (interval: ${CURRENT_MINUTE_HISTORY_INTERVAL_SECONDS} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				await calculateCurrentMinuteHistory();

				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in current minute history loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Current minute history loop stopped");
	}
}

async function runVideoJobsLoop() {
	activeLoops++;
	const interval = VIDEO_JOB_POLL_INTERVAL_SECONDS * 1000;
	logger.info(
		`Starting video jobs loop (interval: ${VIDEO_JOB_POLL_INTERVAL_SECONDS} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				await processPendingVideoJobs();

				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in video jobs loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Video jobs loop stopped");
	}
}

async function runModelVerificationLoop() {
	activeLoops++;
	const interval = MODEL_VERIFICATION_POLL_INTERVAL_SECONDS * 1000;
	logger.info(
		`Starting model verification loop (interval: ${MODEL_VERIFICATION_POLL_INTERVAL_SECONDS} seconds)...`,
	);
	try {
		while (!isStopRequested()) {
			try {
				const processed = await processNextModelVerification();
				if (!processed) {
					await interruptibleSleep(interval);
				}
			} catch (error) {
				logger.error(
					"Error in model verification loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Model verification loop stopped");
	}
}

async function runBenchmarkRunLoop() {
	activeLoops++;
	const interval = BENCHMARK_RUN_POLL_INTERVAL_SECONDS * 1000;
	logger.info(
		`Starting benchmark run loop (interval: ${BENCHMARK_RUN_POLL_INTERVAL_SECONDS} seconds)...`,
	);
	try {
		while (!isStopRequested()) {
			try {
				const processed = await processNextBenchmarkRun();
				if (!processed) {
					await interruptibleSleep(interval);
				}
			} catch (error) {
				logger.error(
					"Error in benchmark run loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Benchmark run loop stopped");
	}
}

async function runVideoWebhookLoop() {
	activeLoops++;
	const interval = VIDEO_WEBHOOK_POLL_INTERVAL_SECONDS * 1000;
	logger.info(
		`Starting video webhook loop (interval: ${VIDEO_WEBHOOK_POLL_INTERVAL_SECONDS} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				await processPendingWebhookDeliveries();

				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in video webhook loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Video webhook loop stopped");
	}
}

async function runAggregatedStatsLoop() {
	activeLoops++;
	logger.info(
		"Starting aggregated stats loop (every 1min, aligned to minute boundary)...",
	);

	try {
		// Initial run immediately
		try {
			await calculateAggregatedStatistics();
		} catch (error) {
			logger.error(
				"Error in initial aggregated statistics calculation",
				error instanceof Error ? error : new Error(String(error)),
			);
		}

		while (!isStopRequested()) {
			const now = new Date();
			const nextRun = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate(),
				now.getHours(),
				now.getMinutes() + 1,
				0,
				100, // 100ms buffer
			);

			const delay = nextRun.getTime() - now.getTime();

			await interruptibleSleep(delay);

			if (isStopRequested()) {
				break;
			}

			try {
				await calculateAggregatedStatistics();
			} catch (error) {
				logger.error(
					"Error in aggregated statistics calculation",
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Aggregated stats loop stopped");
	}
}

async function runProjectStatsLoop() {
	activeLoops++;
	const interval = PROJECT_STATS_REFRESH_INTERVAL_SECONDS * 1000;
	logger.info(
		`Starting project stats loop (interval: ${PROJECT_STATS_REFRESH_INTERVAL_SECONDS} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				await refreshProjectHourlyStats();

				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in project stats loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Project stats loop stopped");
	}
}

async function runGlobalStatsLoop() {
	activeLoops++;
	const interval = GLOBAL_STATS_INTERVAL_SECONDS * 1000;
	logger.info(
		`Starting global stats loop (interval: ${GLOBAL_STATS_INTERVAL_SECONDS} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				const pending = await processClosedHours();

				await interruptibleSleep(pending ? Math.min(interval, 5000) : interval);
			} catch (error) {
				logger.error(
					"Error in global daily stats loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Global stats loop stopped");
	}
}

async function runDataRetentionLoop() {
	activeLoops++;
	const interval = (process.env.NODE_ENV === "production" ? 300 : 60) * 1000; // 5 minutes in prod, 1 minute in dev
	logger.info(
		`Starting data retention loop (interval: ${interval / 1000} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				await cleanupExpiredLogData();

				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in data retention loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Data retention loop stopped");
	}
}

async function runModelHistoryRetentionLoop() {
	activeLoops++;
	const interval = (process.env.NODE_ENV === "production" ? 3600 : 60) * 1000; // hourly in prod, 1 minute in dev
	logger.info(
		`Starting model history retention loop (interval: ${interval / 1000} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				if (hourlyBackfillComplete) {
					await cleanupExpiredModelHistory();
				} else {
					logger.info(
						"Skipping model history cleanup until hourly backfill completes",
					);
				}

				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in model history retention loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Model history retention loop stopped");
	}
}

async function disableExpiredApiKeys(): Promise<void> {
	const lockAcquired = await acquireLock(API_KEY_EXPIRATION_LOCK_KEY);
	if (!lockAcquired) {
		return;
	}

	try {
		// `lt(expiresAt, now)` naturally skips keys with a NULL expiry (never
		// expire). Scoped to developer keys; platform/end-user keys have their
		// own lifecycle.
		const expired = await db
			.update(tables.apiKey)
			.set({ status: "inactive" })
			.where(
				and(
					eq(tables.apiKey.keyType, "user"),
					eq(tables.apiKey.status, "active"),
					lt(tables.apiKey.expiresAt, new Date()),
				),
			)
			.returning({ id: tables.apiKey.id });

		if (expired.length > 0) {
			logger.info(`Disabled ${expired.length} expired API key(s)`);
		}
	} finally {
		await releaseLock(API_KEY_EXPIRATION_LOCK_KEY);
	}
}

async function runApiKeyExpirationLoop() {
	activeLoops++;
	const interval = (process.env.NODE_ENV === "production" ? 300 : 60) * 1000; // 5 minutes in prod, 1 minute in dev
	logger.info(
		`Starting API key expiration loop (interval: ${interval / 1000} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				await disableExpiredApiKeys();

				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in API key expiration loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("API key expiration loop stopped");
	}
}

const ORPHAN_RESERVATION_LOCK_KEY = "allowance_reservation_orphan_reaper";
// Reservations left 'open' past this age almost certainly belong to a request
// that crashed or timed out without producing a processed log row. They are
// flagged, never auto-released: the upstream outcome is unknown and may still
// have been billed, so the hold stays on the org until manual reconciliation.
const ORPHAN_RESERVATION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export async function reapOrphanedReservations(): Promise<number> {
	const lockAcquired = await acquireLock(ORPHAN_RESERVATION_LOCK_KEY);
	if (!lockAcquired) {
		return 0;
	}

	try {
		const orphaned = await db
			.update(tables.allowanceReservation)
			.set({ state: "orphaned" })
			.where(
				and(
					eq(tables.allowanceReservation.state, "open"),
					lt(
						tables.allowanceReservation.createdAt,
						new Date(Date.now() - ORPHAN_RESERVATION_MAX_AGE_MS),
					),
				),
			)
			.returning({ id: tables.allowanceReservation.id });

		if (orphaned.length > 0) {
			// Surface exactly whose money is parked: per-org counts and the USD
			// still held, so operators can reconcile without a SQL console.
			const held = await db
				.select({
					organizationId: tables.allowanceReservation.organizationId,
					count: sql<number>`count(*)`,
					heldUsd: sql<string>`sum(${tables.allowanceReservation.reservedAmount})`,
				})
				.from(tables.allowanceReservation)
				.where(
					and(
						inArray(
							tables.allowanceReservation.id,
							orphaned.map((r) => r.id),
						),
						eq(tables.allowanceReservation.state, "orphaned"),
					),
				)
				.groupBy(tables.allowanceReservation.organizationId);
			logger.warn(
				`Flagged ${orphaned.length} orphaned allowance reservation(s); holds retained for manual reconciliation`,
				{ count: orphaned.length, heldByOrg: held },
			);
		}
		return orphaned.length;
	} finally {
		await releaseLock(ORPHAN_RESERVATION_LOCK_KEY);
	}
}

// In-flight log-queue entries become eligible for redrive once they are older
// than the insert path's worst-case in-loop retry (~31s of backoff) plus
// margin — well under that a live consumer may still legitimately hold them.

const LOG_INFLIGHT_STALE_MS =
	Number(process.env.LOG_INFLIGHT_STALE_MS) || 2 * 60 * 1000;

async function runLogQueueRedriveLoop() {
	activeLoops++;
	const interval =
		(Number(process.env.LOG_QUEUE_REDRIVE_INTERVAL_SECONDS) ||
			(process.env.NODE_ENV === "production" ? 30 : 10)) * 1000;
	logger.info(
		`Starting log queue redrive loop (interval: ${interval / 1000} seconds, stale after ${LOG_INFLIGHT_STALE_MS / 1000} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				const redriven = await redriveStaleInflight(
					LOG_QUEUE,
					LOG_INFLIGHT_STALE_MS,
				);
				if (redriven > 0) {
					logger.warn(
						`Redrove ${redriven} stale in-flight log message(s) back onto the queue`,
						{ count: redriven },
					);
				}
				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in log queue redrive loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Log queue redrive loop stopped");
	}
}

async function runOrphanedReservationLoop() {
	activeLoops++;
	const interval =
		(Number(process.env.ORPHAN_RESERVATION_REAP_INTERVAL_SECONDS) ||
			(process.env.NODE_ENV === "production" ? 300 : 60)) * 1000;
	logger.info(
		`Starting orphaned allowance reservation reaper (interval: ${interval / 1000} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				await reapOrphanedReservations();

				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in orphaned reservation reaper loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Orphaned reservation reaper loop stopped");
	}
}

async function flushLimitHitCounters(): Promise<void> {
	const lockAcquired = await acquireLock(LIMIT_HIT_FLUSH_LOCK_KEY);
	if (!lockAcquired) {
		return;
	}

	try {
		// Single flusher (the lock) is what makes the RENAME-based drain in
		// flushLimitHits safe.
		const flushed = await flushLimitHits();
		if (flushed > 0) {
			logger.info(`Flushed ${flushed} limit-hit bucket(s) to Postgres`);
		}
	} finally {
		await releaseLock(LIMIT_HIT_FLUSH_LOCK_KEY);
	}
}

async function runLimitHitFlushLoop() {
	activeLoops++;
	const interval =
		parseInt(process.env.LIMIT_HIT_FLUSH_INTERVAL_SECONDS || "60", 10) * 1000;
	logger.info(
		`Starting limit-hit flush loop (interval: ${interval / 1000} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				await flushLimitHitCounters();

				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in limit-hit flush loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Limit-hit flush loop stopped");
	}
}

// Client-confirmation credit top-ups (create-payment-intent hands the browser
// a client secret to confirm later) can be abandoned. Their velocity
// reservation self-expires with its TTL, but the client secret stays
// confirmable — so stockpiled secrets could later all be confirmed at once,
// blowing through the top-up cap with no reservation counting them. Cancel
async function runNotificationsLoop() {
	activeLoops++;
	const interval = 60 * 1000;
	logger.info(
		`Starting notifications loop (interval: ${interval / 1000} seconds)...`,
	);

	try {
		while (!isStopRequested()) {
			try {
				if (await acquireLock("notifications")) {
					try {
						await processNotifications();
					} finally {
						await releaseLock("notifications");
					}
				}
				await interruptibleSleep(interval);
			} catch (error) {
				logger.error(
					"Error in notifications loop",
					error instanceof Error ? error : new Error(String(error)),
				);
				await interruptibleSleep(5000);
			}
		}
	} finally {
		activeLoops--;
		logger.info("Notifications loop stopped");
	}
}

export async function startWorker() {
	if (isWorkerRunning) {
		logger.error("Worker is already running");
		return;
	}

	if (activeLoops > 0) {
		logger.error(
			`Cannot start worker: ${activeLoops} loop(s) from previous worker still active. Please ensure previous worker has fully stopped.`,
		);
		return;
	}

	if (stopFailed) {
		logger.error(
			"Cannot start worker: previous worker stop failed. Please ensure all loops from previous worker have exited before starting a new worker.",
		);
		return;
	}

	isWorkerRunning = true;
	resetShutdown();
	logger.info("Starting worker application...");

	// Initialize providers and models sync - must complete before other stats syncs
	try {
		await syncProvidersAndModels();
		logger.info("Initial sync completed");
	} catch (error) {
		logger.error(
			"Error during initial sync",
			error instanceof Error ? error : new Error(String(error)),
		);
	}

	void backfillHistoryIfNeeded()
		.then(() => {
			logger.info("History backfill check completed");
			// Hourly summaries roll up the minute history, so backfill them only
			// after the minute backfill has had a chance to fill recent gaps.
			return backfillHourlyHistoryIfNeeded();
		})
		.then(() => {
			logger.info("Hourly history backfill check completed");
			// Hourly rollups are now populated, so minute-history pruning is safe.
			hourlyBackfillComplete = true;
		})
		.catch((error) => {
			logger.error(
				"Error during history backfill",
				error instanceof Error ? error : new Error(String(error)),
			);
		});

	// Start all worker loops (all sequential — each waits for completion before scheduling next run)
	logger.info("Starting worker loops...");
	logger.info(
		`- Log queue: ${LOG_QUEUE_CONCURRENCY} concurrent loop(s), each dequeues up to ${LOG_QUEUE_BATCH_SIZE} logs per iteration`,
	);
	logger.info(
		`- Credit processing: processes up to ${CREDIT_BATCH_SIZE} logs per batch`,
	);
	logger.info("- Minutely history: runs at the first second of every minute");
	logger.info(
		"- Hourly history: rolls up minute history into hourly summaries each minute",
	);
	logger.info(
		`- Current minute history: runs every ${CURRENT_MINUTE_HISTORY_INTERVAL_SECONDS} seconds for real-time metrics`,
	);
	logger.info(
		`- Video jobs: runs every ${VIDEO_JOB_POLL_INTERVAL_SECONDS} seconds for async video status polling`,
	);
	logger.info(
		`- Video webhooks: runs every ${VIDEO_WEBHOOK_POLL_INTERVAL_SECONDS} seconds for callback delivery`,
	);
	logger.info(
		`- Model verification: runs every ${MODEL_VERIFICATION_POLL_INTERVAL_SECONDS} seconds`,
	);
	logger.info(
		`- Benchmark runs: runs every ${BENCHMARK_RUN_POLL_INTERVAL_SECONDS} seconds for admin-queued benchmarks`,
	);
	logger.info(
		"- Aggregated stats: runs every 1 minute at the start of each minute",
	);
	logger.info(
		`- Project hourly stats: runs every ${PROJECT_STATS_REFRESH_INTERVAL_SECONDS} seconds for dashboard aggregations`,
	);
	logger.info(
		`- Global stats: runs every ${GLOBAL_STATS_INTERVAL_SECONDS} seconds, processes closed buckets incrementally`,
	);
	logger.info(
		"- Follow-up emails: runs every hour to check for lifecycle emails",
	);
	logger.info(
		"- API key expiration: runs every 5 minutes to disable keys whose TTL passed",
	);
	logger.info(
		"- Orphaned allowance reservations: flags open holds older than 2 hours",
	);

	void runMinutelyHistoryLoop();
	void runCurrentMinuteHistoryLoop();
	void runVideoJobsLoop();
	void runVideoWebhookLoop();
	void runModelVerificationLoop();
	void runBenchmarkRunLoop();
	void runAggregatedStatsLoop();
	void runProjectStatsLoop();
	void runGlobalStatsLoop();
	for (let i = 0; i < LOG_QUEUE_CONCURRENCY; i++) {
		void runLogQueueLoop(i);
	}
	void runAutoTopUpLoop();
	void runBatchProcessLoop();
	void runDataRetentionLoop();
	void runModelHistoryRetentionLoop();
	void runApiKeyExpirationLoop();
	void runOrphanedReservationLoop();
	void runLogQueueRedriveLoop();
	void runLimitHitFlushLoop();
	void runNotificationsLoop();
	void runFollowUpEmailsLoop({
		shouldStop: isStopRequested,
		acquireLock,
		releaseLock,
		interruptibleSleep,
		registerLoop: () => {
			activeLoops++;
		},
		unregisterLoop: () => {
			activeLoops--;
		},
	});
}

export async function stopWorker(): Promise<boolean> {
	if (!isWorkerRunning) {
		logger.info("Worker is not running");
		return true;
	}

	logger.info("Stopping worker...");
	requestStop();

	// Wait for all loops to finish by polling activeLoops counter
	const maxWaitTime = 15000; // 15 seconds timeout
	const pollInterval = 100; // 100ms per iteration
	const startTime = Date.now();

	logger.info(
		`Waiting for all worker loops to finish (active loops: ${activeLoops})...`,
	);

	while (activeLoops > 0) {
		const elapsed = Date.now() - startTime;

		if (elapsed >= maxWaitTime) {
			logger.error(
				`Timeout reached (${maxWaitTime}ms) while waiting for worker loops to exit. ${activeLoops} loop(s) still active. Worker stop failed.`,
			);
			stopFailed = true;
			// Keep stop state and isWorkerRunning = true to prevent new loops from starting
			return false;
		}

		// Sleep for a short period before checking again
		await new Promise((resolve) => {
			setTimeout(resolve, pollInterval);
		});
	}

	logger.info("All worker loops have exited successfully");

	// Only set isWorkerRunning = false if all loops exited successfully
	isWorkerRunning = false;
	stopFailed = false;

	// Close database and Redis connections
	try {
		await Promise.all([
			closeDatabase(),
			closeRedisClient(),
			closeStorageRedisClient(),
		]);
		logger.info("All connections closed successfully");
	} catch (error) {
		logger.error(
			"Error closing connections",
			error instanceof Error ? error : new Error(String(error)),
		);
		// Don't throw here to allow graceful shutdown to continue
	}

	logger.info("Worker stopped gracefully");
	return true;
}
