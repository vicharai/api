export function getBillingPageUrl(organization: { id: string }): string {
	return `${process.env.UI_URL ?? "https://app.vichar.io"}/dashboard/${organization.id}/org/billing`;
}
