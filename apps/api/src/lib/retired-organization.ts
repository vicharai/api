import type { Organization } from "@llmgateway/db";

export const RETIRED_ORGANIZATION_MESSAGE =
	"This workspace belongs to a retired product and can't be changed. Contact support for help.";

/** DevPass and Chat workspaces: retired products whose rows are kept for history. */
export function isRetiredOrganization(
	organization: Pick<Organization, "kind"> | null | undefined,
): boolean {
	return organization?.kind === "devpass" || organization?.kind === "chat";
}
