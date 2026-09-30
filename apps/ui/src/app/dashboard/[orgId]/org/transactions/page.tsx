import { TransactionsClient } from "@/components/billing/transactions-client";
import { fetchServerData } from "@/lib/server-api";

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
	refund?: {
		eligible: boolean;
		reason?:
			| "unsupported_type"
			| "not_completed"
			| "already_refunded"
			| "window_expired"
			| "not_owner"
			| "not_latest_purchase"
			| "plan_inactive"
			| "usage_exceeded"
			| "pass_already_used";
	};
}

interface TransactionsData {
	transactions: Transaction[];
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

export default async function TransactionsPage({
	params,
}: {
	params: Promise<{ orgId: string }>;
}) {
	const { orgId } = await params;

	if (!orgId) {
		return (
			<div className="flex flex-col">
				<div className="flex-1 space-y-5">
					<div>
						<h1 className="text-xl font-medium tracking-tight">Transactions</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Your organization's payment and credit history
						</p>
					</div>
					<div className="text-center py-8 text-muted-foreground">
						No organization selected
					</div>
				</div>
			</div>
		);
	}

	const data = await fetchTransactions(orgId);

	return <TransactionsClient data={data} orgId={orgId} />;
}
