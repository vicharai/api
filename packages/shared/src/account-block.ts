export function accountBlockMessage(
	reason: string | null | undefined,
	fallback = "Your account has been deactivated. Please contact support.",
): string {
	return reason?.trim()
		? `Your account has been blocked. Reason: ${reason.trim()}`
		: fallback;
}

export function accountSuspensionMessage(
	until: Date,
	reason: string | null | undefined,
): string {
	const base = `Your account is suspended until ${until.toISOString()}.`;
	return reason?.trim() ? `${base} Reason: ${reason.trim()}` : base;
}
