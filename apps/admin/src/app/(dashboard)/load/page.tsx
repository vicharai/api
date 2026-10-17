import { LoadPage } from "@/components/load/load-page";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gateway load" };

export default function Page() {
	return <LoadPage />;
}
