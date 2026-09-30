import { SettingsRail } from "@/components/settings/settings-rail";

import type { ReactNode } from "react";

export default async function SettingsLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ orgId: string; projectId: string }>;
}) {
	const { orgId, projectId } = await params;
	const basePath = `/dashboard/${orgId}/${projectId}/settings`;

	return (
		<div className="flex flex-col gap-6 md:flex-row md:gap-10">
			<aside className="shrink-0 md:w-44">
				<SettingsRail basePath={basePath} />
			</aside>
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}
