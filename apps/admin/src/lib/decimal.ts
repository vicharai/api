/**
 * Exact decimal-string helpers for catalogue prices. Prices are stored per
 * token in `e-6` form ("1.4e-6" = $1.40 per 1M tokens); the UI edits them as
 * $/1M. Converting through strings avoids float drift such as 1.4e-6 * 1e6.
 */

const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;

/** A non-negative plain decimal such as "1", "0.075" or "12.50". */
export const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

/** Shifts a decimal string by 10^shift and returns it in plain notation. */
export function shiftDecimal(value: string, shift: number): string | null {
	const match = DECIMAL.exec(value.trim());
	if (!match) {
		return null;
	}
	const [, sign, int = "", frac = "", exp = "0"] = match;
	if (int === "" && frac === "") {
		return null;
	}
	const digits = `${int}${frac}`.replace(/^0+/, "");
	if (digits === "") {
		return "0";
	}
	// value = digits × 10^power
	const power = Number(exp) - frac.length + shift;
	let out: string;
	if (power >= 0) {
		out = digits + "0".repeat(power);
	} else {
		const point = digits.length + power;
		out =
			point > 0
				? `${digits.slice(0, point)}.${digits.slice(point)}`
				: `0.${"0".repeat(-point)}${digits}`;
	}
	if (out.includes(".")) {
		out = out.replace(/0+$/, "").replace(/\.$/, "");
	}
	return `${sign === "-" ? "-" : ""}${out}`;
}

/** "1.40" ($/1M) → "1.4e-6" (per token). Empty input → null. */
export function perMillionToPerToken(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === "") {
		return null;
	}
	const normalized = shiftDecimal(trimmed, 0);
	if (normalized === null) {
		return null;
	}
	return normalized === "0" ? "0" : `${normalized}e-6`;
}

/** "1.4e-6" or "0.0000014" (per token) → "1.4" ($/1M). */
export function perTokenToPerMillion(value: string | null | undefined): string {
	if (value === null || value === undefined || value === "") {
		return "";
	}
	return shiftDecimal(value, 6) ?? "";
}

/** Normalizes a flat USD amount to a plain decimal string, or null. */
export function plainDecimal(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === "") {
		return null;
	}
	return shiftDecimal(trimmed, 0);
}

/** Adds two money amounts in cents to avoid float rounding in previews. */
export function addMoney(a: number, b: number): number {
	return (Math.round(a * 100) + Math.round(b * 100)) / 100;
}
