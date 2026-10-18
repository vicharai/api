import { describe, expect, it } from "vitest";

import { models } from "./models.js";

/**
 * Recursively assert every price-bearing field of a value is zero. A field
 * counts as a price when its key contains "price" (case-insensitive); once
 * inside such a field, every nested scalar must be zero (covers
 * `perSecondPrice` records and per-region price overrides). Robust to new
 * price fields without enumerating them.
 */
function allPricesZero(value: unknown, underPriceKey = false): boolean {
	if (value === undefined || value === null) {
		return true;
	}
	if (typeof value === "number") {
		return !underPriceKey || value === 0;
	}
	if (typeof value === "string") {
		return !underPriceKey || Number(value) === 0;
	}
	if (Array.isArray(value)) {
		return value.every((item) => allPricesZero(item, underPriceKey));
	}
	if (typeof value === "object") {
		return Object.entries(value).every(([key, val]) =>
			allPricesZero(val, underPriceKey || /price/i.test(key)),
		);
	}
	return true;
}

describe("free model catalog invariant", () => {
	// A `free: true` model must never produce a billable charge. Free-pool
	// mappings are entirely zero-priced; the only exception is the paid-priced
	// Cloudflare fallback leg, whose token prices exist solely to feed the
	// internal daily free-tier budget — the gateway zeroes every cost field on
	// free-model logs, so it can never bill the user. Per-request, per-second
	// and per-image prices are forbidden on every leg: they would flip
	// `isModelTrulyFree` off and break the zero-credit path. If a model needs a
	// genuinely paid provider, split it into a free and a paid canonical model
	// instead — sandbox/test-mode end-user wallets rely on this: they may spend
	// only on free models, and a billable mapping under a free model would let
	// test credits pay for real provider calls.
	it("free-pool mappings are fully zero-priced", () => {
		const offenders = models
			.filter((model) => "free" in model && model.free)
			.filter((model) =>
				model.providers.some(
					(p) => p.providerId !== "cloudflare" && !allPricesZero(p),
				),
			)
			.map((model) => model.id);

		expect(offenders).toEqual([]);
	});

	it("no free-model leg bills per request, second, or image", () => {
		const offenders = models
			.filter((model) => "free" in model && model.free)
			.filter((model) =>
				model.providers.some((p) => {
					// These price fields exist only on some mapping variants.
					const fields = p as unknown as {
						requestPrice?: string | number;
						perSecondPrice?: Record<string, string | number>;
						perImagePrice?: Record<string, string | number>;
					};
					const requestPrice = Number(fields.requestPrice ?? 0) > 0;
					const perSecond = Object.values(fields.perSecondPrice ?? {}).some(
						(price) => Number(price) > 0,
					);
					const perImage = Object.values(fields.perImagePrice ?? {}).some(
						(price) => Number(price) > 0,
					);
					return requestPrice || perSecond || perImage;
				}),
			)
			.map((model) => model.id);

		expect(offenders).toEqual([]);
	});
});
