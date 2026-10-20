import { isAdminEmail } from "@/middleware/admin.js";

import { getPlatformConfig } from "@llmgateway/db";
import { isIpBlocked } from "@llmgateway/shared/ip-rules";

export const ACCESS_BLOCKED_MESSAGE =
	"Access from your network has been blocked. Contact support if you think this is a mistake.";

/**
 * Whether `abuse.blockedIps` denies this client. ADMIN_EMAILS owners are
 * exempt so a too-broad rule cannot lock the operators out.
 */
export async function isClientIpBlocked(
	ip: string | null,
	email?: string | null,
): Promise<boolean> {
	if (isAdminEmail(email)) {
		return false;
	}
	const config = await getPlatformConfig();
	return isIpBlocked(ip, config["abuse.blockedIps"]);
}

export function accessBlockedResponse(): Response {
	return new Response(
		JSON.stringify({
			error: "access_blocked",
			message: ACCESS_BLOCKED_MESSAGE,
		}),
		{ status: 403, headers: { "Content-Type": "application/json" } },
	);
}
