import { Suspense } from "react";

import { OrgDetail } from "@/components/organizations/detail/org-detail";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationPage({
	params,
}: {
	params: Promise<{ orgId: string }>;
}) {
	const { orgId } = await params;
	return (
		<Suspense>
			<OrgDetail orgId={orgId} />
		</Suspense>
	);
}
