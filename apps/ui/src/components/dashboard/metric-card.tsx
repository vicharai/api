"use client";

import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { Skeleton } from "@/lib/components/skeleton";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/lib/components/tooltip";

// Legacy accent names ("blue", "green", "emerald", "amber") are kept as
// aliases so existing call sites keep working — they resolve onto the Vichar
// ramp.
type Accent =
	| "brand"
	| "purple"
	| "violet"
	| "magenta"
	| "orange"
	| "blue"
	| "green"
	| "emerald"
	| "amber";

// Vichar ramp — blue family for primary metrics, orange reserved for
// secondary emphasis, emerald only where the meaning is "saved".
const accentColors: Record<Accent, string> = {
	brand: "#305dde",
	purple: "#4f80ff",
	violet: "#93b8ff",
	magenta: "#0ea5e9",
	orange: "#ff5e00",
	blue: "#305dde",
	green: "#10b981",
	emerald: "#10b981",
	amber: "#ff6a1a",
};

function Sparkline({ trend, color }: { trend: number[]; color: string }) {
	const gradientId = useId();
	const chartData = trend.map((value, index) => ({ index, value }));

	return (
		<ResponsiveContainer width="100%" height="100%">
			<AreaChart
				data={chartData}
				margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
			>
				<defs>
					<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
						<stop offset="5%" stopColor={color} stopOpacity={0.3} />
						<stop offset="95%" stopColor={color} stopOpacity={0.02} />
					</linearGradient>
				</defs>
				<Area
					type="monotone"
					dataKey="value"
					stroke={color}
					strokeWidth={1.5}
					fill={`url(#${gradientId})`}
					isAnimationActive={false}
					dot={false}
				/>
			</AreaChart>
		</ResponsiveContainer>
	);
}

export function MetricCard({
	label,
	value,
	subtitle,
	icon,
	accent,
	tooltip,
	delta,
	deltaLabel = "vs previous period",
	trend,
	isLoading,
}: {
	label: string;
	value: string;
	subtitle?: string;
	icon?: React.ReactNode;
	accent?: Accent;
	tooltip?: string;
	/** Percent change vs the previous period; null when not computable. */
	delta?: number | null;
	deltaLabel?: string;
	/** Daily values for the selected period, rendered as a sparkline. */
	trend?: number[];
	isLoading?: boolean;
}) {
	const accentColor = accentColors[accent ?? "brand"];
	const showTrend =
		!isLoading && trend && trend.length > 1 && trend.some((v) => v !== 0);
	const showDelta =
		!isLoading && typeof delta === "number" && Number.isFinite(delta);

	return (
		<SquircleSurface className="border border-border p-1 shadow-sm [--card-clip-radius:13px] sm:[--card-clip-radius:15px]">
			<div className="flex items-center gap-1.5 pb-1.5 pl-3.5 pr-3 pt-1">
				{icon ? (
					<span className="shrink-0 text-muted-foreground [&_svg]:size-3.5 [&_svg]:block">
						{icon}
					</span>
				) : null}
				<p className="truncate text-sm font-medium text-foreground/80">
					{label}
				</p>
				{tooltip ? (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={`More info about ${label}`}
									className="inline-flex shrink-0 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
								>
									<Info className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="top" className="max-w-xs text-center">
								{tooltip}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				) : null}
				{showDelta ? (
					<span
						title={deltaLabel}
						className={
							"ml-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums " +
							(delta! >= 0
								? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
								: "bg-red-500/10 text-red-600 dark:text-red-400")
						}
					>
						{delta! >= 0 ? (
							<ArrowUpRight className="size-3" />
						) : (
							<ArrowDownRight className="size-3" />
						)}
						{Math.abs(delta!) >= 1000 ? ">999" : Math.abs(delta!).toFixed(1)}%
					</span>
				) : null}
			</div>
			<SquirclePanel className="flex-1 px-4 pt-3 pb-0 [--card-clip-radius:11px] sm:[--card-clip-radius:13px]">
				{isLoading ? (
					<Skeleton className="h-7 w-24 sm:h-8" />
				) : (
					<p className="truncate text-xl font-medium tabular-nums tracking-tight sm:text-2xl">
						{value}
					</p>
				)}
				{isLoading ? (
					<Skeleton className="mt-1.5 h-3 w-32" />
				) : subtitle ? (
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{subtitle}
					</p>
				) : null}
				<div className={showTrend ? "-mx-4 mt-1 h-9" : "h-2"}>
					{showTrend ? <Sparkline trend={trend} color={accentColor} /> : null}
				</div>
			</SquirclePanel>
		</SquircleSurface>
	);
}
