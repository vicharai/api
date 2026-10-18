import { z } from "zod";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query-string date. A bare YYYY-MM-DD is a whole UTC day: "start" maps it
 * to 00:00 and "end" to the last millisecond, so both bounds are inclusive.
 */
export function dateQuery(bound: "start" | "end") {
	return z
		.string()
		.refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
		.transform((value) => {
			const date = new Date(value);
			if (bound === "end" && DATE_ONLY.test(value)) {
				date.setUTCHours(23, 59, 59, 999);
			}
			return date;
		});
}

export const booleanQuery = z
	.enum(["true", "false"])
	.transform((value) => value === "true");

// Escapes LIKE wildcards so user input matches literally.
export function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
