import { Suspense } from "react";

import { AnalyticsHub } from "@/components/analytics/analytics-hub";

export default async function AnalyticsPage({
	params,
}: {
	params?: Promise<{
		projectId?: string;
	}>;
}) {
	const paramsData = await params;
	const projectId = paramsData?.projectId;

	return (
		<Suspense>
			<AnalyticsHub projectId={projectId} />
		</Suspense>
	);
}
