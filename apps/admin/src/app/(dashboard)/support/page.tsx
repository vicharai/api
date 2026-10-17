import { Suspense } from "react";

import { SupportInbox } from "@/components/support/support-inbox";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
	return (
		<Suspense>
			<SupportInbox />
		</Suspense>
	);
}
