import { fetchServerData } from "@/lib/server-api";

import { ReferralsClient } from "./referrals-client";

interface Transaction {
	id: string;
	createdAt: string;
	type:
		| "credit_topup"
		| "subscription_start"
		| "subscription_cancel"
		| "subscription_end";
	creditAmount: string | null;
	amount: string | null;
	status: "pending" | "completed" | "failed";
	description: string | null;
}

interface TransactionsData {
	transactions: Transaction[];
}

interface ReferralStatsData {
	referredCount: number;
}

async function fetchTransactions(orgId: string): Promise<TransactionsData> {
	const data = await fetchServerData<TransactionsData>(
		"GET",
		"/orgs/{id}/transactions",
		{
			params: {
				path: { id: orgId },
			},
		},
	);

	return data ?? { transactions: [] };
}

async function fetchReferralStats(orgId: string): Promise<ReferralStatsData> {
	const data = await fetchServerData<ReferralStatsData>(
		"GET",
		"/orgs/{id}/referral-stats",
		{
			params: {
				path: { id: orgId },
			},
		},
	);

	return data ?? { referredCount: 0 };
}

export default async function ReferralsPage({
	params,
}: {
	params: Promise<{ orgId: string }>;
}) {
	const { orgId } = await params;

	if (!orgId) {
		return (
			<div className="flex flex-col">
				<div className="flex-1 space-y-5 p-4 pt-6 md:p-6">
					<div>
						<h1 className="text-xl font-medium tracking-tight">Referrals</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Earn credits by referring new users
						</p>
					</div>
					<div className="text-center py-8 text-muted-foreground">
						No organization selected
					</div>
				</div>
			</div>
		);
	}

	const [data, stats] = await Promise.all([
		fetchTransactions(orgId),
		fetchReferralStats(orgId),
	]);

	return (
		<ReferralsClient
			transactions={data.transactions}
			referredCount={stats.referredCount}
		/>
	);
}
