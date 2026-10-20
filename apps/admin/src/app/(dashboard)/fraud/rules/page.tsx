import { FraudRules } from "@/components/fraud/rules";
import { PageHeader } from "@/components/ui/page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Fraud rules" };

export default function FraudRulesPage() {
	return (
		<>
			<PageHeader
				title="Fraud rules"
				description="Automatic detection over aggregated usage, payments and signups."
			/>
			<FraudRules />
		</>
	);
}
