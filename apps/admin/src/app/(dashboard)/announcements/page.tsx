import { Suspense } from "react";

import { AnnouncementsPage } from "@/components/announcements/announcements-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Announcements" };

export default function Page() {
	return (
		<Suspense>
			<AnnouncementsPage />
		</Suspense>
	);
}
