import { Suspense } from "react";

import { ActivityPage } from "@/components/activity/activity-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Activity" };

export default function Page() {
	return (
		<Suspense>
			<ActivityPage />
		</Suspense>
	);
}
