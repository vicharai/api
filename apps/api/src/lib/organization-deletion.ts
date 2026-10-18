import { hasOrgRequestActivity } from "@llmgateway/actions";
import {
	and,
	db,
	eq,
	gte,
	projectHourlyStats,
	sql,
	tables,
} from "@llmgateway/db";

/**
 * How long an organization has to be free of spend activity before its owner
 * may delete it. An org that served requests this recently is probably still
 * wired into a production app.
 */
export const ORGANIZATION_DELETE_IDLE_DAYS = 30;

export interface OrganizationDeletionBlockers {
	/** Balance is at or above the threshold (or unreadable). */
	blockingCredits: boolean;
	/** The org had spend activity within the idle window. */
	recentActivity: boolean;
}

/**
 * Whether the balance is at or above `maxCredits`
 * (`billing.orgDeletionMaxCredits`): real money the owner should reclaim
 * through support rather than forfeit.
 */
export function hasBlockingCredits(
	credits: string | null,
	maxCredits: number,
): boolean {
	// `!(credits < max)` so an unparseable balance (NaN) also blocks: refusing
	// the delete is the safe direction.
	return !(Number(credits ?? "0") < maxCredits);
}

/**
 * Start of the hour bucket that contains `now - idle window`, so a bucket
 * straddling the cutoff still counts.
 */
const IDLE_WINDOW_MS = ORGANIZATION_DELETE_IDLE_DAYS * 24 * 60 * 60 * 1000;

export function getRecentActivityCutoff(now = new Date()): Date {
	const cutoff = new Date(now.getTime() - IDLE_WINDOW_MS);
	cutoff.setUTCMinutes(0, 0, 0);
	return cutoff;
}

/**
 * The Redis marker is stamped on the gateway write path, so it catches a
 * request served seconds ago; the hourly stats cover the marker being absent
 * (Redis eviction, activity from before the marker existed).
 */
export async function hasRecentActivity(
	organizationId: string,
	now = new Date(),
): Promise<boolean> {
	if (await hasOrgRequestActivity(organizationId)) {
		return true;
	}

	const [row] = await db
		.select({
			requestCount: sql<string>`COALESCE(SUM(${projectHourlyStats.requestCount}), 0)`,
		})
		.from(projectHourlyStats)
		.innerJoin(
			tables.project,
			eq(projectHourlyStats.projectId, tables.project.id),
		)
		.where(
			and(
				eq(tables.project.organizationId, organizationId),
				gte(projectHourlyStats.hourTimestamp, getRecentActivityCutoff(now)),
			),
		);

	return Number(row?.requestCount ?? 0) > 0;
}

export async function getOrganizationDeletionBlockers(
	org: {
		id: string;
		credits: string | null;
	},
	maxCredits: number,
): Promise<OrganizationDeletionBlockers> {
	return {
		blockingCredits: hasBlockingCredits(org.credits, maxCredits),
		recentActivity: await hasRecentActivity(org.id),
	};
}
