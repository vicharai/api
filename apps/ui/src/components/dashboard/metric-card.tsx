"use client";

import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { motion } from "motion/react";
import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { Skeleton } from "@/lib/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/lib/components/tooltip";
import { cn } from "@/lib/utils";

// Legacy accent names ("purple", "magenta", "green", …) are kept as aliases
// so existing call sites keep working — they resolve onto the Vichar ramp.
type Accent =
	| "brand"
	| "purple"
	| "violet"
	| "magenta"
	| "orange"
	| "blue"
	| "green"
	| "emerald"
	| "amber"
	| "teal"
	| "coral";

const accentColors: Record<Accent, string> = {
	brand: "var(--chart-1)",
	blue: "var(--chart-1)",
	purple: "var(--brand-bright)",
	violet: "var(--brand-strong)",
	magenta: "var(--chart-2)",
	teal: "var(--chart-2)",
	orange: "var(--chart-4)",
	coral: "var(--chart-4)",
	amber: "var(--chart-3)",
	green: "var(--success)",
	emerald: "var(--success)",
};

/** Whether a rising value is good news, bad news, or neither. */
export type DeltaTone = "up-good" | "up-bad" | "neutral";

export const metricCardVariants = {
	hidden: { opacity: 0, y: 10 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
	},
} as const;

function Sparkline({ trend, color }: { trend: number[]; color: string }) {
	const gradientId = useId();
	const chartData = trend.map((value, index) => ({ index, value }));

	return (
		<ResponsiveContainer width="100%" height="100%">
			<AreaChart
				data={chartData}
				margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
			>
				<defs>
					<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={color} stopOpacity={0.28} />
						<stop offset="100%" stopColor={color} stopOpacity={0} />
					</linearGradient>
				</defs>
				<Area
					type="monotone"
					dataKey="value"
					stroke={color}
					strokeWidth={1.75}
					fill={`url(#${gradientId})`}
					isAnimationActive={false}
					dot={false}
				/>
			</AreaChart>
		</ResponsiveContainer>
	);
}

function DeltaBadge({
	delta,
	tone,
	label,
}: {
	delta: number;
	tone: DeltaTone;
	label: string;
}) {
	const flat = Math.abs(delta) < 0.05;
	const good = tone === "up-good" ? delta > 0 : delta < 0;
	const toneClass =
		flat || tone === "neutral"
			? "bg-muted text-muted-foreground ring-border"
			: good
				? "bg-success/10 text-success ring-success/20"
				: "bg-destructive/10 text-destructive ring-destructive/20";
	const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

	return (
		<span
			title={label}
			className={cn(
				"inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset",
				toneClass,
			)}
		>
			<Icon className="size-3" />
			{Math.abs(delta) >= 1000 ? ">999" : Math.abs(delta).toFixed(1)}%
		</span>
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
	deltaTone = "up-good",
	trend,
	isLoading,
	className,
}: {
	label: string;
	value: string;
	subtitle?: React.ReactNode;
	icon?: React.ReactNode;
	accent?: Accent;
	tooltip?: string;
	/** Percent change vs the previous period; null when not computable. */
	delta?: number | null;
	deltaLabel?: string;
	deltaTone?: DeltaTone;
	/** Daily values for the selected period, rendered as a sparkline. */
	trend?: number[];
	isLoading?: boolean;
	className?: string;
}) {
	const accentColor = accentColors[accent ?? "brand"];
	const showTrend =
		!isLoading && trend && trend.length > 1 && trend.some((v) => v !== 0);
	const showDelta =
		!isLoading && typeof delta === "number" && Number.isFinite(delta);

	return (
		<motion.div
			variants={metricCardVariants}
			whileHover={{ y: -2 }}
			transition={{ type: "spring", stiffness: 400, damping: 30 }}
			style={{ "--accent": accentColor } as React.CSSProperties}
			className={cn(
				"group/metric relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs transition-[box-shadow,border-color] duration-300 hover:[border-color:color-mix(in_srgb,var(--accent)_35%,var(--border))] hover:shadow-md",
				className,
			)}
		>
			{/* Accent glow in the corner, brighter on hover. */}
			<span
				aria-hidden="true"
				className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full opacity-60 blur-2xl transition-opacity duration-300 group-hover/metric:opacity-100"
				style={{
					background:
						"radial-gradient(closest-side, color-mix(in srgb, var(--accent) 16%, transparent), transparent)",
				}}
			/>
			<div className="relative flex items-center gap-2.5 px-4 pt-4">
				{icon ? (
					<span
						className="flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4"
						style={{
							color: "var(--accent)",
							backgroundColor:
								"color-mix(in srgb, var(--accent) 11%, transparent)",
							boxShadow:
								"inset 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent)",
						}}
					>
						{icon}
					</span>
				) : null}
				<p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
					{label}
				</p>
				{tooltip ? (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={`More info about ${label}`}
									className="inline-flex shrink-0 rounded text-muted-foreground/50 transition-colors hover:text-muted-foreground focus-ring"
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
					<span className="ml-auto">
						<DeltaBadge delta={delta!} tone={deltaTone} label={deltaLabel} />
					</span>
				) : null}
			</div>
			<div className="relative flex-1 px-4 pt-3">
				{isLoading ? (
					<Skeleton className="h-8 w-28" />
				) : (
					<p className="truncate font-display text-[26px] font-semibold leading-8 tracking-[-0.02em] tabular-nums">
						{value}
					</p>
				)}
				{isLoading ? (
					<Skeleton className="mt-2 h-3 w-32" />
				) : subtitle ? (
					<div
						className="mt-1 truncate text-xs text-muted-foreground"
						title={typeof subtitle === "string" ? subtitle : undefined}
					>
						{subtitle}
					</div>
				) : null}
			</div>
			<div className={showTrend ? "relative mt-2 h-12" : "h-4"}>
				{showTrend ? <Sparkline trend={trend} color={accentColor} /> : null}
			</div>
		</motion.div>
	);
}
