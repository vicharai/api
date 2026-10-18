"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
	parseUsageMode,
	USAGE_MODE_OPTIONS,
	type UsageMode,
} from "@/lib/usage-mode";
import { cn } from "@/lib/utils";

/** Reads the current billing-mode view from the `mode` URL search param. */
export function useUsageMode(): UsageMode {
	const searchParams = useSearchParams();
	return parseUsageMode(searchParams.get("mode"));
}

/**
 * Segmented All / Credits toggle for usage pages. Stores the selection
 * in the `mode` URL search param so it survives navigation and can be shared.
 */
export function UsageModeSelector({ className }: { className?: string }) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const mode = parseUsageMode(searchParams.get("mode"));

	const setMode = (next: UsageMode) => {
		const params = new URLSearchParams(searchParams.toString());
		if (next === "total") {
			params.delete("mode");
		} else {
			params.set("mode", next);
		}
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	};

	return (
		<div
			className={cn(
				"inline-flex items-center rounded-full border border-border p-0.5",
				className,
			)}
		>
			{USAGE_MODE_OPTIONS.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => setMode(option.value)}
					title={
						option.value === "credits"
							? "Usage billed against your credit balance"
							: "All traffic"
					}
					className={cn(
						"inline-flex h-7 flex-1 items-center justify-center rounded-full px-3 sm:flex-none text-xs font-medium transition-colors focus-ring max-sm:h-9",
						mode === option.value
							? "bg-brand-soft text-brand-strong"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}
