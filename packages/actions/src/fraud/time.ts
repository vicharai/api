export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** `ms` before `from`. */
export function msBefore(from: Date, ms: number): Date {
	return new Date(from.getTime() - ms);
}
