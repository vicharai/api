import { ModelDetail } from "@/components/models/model-detail";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Model" };

export default async function Page({
	params,
}: {
	params: Promise<{ modelId: string }>;
}) {
	const { modelId } = await params;
	return <ModelDetail modelId={decodeURIComponent(modelId)} />;
}
