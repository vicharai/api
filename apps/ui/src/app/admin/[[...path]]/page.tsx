import { redirect } from "next/navigation";

import { getConfig } from "@/lib/config-server";

// The admin panel lives in its own app (apps/admin); keep old links working.
export default async function AdminRedirect({
	params,
}: {
	params: Promise<{ path?: string[] }>;
}) {
	const { path } = await params;
	const base = getConfig().adminUrl.replace(/\/$/, "");
	const rest = (path ?? []).map(encodeURIComponent).join("/");
	redirect(rest ? `${base}/${rest}` : base);
}
