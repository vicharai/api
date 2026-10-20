import { getGcpServiceAccountAccessToken } from "@llmgateway/actions";
import {
	providerTemplateUsesServiceAccount,
	type ProviderTemplate,
} from "@llmgateway/shared";

import type { Provider } from "@llmgateway/models";

/** Where a DB-only custom provider's requests go and which API style they speak. */
export interface CustomCarrierRoute {
	baseUrl: string;
	template: ProviderTemplate;
}

/**
 * Built-in provider whose wire format serves the request. OpenAI-compatible
 * carriers keep their own id, which every request/response builder treats as
 * the generic OpenAI-compatible format.
 */
export function getWireProvider(
	usedProvider: Provider,
	carrier: CustomCarrierRoute | undefined,
): Provider {
	return carrier?.template.transportProvider ?? usedProvider;
}

/** Provider id whose endpoint shape `getProviderEndpoint` builds. */
export function getEndpointProvider(
	usedProvider: Provider,
	carrier: CustomCarrierRoute | undefined,
): Provider {
	if (!carrier) {
		return usedProvider;
	}
	return carrier.template.transportProvider ?? "custom";
}

/**
 * Swaps a carrier's service-account JSON for a short-lived access token; any
 * other credential is returned unchanged.
 */
export async function resolveCarrierToken(
	carrier: CustomCarrierRoute | undefined,
	token: string,
	credentialConfig: Record<string, string> | null | undefined,
): Promise<string> {
	if (
		carrier &&
		providerTemplateUsesServiceAccount(carrier.template, credentialConfig)
	) {
		return await getGcpServiceAccountAccessToken(token);
	}
	return token;
}
