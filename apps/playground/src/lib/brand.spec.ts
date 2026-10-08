import { describe, expect, test } from "vitest";

import manifest from "@/app/manifest";

import { BRAND } from "./brand";
import { comparisons, US } from "./comparisons";

describe("Lounge brand", () => {
	test("brand constants carry the Lounge identity", () => {
		expect(BRAND.name).toBe("Lounge");
		expect(BRAND.fullName).toBe("Lounge by Vichar");
		expect(BRAND.publisher).toBe("Vichar");
		expect(BRAND.tagline).toBe("Every frontier model. One membership.");
		expect(BRAND.url).toBe("https://app.vichar.io");
	});

	test("web manifest uses the Lounge lockup", () => {
		const m = manifest();
		expect(m.name).toBe(BRAND.fullName);
		expect(m.short_name).toBe(BRAND.name);
	});

	test("comparison pages present the product as Lounge", () => {
		expect(US.name).toBe(BRAND.name);
		for (const comparison of comparisons) {
			expect(comparison.metaTitle).toContain("Lounge");
		}
	});

	test("no comparison copy still uses the pre-rebrand product name", () => {
		const serialized = JSON.stringify(comparisons);
		expect(serialized).not.toContain("Vichar Chat");
		expect(serialized).not.toContain("Vichar Playground");
	});
});
