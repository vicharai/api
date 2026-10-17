import { CacheToolsPage } from "@/components/system/cache-tools-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cache tools" };

export default function Page() {
	return <CacheToolsPage />;
}
