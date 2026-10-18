import { Suspense } from "react";

import { LedgerTable } from "@/components/billing/ledger";
import { PageHeader } from "@/components/ui/page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Transactions" };

export default function Page() {
	return (
		<>
			<PageHeader
				title="Transactions"
				description="Every credit and payment movement across organizations."
			/>
			<Suspense>
				<LedgerTable />
			</Suspense>
		</>
	);
}
