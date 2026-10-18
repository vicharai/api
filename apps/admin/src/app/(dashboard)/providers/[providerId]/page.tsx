import { ProviderDetail } from "@/components/providers/provider-detail";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Provider" };

export default async function Page({
	params,
}: {
	params: Promise<{ providerId: string }>;
}) {
	const { providerId } = await params;
	return <ProviderDetail providerId={providerId} />;
}
