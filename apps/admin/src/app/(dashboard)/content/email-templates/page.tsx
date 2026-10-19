import { Suspense } from "react";

import { EmailTemplatesPage } from "@/components/content/email-templates-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Email templates" };

export default function Page() {
	return (
		<Suspense>
			<EmailTemplatesPage />
		</Suspense>
	);
}
