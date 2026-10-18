import {
	DEFAULT_BILLING_CONFIG,
	type PublicBillingConfig,
} from "@/lib/billing-config";
import { useApi } from "@/lib/fetch-client";

/** Operator-configured top-up limits and fee, with built-in defaults as fallback. */
export function useBillingConfig(): PublicBillingConfig {
	const api = useApi();
	const { data } = api.useQuery(
		"get",
		"/public/config",
		{},
		{ staleTime: 5 * 60 * 1000 },
	);
	return data?.billing ?? DEFAULT_BILLING_CONFIG;
}
