import { refreshFraudScoreCache, runFraudRules } from "@llmgateway/actions";
import { logger } from "@llmgateway/logger";

/**
 * One fraud-center pass: evaluate the enabled fraud rules, then refresh the
 * cached review-queue scores the admin panel reads.
 */
export async function runFraudCenterCycle(now: Date = new Date()): Promise<{
	events: number;
	scored: number;
}> {
	const events = await runFraudRules(now);
	const snapshot = await refreshFraudScoreCache(now);
	logger.info("Fraud center cycle finished", {
		events: events.length,
		scored: snapshot.scores.length,
	});
	return { events: events.length, scored: snapshot.scores.length };
}
