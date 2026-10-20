import { HTTPException } from "hono/http-exception";

import { accountBlockMessage } from "@llmgateway/shared/account-block";

import type { InferSelectModel, tables } from "@llmgateway/db";

type Organization = InferSelectModel<typeof tables.organization>;

export const ORGANIZATION_DISABLED_MESSAGE =
	"Organization has been disabled and is no longer accessible";

export const ORGANIZATION_HIGH_RISK_MESSAGE =
	"This account is under review and cannot be used. Please use the Contact Us link or email contact@vichar.io so we can unlock your account.";

export const ORGANIZATION_KIND_UNAVAILABLE_MESSAGE =
	"This product is no longer available. Use an API key from your Vichar dashboard.";

type OrganizationAccessFields = Pick<
	Organization,
	"status" | "riskFlagged" | "kind"
> &
	Partial<Pick<Organization, "blockReason" | "suspendReason">> & {
		// SWR mirror rows are JSON round-tripped, so timestamps may be strings.
		suspendedUntil?: Date | string | null;
	};

/** Message for an org suspended until `until`, or null when not suspended. */
export function organizationSuspensionMessage(
	organization: Pick<
		OrganizationAccessFields,
		"suspendedUntil" | "suspendReason"
	>,
	now: number = Date.now(),
): string | null {
	if (!organization.suspendedUntil) {
		return null;
	}
	const until = new Date(organization.suspendedUntil);
	if (until.getTime() <= now) {
		return null;
	}
	const reason = organization.suspendReason?.trim();
	return `Organization is suspended until ${until.toISOString()}.${reason ? ` Reason: ${reason}` : ""}`;
}

/**
 * Reason an organization may not serve requests, or null when it may. Split
 * from the throwing helper below because the realtime and Responses paths
 * report errors as values instead of exceptions.
 */
export function getOrganizationBlockReason(
	organization: OrganizationAccessFields,
	now: number = Date.now(),
): { status: 410 | 403; message: string } | null {
	if (organization.status === "deleted") {
		return {
			status: 410,
			message: accountBlockMessage(
				organization.blockReason,
				ORGANIZATION_DISABLED_MESSAGE,
			),
		};
	}
	// DevPass and Chat orgs backed products that no longer exist. Their API
	// keys may still be presented, so reject them here — a shared gate every
	// endpoint goes through — rather than deleting the rows. Every remaining
	// devpass/chat branch in the gateway and worker is unreachable behind this.
	if (organization.kind !== "default") {
		return { status: 403, message: ORGANIZATION_KIND_UNAVAILABLE_MESSAGE };
	}
	const suspended = organizationSuspensionMessage(organization, now);
	if (suspended) {
		return { status: 403, message: suspended };
	}
	// Flagged by the abuse-IP check at sign-up or email verification and not yet
	// approved by an admin. No inference of any kind until then.
	if (organization.riskFlagged) {
		return { status: 403, message: ORGANIZATION_HIGH_RISK_MESSAGE };
	}
	return null;
}

/** Throws when the organization is disabled or flagged as high risk. */
export function assertOrganizationUsable(
	organization: OrganizationAccessFields,
): void {
	const blocked = getOrganizationBlockReason(organization);
	if (blocked) {
		throw new HTTPException(blocked.status, { message: blocked.message });
	}
}
