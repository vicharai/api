import {
	computeFraudScores,
	readFraudScoreCache,
	refreshFraudScoreCache,
	type FraudScore,
	type FraudScoreSnapshot,
} from "@llmgateway/actions";

/**
 * Review-queue scores. The worker refreshes the Redis snapshot every five
 * minutes; a page view only recomputes when it is missing or on request.
 */
export async function getFraudScoreSnapshot(
	refresh = false,
): Promise<FraudScoreSnapshot> {
	if (!refresh) {
		const cached = await readFraudScoreCache();
		if (cached) {
			return cached;
		}
	}
	return await refreshFraudScoreCache();
}

/** One user's live score, for the user detail page. */
export async function getUserFraudScore(
	userId: string,
): Promise<FraudScore | null> {
	const [score] = await computeFraudScores({ userIds: [userId] });
	return score ?? null;
}
