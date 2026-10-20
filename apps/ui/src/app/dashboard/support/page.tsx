import { redirect } from "next/navigation";

import { getOrganizations } from "@/lib/server-api";

import type { Route } from "next";

/** Org-less entry point (notification links) into the current user's support page. */
export default async function SupportRedirectPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const [organizations, params] = await Promise.all([
		getOrganizations(),
		searchParams,
	]);
	const orgId = organizations?.organizations?.[0]?.id;
	if (!orgId) {
		redirect("/dashboard");
	}
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (typeof value === "string") {
			query.set(key, value);
		}
	}
	const suffix = query.size ? `?${query.toString()}` : "";
	redirect(`/dashboard/${orgId}/org/support${suffix}` as Route);
}
