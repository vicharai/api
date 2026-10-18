import { UsagePage } from "@/components/usage/usage-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Usage" };

export default function Page() {
	return <UsagePage />;
}
