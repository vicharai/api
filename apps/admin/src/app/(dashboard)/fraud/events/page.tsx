import { Suspense } from "react";

import { FraudEvents } from "@/components/fraud/events";
import { PageHeader } from "@/components/ui/page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Fraud events" };

export default function FraudEventsPage() {
	return (
		<>
			<PageHeader
				title="Fraud events"
				description="Matches raised by fraud rules. Resolve them with a note once handled."
			/>
			<Suspense>
				<FraudEvents />
			</Suspense>
		</>
	);
}
