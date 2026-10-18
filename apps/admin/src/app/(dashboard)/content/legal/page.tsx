import { Suspense } from "react";

import { LegalPagesEditor } from "@/components/content/legal-pages";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Legal pages" };

export default function Page() {
	return (
		<Suspense>
			<LegalPagesEditor />
		</Suspense>
	);
}
