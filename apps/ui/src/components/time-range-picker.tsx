"use client";

import { Lock } from "lucide-react";

import { useDashboardNavigation } from "@/hooks/useDashboardNavigation";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/lib/components/tooltip";
import { useAppConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

const FREE_RANGES = [
	{ value: "1h", label: "1h" },
	{ value: "4h", label: "4h" },
	{ value: "24h", label: "24h" },
	{ value: "7d", label: "7d" },
] as const;

const PRO_RANGES = [{ value: "30d", label: "30d" }] as const;

export type TimeRangeValue =
	(typeof FREE_RANGES)[number]["value"] | (typeof PRO_RANGES)[number]["value"];

interface TimeRangePickerProps {
	value: TimeRangeValue;
	onChange: (value: TimeRangeValue) => void;
	// Restrict which ranges are shown. Defaults to all ranges.
	allowedValues?: readonly TimeRangeValue[];
}

export function TimeRangePicker({
	value,
	onChange,
	allowedValues,
}: TimeRangePickerProps) {
	const config = useAppConfig();
	const { selectedOrganization } = useDashboardNavigation();
	const isEnterprise = selectedOrganization?.enterpriseAccess === true;
	const isGated = config.hosted && !isEnterprise;

	const freeRanges = allowedValues
		? FREE_RANGES.filter((r) => allowedValues.includes(r.value))
		: FREE_RANGES;
	const proRanges = allowedValues
		? PRO_RANGES.filter((r) => allowedValues.includes(r.value))
		: PRO_RANGES;

	return (
		<TooltipProvider>
			<div className="flex w-full items-center rounded-full border border-border p-0.5 sm:inline-flex sm:w-auto">
				{freeRanges.map((range) => (
					<button
						key={range.value}
						type="button"
						onClick={() => onChange(range.value)}
						className={cn(
							"inline-flex h-7 flex-1 items-center justify-center rounded-full px-3 text-xs font-medium transition-colors focus-ring max-sm:h-9 sm:flex-none",
							value === range.value
								? "bg-brand-soft text-brand-strong"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{range.label}
					</button>
				))}
				{proRanges.map((range) =>
					isGated ? (
						<Tooltip key={range.value}>
							<TooltipTrigger asChild>
								<button
									type="button"
									disabled
									aria-disabled="true"
									className="inline-flex h-7 flex-1 cursor-not-allowed items-center justify-center gap-1 rounded-full px-3 text-xs font-medium text-muted-foreground/40 max-sm:h-9 sm:flex-none"
								>
									{range.label}
									<Lock className="h-3 w-3" />
								</button>
							</TooltipTrigger>
							<TooltipContent
								side="bottom"
								className="max-w-[200px] text-center"
							>
								<p className="text-xs font-medium">Extended analytics</p>
								<p className="text-xs text-muted-foreground">
									Available on Enterprise or self-hosted
								</p>
							</TooltipContent>
						</Tooltip>
					) : (
						<button
							key={range.value}
							type="button"
							onClick={() => onChange(range.value)}
							className={cn(
								"inline-flex h-7 flex-1 items-center justify-center rounded-full px-3 text-xs font-medium transition-colors focus-ring max-sm:h-9 sm:flex-none",
								value === range.value
									? "bg-brand-soft text-brand-strong"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{range.label}
						</button>
					),
				)}
			</div>
		</TooltipProvider>
	);
}
