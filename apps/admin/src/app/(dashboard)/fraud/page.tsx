import { ReviewQueue } from "@/components/fraud/review-queue";
import { PageHeader } from "@/components/ui/page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Fraud review queue" };

export default function FraudReviewPage() {
	return (
		<>
			<PageHeader
				title="Fraud review queue"
				description="Users and organizations ranked by risk score. Hover a score for the signals behind it."
			/>
			<ReviewQueue />
		</>
	);
}
