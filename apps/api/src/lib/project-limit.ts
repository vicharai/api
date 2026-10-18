import { resolvePlanLimit } from "./plan-limits.js";

import type { PlatformConfig } from "@llmgateway/shared";

// Org-wide cap on non-deleted projects. An explicit `organization.projectLimit`
// override (set by admins) always takes precedence over the plan default.
export function resolveProjectLimit(
	organizationId: string | null | undefined,
	plan: string | null | undefined,
	projectLimit: number | null | undefined,
	config?: PlatformConfig,
): number {
	return resolvePlanLimit(
		"projectLimit",
		organizationId,
		plan,
		projectLimit,
		config,
	);
}
