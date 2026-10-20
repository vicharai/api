import { FREE_TIER_PUBLIC_PROVIDER_ID } from "@llmgateway/models";

/**
 * Build the `provider/model` string shown to clients in response `model`
 * fields. The real upstream provider stays hidden: every platform-routed
 * provider renders as the public platform label, while custom providers keep
 * the user's own name (it is their label, not our infrastructure).
 * Vendor-prefixed upstream ids (`@cf/qwen/qwq-32b`) drop their namespace.
 */
export function formatUsedModelForDisplay(
	usedProvider: string,
	usedInternalModel: string,
	customProviderName?: string,
	usedRegion?: string,
): string {
	const providerPrefix =
		usedProvider === "custom" && customProviderName
			? customProviderName
			: FREE_TIER_PUBLIC_PROVIDER_ID;

	const modelName = usedInternalModel.startsWith("@")
		? usedInternalModel.slice(usedInternalModel.indexOf("/") + 1)
		: usedInternalModel;

	// Catalogue ids already carrying the public label (`vichar-v3`) render
	// bare — `vichar/vichar-v3` would just repeat it.
	if (modelName.startsWith(`${FREE_TIER_PUBLIC_PROVIDER_ID}-`)) {
		return usedRegion ? `${modelName}:${usedRegion}` : modelName;
	}

	const base = `${providerPrefix}/${modelName}`;
	return usedRegion ? `${base}:${usedRegion}` : base;
}
