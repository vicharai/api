import {
	AUTO_TOP_UP_DEFAULT_AMOUNT,
	AUTO_TOP_UP_DEFAULT_THRESHOLD,
	CREDIT_TOP_UP_MAX_AMOUNT,
	CREDIT_TOP_UP_MIN_AMOUNT,
	PLATFORM_FEE_PERCENTAGE,
} from "@llmgateway/shared";

import type { paths } from "./api/v1";

export type PublicBillingConfig =
	paths["/public/config"]["get"]["responses"][200]["content"]["application/json"]["billing"];

/** Built-in values used until (or when) the API's public config loads. */
export const DEFAULT_BILLING_CONFIG: PublicBillingConfig = {
	topUpMin: CREDIT_TOP_UP_MIN_AMOUNT,
	topUpMax: CREDIT_TOP_UP_MAX_AMOUNT,
	topUpPresets: [20, 50, 100, 250],
	platformFeePercent: PLATFORM_FEE_PERCENTAGE * 100,
	autoTopUpDefaultThreshold: AUTO_TOP_UP_DEFAULT_THRESHOLD,
	autoTopUpDefaultAmount: AUTO_TOP_UP_DEFAULT_AMOUNT,
};

export function calculateTopUpFees(amount: number, feePercent: number) {
	const platformFee = (amount * feePercent) / 100;
	return {
		platformFee: Math.round(platformFee * 100) / 100,
		totalAmount: Math.round((amount + platformFee) * 100) / 100,
	};
}
