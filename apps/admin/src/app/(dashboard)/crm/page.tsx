import { CrmPage } from "@/components/crm/crm-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "CRM" };

export default function Page() {
	return <CrmPage />;
}
