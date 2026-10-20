import { Suspense } from "react";

import { RequestLookupPage } from "@/components/requests/request-lookup";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Request lookup" };

export default function Page() {
	return (
		<Suspense>
			<RequestLookupPage />
		</Suspense>
	);
}
