import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

const usd = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

const usdPrecise = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 4,
});

/** USD amount; accepts the decimal strings the API returns for money. */
export function formatUsd(
	value: number | string | null | undefined,
	precise = false,
): string {
	if (value === null || value === undefined || value === "") {
		return "—";
	}
	const n = typeof value === "string" ? Number(value) : value;
	if (!Number.isFinite(n)) {
		return "—";
	}
	return (precise ? usdPrecise : usd).format(n);
}

export function formatPercent(
	value: number | null | undefined,
	digits = 1,
): string {
	if (value === null || value === undefined || !Number.isFinite(value)) {
		return "—";
	}
	return `${value.toFixed(digits)}%`;
}

export function formatMs(value: number | null | undefined): string {
	if (value === null || value === undefined) {
		return "—";
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(2)}s`;
	}
	return `${Math.round(value)}ms`;
}

const dateTime = new Intl.DateTimeFormat("en-US", {
	dateStyle: "medium",
	timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function formatDateTime(value: string | Date | null | undefined) {
	if (!value) {
		return "—";
	}
	const d = typeof value === "string" ? new Date(value) : value;
	return Number.isNaN(d.getTime()) ? "—" : dateTime.format(d);
}

export function formatDate(value: string | Date | null | undefined) {
	if (!value) {
		return "—";
	}
	const d = typeof value === "string" ? new Date(value) : value;
	return Number.isNaN(d.getTime()) ? "—" : dateOnly.format(d);
}

/** Pulls the human message out of an openapi-fetch error body. */
export function errorMessage(error: unknown): string {
	if (typeof error === "string") {
		return error;
	}
	if (error && typeof error === "object") {
		const record = error as Record<string, unknown>;
		if (typeof record.message === "string") {
			return record.message;
		}
		if (record.error && typeof record.error === "object") {
			const nested = record.error as Record<string, unknown>;
			if (typeof nested.message === "string") {
				return nested.message;
			}
		}
		if (typeof record.error === "string") {
			return record.error;
		}
	}
	if (error instanceof Error) {
		return error.message;
	}
	return "Something went wrong";
}

export function downloadCsv(filename: string, csv: string) {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}
