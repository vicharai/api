import { SettingsPage } from "@/components/settings/settings-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
	return <SettingsPage />;
}
