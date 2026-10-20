import { isDisposableEmail } from "disposable-email-domains-js";

import { db, sql, tables } from "@llmgateway/db";

import { DAY_MS, msBefore } from "./time.js";

export const FRAUD_LINK_WINDOW_DAYS = 90;

/** An IP shared by more accounts than this is likely NAT, VPN or an office. */
export const CROWDED_IP_ACCOUNTS = 5;

// Free webmail providers: sharing one says nothing about two accounts.
const COMMON_EMAIL_DOMAINS = new Set([
	"126.com",
	"163.com",
	"aol.com",
	"att.net",
	"comcast.net",
	"daum.net",
	"fastmail.com",
	"free.fr",
	"gmail.com",
	"gmx.com",
	"gmx.de",
	"gmx.net",
	"googlemail.com",
	"hey.com",
	"hotmail.co.uk",
	"hotmail.com",
	"icloud.com",
	"interia.pl",
	"laposte.net",
	"libero.it",
	"live.co.uk",
	"live.com",
	"mac.com",
	"mail.com",
	"mail.ru",
	"me.com",
	"msn.com",
	"naver.com",
	"o2.pl",
	"orange.fr",
	"outlook.com",
	"outlook.de",
	"pm.me",
	"proton.me",
	"protonmail.com",
	"qq.com",
	"rediffmail.com",
	"sbcglobal.net",
	"seznam.cz",
	"t-online.de",
	"tuta.io",
	"tutanota.com",
	"verizon.net",
	"web.de",
	"wp.pl",
	"yahoo.co.uk",
	"yahoo.com",
	"yandex.com",
	"yandex.ru",
	"ymail.com",
	"zoho.com",
]);

export type FraudLinkType =
	"shared_ip" | "signup_ip" | "email_domain" | "payment_fingerprint";
export type FraudLinkStrength = "strong" | "medium" | "weak";

export interface FraudLink {
	type: FraudLinkType;
	strength: FraudLinkStrength;
	detail: string;
}

export interface LinkedAccount {
	userId: string;
	email: string;
	name: string | null;
	createdAt: Date;
	status: "active" | "deactivated";
	riskStatus: "none" | "flagged" | "approved";
	strength: FraudLinkStrength;
	links: FraudLink[];
}

const STRENGTH_ORDER: Record<FraudLinkStrength, number> = {
	strong: 3,
	medium: 2,
	weak: 1,
};

export function emailDomain(email: string): string | null {
	return email.split("@")[1]?.trim().toLowerCase() || null;
}

export function isCommonEmailDomain(domain: string): boolean {
	return COMMON_EMAIL_DOMAINS.has(domain);
}

/** Binds a string array as one `text[]` parameter, for `= ANY(...)`. */
function textArray(values: string[]) {
	return sql`${sql.param(values)}::text[]`;
}

function windowStart(now: Date): string {
	return msBefore(now, FRAUD_LINK_WINDOW_DAYS * DAY_MS).toISOString();
}

interface IpPeerRow {
	user_id: string;
	ip_address: string;
	ip_accounts: number;
}

/** Other users with a session from one of `userId`'s session IPs. */
async function sharedIpPeers(userId: string, now: Date): Promise<IpPeerRow[]> {
	const since = windowStart(now);
	const result = await db.execute<IpPeerRow & Record<string, unknown>>(sql`
		WITH mine AS (
			SELECT DISTINCT ip_address FROM ${tables.session}
			WHERE user_id = ${userId} AND ip_address IS NOT NULL
				AND created_at >= ${since}::timestamp
		),
		peers AS (
			SELECT s.ip_address, s.user_id FROM ${tables.session} s
			INNER JOIN mine ON mine.ip_address = s.ip_address
			WHERE s.created_at >= ${since}::timestamp
			GROUP BY s.ip_address, s.user_id
		),
		crowd AS (
			SELECT ip_address, count(*)::int AS ip_accounts FROM peers
			GROUP BY ip_address
		)
		SELECT peers.user_id, peers.ip_address, crowd.ip_accounts
		FROM peers INNER JOIN crowd ON crowd.ip_address = peers.ip_address
		WHERE peers.user_id <> ${userId}
		ORDER BY crowd.ip_accounts ASC
		LIMIT 500
	`);
	return result.rows;
}

/**
 * Signup IP: the IP the abuse check recorded at sign-up, else the IP of the
 * user's earliest surviving session.
 */
async function signupIp(userId: string): Promise<string | null> {
	const result = await db.execute<{ ip: string | null }>(sql`
		SELECT coalesce(
			(SELECT risk_flag_ip FROM ${tables.user}
				WHERE id = ${userId} AND risk_flag_source = 'signup'),
			(SELECT ip_address FROM ${tables.session}
				WHERE user_id = ${userId} AND ip_address IS NOT NULL
				ORDER BY created_at ASC LIMIT 1)
		) AS ip
	`);
	return result.rows[0]?.ip ?? null;
}

async function signupIpPeers(userId: string, ip: string): Promise<string[]> {
	const result = await db.execute<{ user_id: string }>(sql`
		SELECT DISTINCT s.user_id FROM ${tables.session} s
		WHERE s.ip_address = ${ip} AND s.user_id <> ${userId}
			AND s.created_at = (
				SELECT min(s2.created_at) FROM ${tables.session} s2
				WHERE s2.user_id = s.user_id
			)
		UNION
		SELECT id FROM ${tables.user}
		WHERE risk_flag_ip = ${ip} AND risk_flag_source = 'signup'
			AND id <> ${userId}
		LIMIT 200
	`);
	return result.rows.map((row) => row.user_id);
}

async function emailDomainPeers(
	userId: string,
	domain: string,
): Promise<string[]> {
	const result = await db.execute<{ id: string }>(sql`
		SELECT id FROM ${tables.user}
		WHERE lower(email) LIKE ${`%@${domain}`} AND id <> ${userId}
		ORDER BY created_at DESC
		LIMIT 100
	`);
	return result.rows.map((row) => row.id);
}

const FINGERPRINTS_OF_ORGS = (organizationIds: string[]) => sql`
	SELECT dev_plan_card_fingerprint AS fp FROM ${tables.organization}
		WHERE id = ANY(${textArray(organizationIds)}) AND dev_plan_card_fingerprint IS NOT NULL
	UNION SELECT chat_plan_card_fingerprint FROM ${tables.organization}
		WHERE id = ANY(${textArray(organizationIds)}) AND chat_plan_card_fingerprint IS NOT NULL
	UNION SELECT fingerprint FROM ${tables.devPlanCardFingerprintHistory}
		WHERE organization_id = ANY(${textArray(organizationIds)})
`;

/**
 * Users who share a stored card fingerprint (DevPass / Chat plan cards, the
 * only fingerprints the schema keeps) with one of `userId`'s organizations.
 */
async function paymentFingerprintPeers(
	userId: string,
): Promise<{ userId: string; organizationId: string }[]> {
	const memberships = await db.query.userOrganization.findMany({
		where: { userId: { eq: userId } },
		columns: { organizationId: true },
	});
	const orgIds = memberships.map((m) => m.organizationId);
	if (orgIds.length === 0) {
		return [];
	}
	const result = await db.execute<{ user_id: string; organization_id: string }>(
		sql`
		WITH fps AS (${FINGERPRINTS_OF_ORGS(orgIds)}),
		orgs AS (
			SELECT id AS organization_id FROM ${tables.organization}
				WHERE (dev_plan_card_fingerprint IN (SELECT fp FROM fps)
					OR chat_plan_card_fingerprint IN (SELECT fp FROM fps))
			UNION SELECT organization_id FROM ${tables.devPlanCardFingerprintHistory}
				WHERE fingerprint IN (SELECT fp FROM fps)
		)
		SELECT DISTINCT uo.user_id, uo.organization_id
		FROM ${tables.userOrganization} uo
		INNER JOIN orgs ON orgs.organization_id = uo.organization_id
		WHERE uo.user_id <> ${userId} AND NOT (uo.organization_id = ANY(${textArray(orgIds)}))
		LIMIT 200
	`,
	);
	return result.rows.map((row) => ({
		userId: row.user_id,
		organizationId: row.organization_id,
	}));
}

/**
 * Accounts linked to `userId` by shared session IPs (last 90 days), signup IP,
 * stored card fingerprint or a non-webmail email domain, strongest first.
 */
export async function findLinkedAccounts(
	userId: string,
	now: Date = new Date(),
): Promise<LinkedAccount[] | null> {
	const user = await db.query.user.findFirst({
		where: { id: { eq: userId } },
		columns: { id: true, email: true },
	});
	if (!user) {
		return null;
	}

	const linksByUser = new Map<string, FraudLink[]>();
	const add = (peerId: string, link: FraudLink) => {
		const list = linksByUser.get(peerId) ?? [];
		if (!list.some((l) => l.type === link.type && l.detail === link.detail)) {
			list.push(link);
		}
		linksByUser.set(peerId, list);
	};

	const [ipPeers, ip, fingerprintPeers] = await Promise.all([
		sharedIpPeers(userId, now),
		signupIp(userId),
		paymentFingerprintPeers(userId),
	]);
	for (const peer of ipPeers) {
		add(peer.user_id, {
			type: "shared_ip",
			strength: peer.ip_accounts <= CROWDED_IP_ACCOUNTS ? "strong" : "medium",
			detail: `${peer.ip_address} (${peer.ip_accounts} accounts)`,
		});
	}
	if (ip) {
		for (const peerId of await signupIpPeers(userId, ip)) {
			add(peerId, { type: "signup_ip", strength: "strong", detail: ip });
		}
	}
	for (const peer of fingerprintPeers) {
		add(peer.userId, {
			type: "payment_fingerprint",
			strength: "strong",
			detail: `card on org ${peer.organizationId}`,
		});
	}
	const domain = emailDomain(user.email);
	if (domain && !isCommonEmailDomain(domain)) {
		const disposable = isDisposableEmail(user.email);
		for (const peerId of await emailDomainPeers(userId, domain)) {
			add(peerId, {
				type: "email_domain",
				strength: disposable ? "medium" : "weak",
				detail: disposable ? `${domain} (disposable)` : domain,
			});
		}
	}

	const peerIds = [...linksByUser.keys()];
	if (peerIds.length === 0) {
		return [];
	}
	const peers = await db.query.user.findMany({
		where: { id: { in: peerIds } },
		columns: {
			id: true,
			email: true,
			name: true,
			createdAt: true,
			status: true,
			riskStatus: true,
		},
	});
	return peers
		.map((peer) => {
			const links = linksByUser.get(peer.id) ?? [];
			const strength = links.reduce<FraudLinkStrength>(
				(best, link) =>
					STRENGTH_ORDER[link.strength] > STRENGTH_ORDER[best]
						? link.strength
						: best,
				"weak",
			);
			return {
				userId: peer.id,
				email: peer.email,
				name: peer.name,
				createdAt: peer.createdAt,
				status: peer.status,
				riskStatus: peer.riskStatus,
				strength,
				links,
			};
		})
		.sort(
			(a, b) =>
				STRENGTH_ORDER[b.strength] - STRENGTH_ORDER[a.strength] ||
				b.links.length - a.links.length ||
				b.createdAt.getTime() - a.createdAt.getTime(),
		);
}

/**
 * Number of accounts strongly linked to each user: a shared non-crowded
 * session IP in the link window, or a shared stored card fingerprint.
 */
export async function countStrongLinks(
	userIds: string[],
	now: Date = new Date(),
): Promise<Map<string, number>> {
	const counts = new Map<string, number>();
	if (userIds.length === 0) {
		return counts;
	}
	const since = windowStart(now);
	const result = await db.execute<{ user_id: string; peers: number }>(sql`
		WITH mine AS (
			SELECT DISTINCT user_id, ip_address FROM ${tables.session}
			WHERE user_id = ANY(${textArray(userIds)}) AND ip_address IS NOT NULL
				AND created_at >= ${since}::timestamp
		),
		ip_users AS (
			SELECT s.ip_address, s.user_id FROM ${tables.session} s
			WHERE s.ip_address IN (SELECT ip_address FROM mine)
				AND s.created_at >= ${since}::timestamp
			GROUP BY s.ip_address, s.user_id
		),
		uncrowded AS (
			SELECT ip_address FROM ip_users GROUP BY ip_address
			HAVING count(*) <= ${CROWDED_IP_ACCOUNTS}
		),
		ip_links AS (
			SELECT mine.user_id, ip_users.user_id AS peer
			FROM mine
			INNER JOIN uncrowded ON uncrowded.ip_address = mine.ip_address
			INNER JOIN ip_users ON ip_users.ip_address = mine.ip_address
			WHERE ip_users.user_id <> mine.user_id
		),
		my_fps AS (
			SELECT uo.user_id, o.dev_plan_card_fingerprint AS fp
			FROM ${tables.userOrganization} uo
			INNER JOIN ${tables.organization} o ON o.id = uo.organization_id
			WHERE uo.user_id = ANY(${textArray(userIds)}) AND o.dev_plan_card_fingerprint IS NOT NULL
			UNION
			SELECT uo.user_id, o.chat_plan_card_fingerprint
			FROM ${tables.userOrganization} uo
			INNER JOIN ${tables.organization} o ON o.id = uo.organization_id
			WHERE uo.user_id = ANY(${textArray(userIds)}) AND o.chat_plan_card_fingerprint IS NOT NULL
		),
		fp_links AS (
			SELECT my_fps.user_id, uo.user_id AS peer
			FROM my_fps
			INNER JOIN ${tables.organization} o
				ON o.dev_plan_card_fingerprint = my_fps.fp OR o.chat_plan_card_fingerprint = my_fps.fp
			INNER JOIN ${tables.userOrganization} uo ON uo.organization_id = o.id
			WHERE uo.user_id <> my_fps.user_id
		)
		SELECT user_id, count(DISTINCT peer)::int AS peers
		FROM (SELECT * FROM ip_links UNION SELECT * FROM fp_links) links
		GROUP BY user_id
	`);
	for (const row of result.rows) {
		counts.set(row.user_id, row.peers);
	}
	return counts;
}

function parseUtcTimestamp(value: string): Date {
	return new Date(`${value.replace(" ", "T")}Z`);
}

export interface IpCluster {
	ipAddress: string;
	accounts: number;
	firstSeenAt: Date;
	lastSeenAt: Date;
	userIds: string[];
}

/** Session IPs shared by at least `minAccounts` distinct users. */
export async function findIpClusters(options: {
	minAccounts: number;
	days: number;
	limit: number;
	now?: Date;
}): Promise<IpCluster[]> {
	const now = options.now ?? new Date();
	const since = msBefore(now, options.days * DAY_MS).toISOString();
	const result = await db.execute<{
		ip_address: string;
		accounts: number;
		first_seen_at: string;
		last_seen_at: string;
		user_ids: string[];
	}>(sql`
		SELECT ip_address,
			count(DISTINCT user_id)::int AS accounts,
			min(created_at)::text AS first_seen_at,
			max(created_at)::text AS last_seen_at,
			(array_agg(DISTINCT user_id))[1:25] AS user_ids
		FROM ${tables.session}
		WHERE ip_address IS NOT NULL AND created_at >= ${since}::timestamp
		GROUP BY ip_address
		HAVING count(DISTINCT user_id) >= ${options.minAccounts}
		ORDER BY accounts DESC, ip_address ASC
		LIMIT ${options.limit}
	`);
	return result.rows.map((row) => ({
		ipAddress: row.ip_address,
		accounts: row.accounts,
		firstSeenAt: parseUtcTimestamp(row.first_seen_at),
		lastSeenAt: parseUtcTimestamp(row.last_seen_at),
		userIds: row.user_ids,
	}));
}
