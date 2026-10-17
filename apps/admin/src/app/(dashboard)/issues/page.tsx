import { Suspense } from "react";

import { IssuesHub } from "@/components/issues/issues-hub";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Issues" };

export default function IssuesPage() {
	return (
		<Suspense>
			<IssuesHub />
		</Suspense>
	);
}
