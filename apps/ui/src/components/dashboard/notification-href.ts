const ORG_ID_PLACEHOLDER = "{orgId}";

/**
 * Where a notification row links to, or null for a plain row. Admin
 * announcements may use `{orgId}` for the viewer's current workspace.
 */
export function resolveNotificationHref(
	href: string | null | undefined,
	orgId: string | null | undefined,
): string | null {
	const trimmed = href?.trim();
	if (!trimmed) {
		return null;
	}
	if (!trimmed.includes(ORG_ID_PLACEHOLDER)) {
		return trimmed;
	}
	return orgId ? trimmed.replaceAll(ORG_ID_PLACEHOLDER, orgId) : "/dashboard";
}

export function isExternalHref(href: string): boolean {
	return /^https?:\/\//.test(href);
}
