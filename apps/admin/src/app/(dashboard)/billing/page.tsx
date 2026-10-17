import { BillingPage } from "@/components/billing/billing-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Billing" };

export default function Page() {
	return <BillingPage />;
}
