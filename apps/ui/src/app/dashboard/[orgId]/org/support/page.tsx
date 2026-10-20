import { Suspense } from "react";

import { SupportCenter } from "@/components/support/support-center";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Help & support" };

export default function SupportPage() {
	return (
		<Suspense>
			<SupportCenter />
		</Suspense>
	);
}
