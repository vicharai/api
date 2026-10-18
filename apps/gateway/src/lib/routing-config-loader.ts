import { hasOrganizationEnterpriseAccess } from "@/lib/enterprise.js";

import { swrWrap } from "@llmgateway/cache";
import {
	cdb,
	eq,
	getTableName,
	routingConfig,
	type RoutingHistoryConfig,
	type RoutingRetryConfig,
	type RoutingSessionConfig,
	type RoutingStickyConfig,
	type RoutingThresholdsConfig,
	type RoutingTimeoutsConfig,
	type RoutingWeightsConfig,
	type ProviderPriorityOverrides,
} from "@llmgateway/db";
import { platformConfigValue, type PlatformConfig } from "@llmgateway/shared";
import {
	buildProviderPriorityDefaults,
	resolveRoutingConfig,
	type ResolvedRoutingConfig,
	type RoutingOrganizationKind,
} from "@llmgateway/shared/routing-config";

const routingConfigTableName = getTableName(routingConfig);
const providerPriorityDefaults = buildProviderPriorityDefaults();

interface StoredRoutingOverrides {
	enabled: boolean;
	weights: RoutingWeightsConfig | null;
	thresholds: RoutingThresholdsConfig | null;
	retry: RoutingRetryConfig | null;
	timeouts: RoutingTimeoutsConfig | null;
	history: RoutingHistoryConfig | null;
	sticky: RoutingStickyConfig | null;
	session: RoutingSessionConfig | null;
	providerPriorities: ProviderPriorityOverrides | null;
}

/**
 * A platform-wide `gateway.explorationRate` replaces every project's own
 * exploration rate; unset, the project's routing config decides.
 */
function applyPlatformExplorationRate(
	cfg: ResolvedRoutingConfig,
	platformConfig: PlatformConfig | undefined,
): ResolvedRoutingConfig {
	const rate = platformConfigValue("gateway.explorationRate", platformConfig);
	return rate === null
		? cfg
		: { ...cfg, thresholds: { ...cfg.thresholds, explorationRate: rate } };
}

export async function getResolvedRoutingConfig(
	projectId: string | undefined,
	organizationId: string | undefined,
	orgPlan: string | undefined,
	orgKind?: RoutingOrganizationKind | null,
	isCodingAgent = false,
	platformConfig?: PlatformConfig,
): Promise<ResolvedRoutingConfig> {
	return applyPlatformExplorationRate(
		await loadRoutingConfig(
			projectId,
			organizationId,
			orgPlan,
			orgKind,
			isCodingAgent,
		),
		platformConfig,
	);
}

async function loadRoutingConfig(
	projectId: string | undefined,
	organizationId: string | undefined,
	orgPlan: string | undefined,
	orgKind: RoutingOrganizationKind | null | undefined,
	isCodingAgent: boolean,
): Promise<ResolvedRoutingConfig> {
	const defaultsKind = isCodingAgent ? "devpass" : orgKind;
	if (!projectId || !hasOrganizationEnterpriseAccess(organizationId, orgPlan)) {
		return resolveRoutingConfig(null, providerPriorityDefaults, defaultsKind);
	}

	const overrides = await swrWrap(
		`routingConfig:${projectId}`,
		[routingConfigTableName],
		async (): Promise<StoredRoutingOverrides | null> => {
			const rows = await cdb
				.select()
				.from(routingConfig)
				.where(eq(routingConfig.projectId, projectId))
				.limit(1);

			const row = rows[0];
			if (!row) {
				return null;
			}
			return {
				enabled: row.enabled,
				weights: row.weights ?? null,
				thresholds: row.thresholds ?? null,
				retry: row.retry ?? null,
				timeouts: row.timeouts ?? null,
				history: row.history ?? null,
				sticky: row.sticky ?? null,
				session: row.session ?? null,
				providerPriorities: row.providerPriorities ?? null,
			};
		},
	);

	return resolveRoutingConfig(
		overrides,
		providerPriorityDefaults,
		defaultsKind,
	);
}

export function getDefaultProviderPriorities(): ProviderPriorityOverrides {
	return { ...providerPriorityDefaults };
}
