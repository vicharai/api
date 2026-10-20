import { HTTPException } from "hono/http-exception";

import { getClientIpFromHeaders } from "@/lib/client-ip.js";
import {
	checkIpAbuse,
	describeAbuseReport,
	isAbusiveReport,
} from "@/utils/abuse-ip.js";
import { notifyHighRiskAccount } from "@/utils/discord.js";

import { syncUserRiskFlagToOrganizations } from "@llmgateway/actions";
import {
	and,
	cdb,
	db,
	eq,
	getPlatformConfig,
	inArray,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

export const HIGH_RISK_ACCOUNT_MESSAGE =
	"This account is under review and cannot purchase credits. Please use the Contact Us link or email contact@vichar.io so we can unlock your account.";

type RiskFlagSource = "signup" | "email_verification";

/**
 * Raises the high-risk flag when the request came from an IP AbuseIPDB reports
 * as abusive. Called on sign-up and again when the verification link is opened,
 * because throwaway accounts are routinely created from a clean address and
 * only then activated from the abusive one.
 *
 * Never throws and never blocks the calling flow: the account is created and
 * the email is verified as usual, the flag only takes effect downstream (no
 * credit purchases, no inference) until an admin approves it.
 */
export async function flagUserIfAbusiveIp(options: {
	userId: string;
	source: RiskFlagSource;
	headers: Headers | null | undefined;
}): Promise<void> {
	const { userId, source, headers } = options;

	try {
		const user = await db.query.user.findFirst({
			where: { id: { eq: userId } },
			columns: { id: true, email: true, name: true, riskStatus: true },
		});
		// An admin-approved account is never re-flagged, otherwise opening the
		// verification link from the same network would undo the review.
		if (!user || user.riskStatus !== "none") {
			return;
		}

		const ip = getClientIpFromHeaders(headers);
		const report = await checkIpAbuse(ip);
		if (!isAbusiveReport(report, await getPlatformConfig()) || !ip) {
			return;
		}

		await db
			.update(tables.user)
			.set({
				riskStatus: "flagged",
				riskFlaggedAt: new Date(),
				riskFlagSource: source,
				riskFlagIp: ip,
				riskFlagDetails: report,
			})
			.where(eq(tables.user.id, userId));

		const organizationIds = await syncUserRiskFlagToOrganizations(userId);

		logger.warn("Account flagged as high risk", {
			userId,
			source,
			ip,
			abuseConfidenceScore: report.abuseConfidenceScore,
			organizationIds,
		});

		await notifyHighRiskAccount({
			email: user.email,
			name: user.name,
			source,
			reason: describeAbuseReport(report),
			countryCode: report.countryCode,
			organizationIds,
		});
	} catch (error) {
		logger.error(
			"Abuse IP risk check failed",
			error instanceof Error ? error : new Error(String(error)),
			{ userId, source },
		);
	}
}

/** Whether a newly created organization must start out flagged. */
export async function isUserHighRisk(userId: string): Promise<boolean> {
	const user = await db.query.user.findFirst({
		where: { id: { eq: userId } },
		columns: { riskStatus: true },
	});
	return user?.riskStatus === "flagged";
}

/**
 * Clears the flag after an admin review. The user is marked "approved" rather
 * than "none" so a later sign-in or verification from the same network cannot
 * flag them again, and every organization they belong to is unblocked.
 */
export async function approveHighRiskUser(options: {
	userId: string;
	reviewerId: string;
}): Promise<{ organizationIds: string[] } | null> {
	const { userId, reviewerId } = options;

	const user = await db.query.user.findFirst({
		where: { id: { eq: userId } },
		columns: { id: true, riskStatus: true },
	});
	if (!user) {
		return null;
	}

	await db
		.update(tables.user)
		.set({
			riskStatus: "approved",
			riskReviewedAt: new Date(),
			riskReviewedBy: reviewerId,
		})
		.where(eq(tables.user.id, userId));

	const memberships = await db.query.userOrganization.findMany({
		where: { userId: { eq: userId } },
		columns: { organizationId: true },
	});
	const organizationIds = memberships.map((m) => m.organizationId);
	if (organizationIds.length) {
		await cdb
			.update(tables.organization)
			.set({ riskFlagged: false })
			.where(
				and(
					inArray(tables.organization.id, organizationIds),
					eq(tables.organization.riskFlagged, true),
				),
			);
	}

	logger.info("High-risk account approved", { userId, reviewerId });

	return { organizationIds };
}

/** Throws 403 when the organization is flagged as high risk. */
export async function assertOrganizationNotHighRisk(
	organizationId: string,
): Promise<void> {
	const organization = await db.query.organization.findFirst({
		where: { id: { eq: organizationId } },
		columns: { riskFlagged: true },
	});
	if (organization?.riskFlagged) {
		throw new HTTPException(403, { message: HIGH_RISK_ACCOUNT_MESSAGE });
	}
}
