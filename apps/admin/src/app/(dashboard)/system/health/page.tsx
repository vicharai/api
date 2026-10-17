import { SystemHealthPage } from "@/components/system/system-health-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "System health" };

export default function Page() {
	return <SystemHealthPage />;
}
