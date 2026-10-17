import { Suspense } from "react";

import { AuditPage } from "@/components/audit/audit-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
	return (
		<Suspense>
			<AuditPage />
		</Suspense>
	);
}
