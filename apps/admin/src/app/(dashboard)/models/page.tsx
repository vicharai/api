import { Suspense } from "react";

import { ModelsPage } from "@/components/models/models-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Models" };

export default function Page() {
	return (
		<Suspense>
			<ModelsPage />
		</Suspense>
	);
}
