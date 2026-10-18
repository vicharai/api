import { resolvePlanLimit } from "./plan-limits.js";

import type { PlatformConfig } from "@llmgateway/shared";

// Team-member seat cap. An explicit `organization.seats` override (set by
// admins) always takes precedence over the plan default.
export function resolveSeatLimit(
	organizationId: string | null | undefined,
	plan: string | null | undefined,
	seats: number | null | undefined,
	config?: PlatformConfig,
): number {
	return resolvePlanLimit("seatLimit", organizationId, plan, seats, config);
}
