import { Suspense } from "react";

import { RoutingPage } from "@/components/routing/routing-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Routing" };

export default function Page() {
	return (
		<Suspense>
			<RoutingPage />
		</Suspense>
	);
}
