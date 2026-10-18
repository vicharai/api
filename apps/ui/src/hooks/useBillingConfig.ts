import { DEFAULT_BILLING_CONFIG } from "@/lib/billing-config";
import { useContractApi } from "@/lib/r3-contract";

import type { PublicBillingConfig } from "@/lib/r3-contract";

/** Operator-configured top-up limits and fee, with built-in defaults as fallback. */
export function useBillingConfig(): PublicBillingConfig {
	const api = useContractApi();
	const { data } = api.useQuery(
		"get",
		"/public/config",
		{},
		{ staleTime: 5 * 60 * 1000 },
	);
	return data?.billing ?? DEFAULT_BILLING_CONFIG;
}
