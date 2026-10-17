import { AccountDetail } from "@/components/crm/account-detail";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "CRM account" };

export default async function Page({
	params,
}: {
	params: Promise<{ accountId: string }>;
}) {
	const { accountId } = await params;
	return <AccountDetail id={accountId} />;
}
