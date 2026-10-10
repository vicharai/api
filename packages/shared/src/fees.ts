export interface FeeBreakdown {
	baseAmount: number;
	platformFee: number;
	totalAmount: number;
}

export interface FeeCalculationInput {
	amount: number;
}

export const CREDIT_TOP_UP_MIN_AMOUNT = 10;
export const CREDIT_TOP_UP_MAX_AMOUNT = 5000;

export const AUTO_TOP_UP_DEFAULT_THRESHOLD = 5;
export const AUTO_TOP_UP_DEFAULT_AMOUNT = 20;

export function isCreditTopUpAmountInRange(amount: number): boolean {
	return (
		Number.isInteger(amount) &&
		amount >= CREDIT_TOP_UP_MIN_AMOUNT &&
		amount <= CREDIT_TOP_UP_MAX_AMOUNT
	);
}

export function getMaxCreditTopUpAmount(grossAllowanceUsd: number): number {
	if (!Number.isFinite(grossAllowanceUsd)) {
		return CREDIT_TOP_UP_MAX_AMOUNT;
	}

	let low = 0;
	let high = CREDIT_TOP_UP_MAX_AMOUNT;
	while (low < high) {
		const candidate = Math.ceil((low + high) / 2);
		if (calculateFees({ amount: candidate }).totalAmount <= grossAllowanceUsd) {
			low = candidate;
		} else {
			high = candidate - 1;
		}
	}

	return low;
}

export const PLATFORM_FEE_PERCENTAGE = 0.05;

export function calculateFees(input: FeeCalculationInput): FeeBreakdown {
	const { amount } = input;

	const platformFee = amount * PLATFORM_FEE_PERCENTAGE;
	const totalAmount = amount + platformFee;

	return {
		baseAmount: amount,
		platformFee: Math.round(platformFee * 100) / 100,
		totalAmount: Math.round(totalAmount * 100) / 100,
	};
}
