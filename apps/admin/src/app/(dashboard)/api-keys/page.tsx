import { Suspense } from "react";

import { ApiKeysPage } from "@/components/api-keys/api-keys-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "API keys" };

export default function Page() {
	return (
		<Suspense>
			<ApiKeysPage />
		</Suspense>
	);
}
