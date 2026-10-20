import { useParams } from "next/navigation";

import type { Route } from "next";

/** The in-app support page, optionally opening a new conversation with a subject. */
export function supportHref(orgId?: string | null, subject?: string): Route {
	const base = orgId ? `/dashboard/${orgId}/org/support` : "/dashboard/support";
	if (!subject) {
		return base as Route;
	}
	return `${base}?${new URLSearchParams({ new: "1", subject }).toString()}` as Route;
}

/** `supportHref` for the workspace in the current dashboard URL. */
export function useSupportHref(subject?: string): Route {
	const { orgId } = useParams<{ orgId?: string }>();
	return supportHref(orgId, subject);
}
