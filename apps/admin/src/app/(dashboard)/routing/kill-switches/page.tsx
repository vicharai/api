import { Suspense } from "react";

import { KillSwitchesPage } from "@/components/kill-switches/kill-switches-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kill switches" };

export default function Page() {
	return (
		<Suspense>
			<KillSwitchesPage />
		</Suspense>
	);
}
