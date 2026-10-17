import { Suspense } from "react";

import { ProvidersPage } from "@/components/providers/providers-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Providers" };

export default function Page() {
	return (
		<Suspense>
			<ProvidersPage />
		</Suspense>
	);
}
