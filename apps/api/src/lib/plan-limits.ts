import { platformConfigValue, type PlatformConfig } from "@llmgateway/shared";
import { hasOrganizationEnterpriseAccess } from "@llmgateway/shared/enterprise-license";

export type PlanLimitKind = "seatLimit" | "projectLimit" | "apiKeyLimit";

/** Caps for an `enterprise` plan without a valid license; not configurable. */
const UNLICENSED_ENTERPRISE_LIMITS: Record<PlanLimitKind, number> = {
	seatLimit: 5,
	projectLimit: 10,
	apiKeyLimit: 5,
};

/**
 * An org's effective limit: an explicit admin-set override wins, otherwise the
 * plan default from the platform config (`plans.<plan>.<kind>`).
 */
export function resolvePlanLimit(
	kind: PlanLimitKind,
	organizationId: string | null | undefined,
	plan: string | null | undefined,
	override: number | null | undefined,
	config?: PlatformConfig,
): number {
	const licensed = hasOrganizationEnterpriseAccess(organizationId, plan);
	if (plan === "enterprise" && !licensed) {
		return UNLICENSED_ENTERPRISE_LIMITS[kind];
	}
	if (override !== null && override !== undefined) {
		return override;
	}
	const planKey = licensed ? "enterprise" : plan === "pro" ? "pro" : "free";
	return platformConfigValue(`plans.${planKey}.${kind}`, config);
}
