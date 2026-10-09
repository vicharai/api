import { redirect } from "next/navigation";

import type { Route } from "next";

// Transactions live under Billing now; keep the old URL working.
export default async function TransactionsPage({
	params,
}: {
	params: Promise<{ orgId: string }>;
}) {
	const { orgId } = await params;
	redirect(`/dashboard/${orgId}/org/billing?tab=transactions` as Route);
}
