import { Suspense } from "react";

import { OrganizationsList } from "@/components/organizations/organizations-list";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Organizations" };

export default function OrganizationsPage() {
	return (
		<Suspense>
			<OrganizationsList />
		</Suspense>
	);
}
