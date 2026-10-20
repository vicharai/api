import { isDisposableEmail } from "disposable-email-domains-js";

/**
 * Whether the email's domain is on the maintained disposable list and not in
 * `allowlist` (exact domain or a parent of it).
 */
export function isBlockedDisposableEmail(
	email: string,
	allowlist: readonly string[] = [],
): boolean {
	const normalized = email.trim().toLowerCase();
	const domain = normalized.split("@")[1];
	if (!domain || !isDisposableEmail(normalized)) {
		return false;
	}
	return !allowlist.some((entry) => {
		const allowed = entry.trim().toLowerCase();
		return domain === allowed || domain.endsWith(`.${allowed}`);
	});
}
