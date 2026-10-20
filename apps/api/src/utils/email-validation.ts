export interface EmailValidationResult {
	valid: boolean;
	reason?: "plus_sign" | "blacklisted_domain";
	message?: string;
}

export function validateEmail(
	email: string,
	blockedDomains: string[] = [],
): EmailValidationResult {
	const emailLower = email.toLowerCase();

	// Check for + sign in local part (before @)
	const localPart = emailLower.split("@")[0];
	if (localPart && localPart.includes("+")) {
		return {
			valid: false,
			reason: "plus_sign",
			message: "Email addresses with '+' are not allowed",
		};
	}

	// Check against blacklisted domains, including their subdomains
	const domain = emailLower.split("@")[1];
	if (
		domain &&
		blockedDomains.some(
			(blocked) => domain === blocked || domain.endsWith(`.${blocked}`),
		)
	) {
		return {
			valid: false,
			reason: "blacklisted_domain",
			message: "This email domain is not allowed",
		};
	}

	return { valid: true };
}
