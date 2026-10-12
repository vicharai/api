interface MailProvider {
	name: string;
	url: string;
}

const MAIL_PROVIDERS: Array<{ name: string; url: string; domains: string[] }> =
	[
		{
			name: "Gmail",
			url: "https://mail.google.com/mail/u/0/#search/from%3Avichar.io+in%3Aanywhere",
			domains: ["gmail.com", "googlemail.com"],
		},
		{
			name: "Outlook",
			url: "https://outlook.live.com/mail/0/",
			domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
		},
		{
			name: "Yahoo Mail",
			url: "https://mail.yahoo.com/",
			domains: ["yahoo.com"],
		},
		{
			name: "Proton Mail",
			url: "https://mail.proton.me/",
			domains: ["proton.me", "protonmail.com", "pm.me"],
		},
		{
			name: "iCloud Mail",
			url: "https://www.icloud.com/mail",
			domains: ["icloud.com", "me.com", "mac.com"],
		},
	];

/** Map an email address to a webmail deep link, or null when unknown. */
export function getMailProvider(email: string): MailProvider | null {
	const domain = email.split("@")[1]?.toLowerCase();
	if (!domain) {
		return null;
	}
	for (const provider of MAIL_PROVIDERS) {
		if (provider.domains.includes(domain)) {
			return provider;
		}
	}
	return null;
}
