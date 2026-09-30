"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AnalyticsClient } from "@/components/analytics/analytics-client";
import { TabBar } from "@/components/shared/tab-bar";
import { ModelUsageClient } from "@/components/usage/model-usage-client";
import { UsageClient } from "@/components/usage/usage-client";

const TABS = [
	{ value: "overview", label: "Overview" },
	{ value: "usage", label: "Usage" },
	{ value: "models", label: "Models" },
];

/**
 * One analytics surface, three sibling views. The old /usage and
 * /model-usage routes redirect here as ?tab= so history stays linear.
 */
export function AnalyticsHub({ projectId }: { projectId?: string }) {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();

	const rawTab = searchParams.get("tab");
	const tab = TABS.some((t) => t.value === rawTab) ? rawTab! : "overview";

	const setTab = (value: string) => {
		router.replace(
			value === "overview" ? pathname : `${pathname}?tab=${value}`,
		);
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-xl font-medium tracking-tight">Analytics</h1>
				<TabBar tabs={TABS} value={tab} onChange={setTab} />
			</div>
			{tab === "overview" && <AnalyticsClient projectId={projectId} embedded />}
			{tab === "usage" && (
				<UsageClient projectId={projectId} routePath="analytics" embedded />
			)}
			{tab === "models" && (
				<ModelUsageClient
					projectId={projectId ?? ""}
					routePath="analytics"
					embedded
				/>
			)}
		</div>
	);
}
