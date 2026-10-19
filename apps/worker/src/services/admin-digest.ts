import { redisClient } from "@llmgateway/cache";
import {
	getEmailSender,
	and,
	db,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lt,
	sql,
	tables,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import {
	ADMIN_DIGEST_SETTING_ID,
	PAID_TRANSACTION_TYPES,
	parseAdminDigestSettings,
} from "@llmgateway/shared";
import { getResendClient } from "@llmgateway/shared/email";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_ERROR_MAPPINGS = 5;

export function adminDigestSentKey(now: Date): string {
	return `admin-digest:sent:${now.toISOString().slice(0, 10)}`;
}

export interface AdminDigestSummary {
	since: Date;
	signups: number;
	verifiedSignups: number;
	payments: { count: number; gross: number };
	refunds: { count: number; amount: number };
	topErrorMappings: {
		modelId: string;
		providerId: string;
		requests: number;
		errors: number;
	}[];
	flaggedAccounts: { pending: number; newSince: number };
	unreadSupportChats: number;
}

export async function buildAdminDigest(now: Date): Promise<AdminDigestSummary> {
	const since = new Date(now.getTime() - DAY_MS);
	const { user, transaction, chatSupportConversation, chatSupportReadStatus } =
		tables;
	const history = tables.modelProviderMappingHistoryHourly;

	const [signups] = await db
		.select({
			total: sql<number>`count(*)::int`,
			verified: sql<number>`count(*) filter (where ${user.emailVerified})::int`,
		})
		.from(user)
		.where(and(gte(user.createdAt, since), lt(user.createdAt, now)));

	const [payments] = await db
		.select({
			count: sql<number>`count(*)::int`,
			gross: sql<number>`coalesce(sum(cast(${transaction.amount} as numeric)), 0)::float`,
		})
		.from(transaction)
		.where(
			and(
				eq(transaction.status, "completed"),
				inArray(transaction.type, [...PAID_TRANSACTION_TYPES]),
				sql`cast(${transaction.amount} as numeric) > 0`,
				gte(transaction.createdAt, since),
				lt(transaction.createdAt, now),
			),
		);

	const [refunds] = await db
		.select({
			count: sql<number>`count(*)::int`,
			amount: sql<number>`coalesce(sum(cast(${transaction.amount} as numeric)), 0)::float`,
		})
		.from(transaction)
		.where(
			and(
				eq(transaction.status, "completed"),
				eq(transaction.type, "credit_refund"),
				gte(transaction.createdAt, since),
				lt(transaction.createdAt, now),
			),
		);

	const errorsExpr = sql<number>`sum(${history.upstreamErrorsCount} + ${history.gatewayErrorsCount})::int`;
	const topErrorMappings = await db
		.select({
			modelId: history.modelId,
			providerId: history.providerId,
			requests: sql<number>`sum(${history.logsCount})::int`,
			errors: errorsExpr,
		})
		.from(history)
		.where(
			and(gte(history.hourTimestamp, since), lt(history.hourTimestamp, now)),
		)
		.groupBy(history.modelId, history.providerId)
		.having(
			sql`sum(${history.upstreamErrorsCount} + ${history.gatewayErrorsCount}) > 0`,
		)
		.orderBy(desc(errorsExpr))
		.limit(TOP_ERROR_MAPPINGS);

	const [flagged] = await db
		.select({
			pending: sql<number>`count(*)::int`,
			newSince: sql<number>`count(*) filter (where ${user.riskFlaggedAt} >= ${since})::int`,
		})
		.from(user)
		.where(and(eq(user.riskStatus, "flagged"), isNull(user.riskArchivedAt)));

	const [unread] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(chatSupportConversation)
		.where(
			and(
				isNull(chatSupportConversation.archivedAt),
				isNull(chatSupportConversation.resolvedAt),
				sql`${chatSupportConversation.messageCount} > 0`,
				sql`not exists (
					select 1 from ${chatSupportReadStatus}
					where ${chatSupportReadStatus.conversationId} = ${chatSupportConversation.id}
					and ${chatSupportReadStatus.lastReadMessageCount} >= ${chatSupportConversation.messageCount}
				)`,
			),
		);

	return {
		since,
		signups: signups?.total ?? 0,
		verifiedSignups: signups?.verified ?? 0,
		payments: { count: payments?.count ?? 0, gross: payments?.gross ?? 0 },
		refunds: { count: refunds?.count ?? 0, amount: refunds?.amount ?? 0 },
		topErrorMappings,
		flaggedAccounts: {
			pending: flagged?.pending ?? 0,
			newSince: flagged?.newSince ?? 0,
		},
		unreadSupportChats: unread?.count ?? 0,
	};
}

function usd(value: number): string {
	return `$${value.toFixed(2)}`;
}

export function renderAdminDigest(
	summary: AdminDigestSummary,
	now: Date,
): { subject: string; text: string } {
	const errors = summary.topErrorMappings.length
		? summary.topErrorMappings
				.map(
					(m) =>
						`  - ${m.providerId}/${m.modelId}: ${m.errors} errors / ${m.requests} requests (${((m.errors / Math.max(m.requests, 1)) * 100).toFixed(1)}%)`,
				)
				.join("\n")
		: "  - none";
	const text = `Daily admin digest for the 24 hours ending ${now.toISOString()}.

Signups: ${summary.signups} (${summary.verifiedSignups} verified)
Payments: ${summary.payments.count} totalling ${usd(summary.payments.gross)}
Refunds: ${summary.refunds.count} totalling ${usd(summary.refunds.amount)}
Flagged accounts awaiting review: ${summary.flaggedAccounts.pending} (${summary.flaggedAccounts.newSince} new)
Unread support chats: ${summary.unreadSupportChats}

Top error mappings (upstream + gateway errors):
${errors}
`;
	return {
		subject: `Admin digest ${now.toISOString().slice(0, 10)}: ${summary.signups} signups, ${usd(summary.payments.gross)} payments`,
		text,
	};
}

/** ADMIN_EMAILS entries that belong to a user with a verified email. */
async function getDigestRecipients(): Promise<string[]> {
	const emails = (process.env.ADMIN_EMAILS ?? "")
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean);
	if (emails.length === 0) {
		return [];
	}
	const rows = await db
		.select({ email: tables.user.email })
		.from(tables.user)
		.where(
			and(
				inArray(sql`lower(${tables.user.email})`, emails),
				eq(tables.user.emailVerified, true),
			),
		);
	return rows.map((row) => row.email);
}

/**
 * Sends the daily digest once per UTC day, at or after the configured hour.
 * Returns the recipients it was sent to (empty when nothing was sent).
 */
export async function runAdminDigest(
	now: Date = new Date(),
): Promise<string[]> {
	const setting = await db.query.systemSetting.findFirst({
		where: { id: ADMIN_DIGEST_SETTING_ID },
	});
	const settings = parseAdminDigestSettings(setting?.value);
	if (!settings.enabled || now.getUTCHours() < settings.hourUtc) {
		return [];
	}

	const client = getResendClient();
	if (!client) {
		logger.warn("Admin digest enabled but RESEND_API_KEY is not configured");
		return [];
	}
	const recipients = await getDigestRecipients();
	if (recipients.length === 0) {
		logger.warn("Admin digest enabled but no verified ADMIN_EMAILS user");
		return [];
	}

	const key = adminDigestSentKey(now);
	const claimed = await redisClient.set(key, "1", "EX", 2 * 24 * 60 * 60, "NX");
	if (claimed !== "OK") {
		return [];
	}

	try {
		const { subject, text } = renderAdminDigest(
			await buildAdminDigest(now),
			now,
		);
		const sender = await getEmailSender();
		const { error } = await client.emails.send({
			from: sender.from,
			to: recipients,
			replyTo: sender.replyTo,
			subject,
			text,
		});
		if (error) {
			throw new Error(`Resend API error: ${error.message}`);
		}
	} catch (error) {
		// Release the day's claim so the next run retries.
		await redisClient.del(key);
		throw error;
	}

	logger.info("Sent admin digest", { recipients: recipients.length });
	return recipients;
}
