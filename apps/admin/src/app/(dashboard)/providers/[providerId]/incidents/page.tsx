import { ProviderIncidentsView } from "@/components/providers/provider-incidents";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Provider incidents" };

export default async function Page({
	params,
}: {
	params: Promise<{ providerId: string }>;
}) {
	const { providerId } = await params;
	return <ProviderIncidentsView providerId={providerId} />;
}
