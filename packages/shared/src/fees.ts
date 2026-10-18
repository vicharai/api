import { platformConfigValue, type PlatformConfig } from "./platform-config.js";

export interface FeeBreakdown {
	baseAmount: number;
	platformFee: number;
	totalAmount: number;
}

export interface FeeCalculationInput {
	amount: number;
}

/** Built-in defaults; effective values come from the platform config. */
export const CREDIT_TOP_UP_MIN_AMOUNT = 20;
export const CREDIT_TOP_UP_MAX_AMOUNT = 5000;

export const AUTO_TOP_UP_DEFAULT_THRESHOLD = 5;
export const AUTO_TOP_UP_DEFAULT_AMOUNT = 20;

export const PLATFORM_FEE_PERCENTAGE = 0.05;

export function getCreditTopUpLimits(config?: PlatformConfig): {
	min: number;
	max: number;
} {
	return {
		min: platformConfigValue("billing.topUpMinAmount", config),
		max: platformConfigValue("billing.topUpMaxAmount", config),
	};
}

export function isCreditTopUpAmountInRange(
	amount: number,
	config?: PlatformConfig,
): boolean {
	const { min, max } = getCreditTopUpLimits(config);
	return Number.isInteger(amount) && amount >= min && amount <= max;
}

export function getMaxCreditTopUpAmount(
	grossAllowanceUsd: number,
	config?: PlatformConfig,
): number {
	const { max } = getCreditTopUpLimits(config);
	if (!Number.isFinite(grossAllowanceUsd)) {
		return max;
	}

	let low = 0;
	let high = max;
	while (low < high) {
		const candidate = Math.ceil((low + high) / 2);
		if (
			calculateFees({ amount: candidate }, config).totalAmount <=
			grossAllowanceUsd
		) {
			low = candidate;
		} else {
			high = candidate - 1;
		}
	}

	return low;
}

export function calculateFees(
	input: FeeCalculationInput,
	config?: PlatformConfig,
): FeeBreakdown {
	const { amount } = input;
	const feeRate =
		platformConfigValue("billing.platformFeePercent", config) / 100;

	const platformFee = amount * feeRate;
	const totalAmount = amount + platformFee;

	return {
		baseAmount: amount,
		platformFee: Math.round(platformFee * 100) / 100,
		totalAmount: Math.round(totalAmount * 100) / 100,
	};
}
