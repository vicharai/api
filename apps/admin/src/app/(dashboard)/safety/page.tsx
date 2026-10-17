import { SafetyPage } from "@/components/safety/safety-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Safety" };

export default function Page() {
	return <SafetyPage />;
}
