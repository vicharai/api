"use client";

import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { motion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { Skeleton } from "@/lib/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/lib/components/tooltip";
import { cn } from "@/lib/utils";

// Google palette per metric; legacy accent names stay as aliases.
type Accent =
	| "brand"
	| "blue"
	| "green"
	| "yellow"
	| "red"
	| "purple"
	| "violet"
	| "magenta"
	| "orange"
	| "emerald"
	| "amber"
	| "teal"
	| "coral";

type Hue = "blue" | "green" | "yellow" | "red" | "purple";

const accentHue: Record<Accent, Hue> = {
	brand: "blue",
	blue: "blue",
	green: "green",
	emerald: "green",
	teal: "green",
	yellow: "yellow",
	amber: "yellow",
	orange: "yellow",
	red: "red",
	coral: "red",
	magenta: "red",
	purple: "purple",
	violet: "purple",
};

const hueStyles: Record<Hue, { chip: string; line: string }> = {
	blue: {
		chip: "bg-google-blue-soft text-google-blue",
		line: "var(--chart-1)",
	},
	red: { chip: "bg-google-red-soft text-google-red", line: "var(--chart-2)" },
	yellow: {
		chip: "bg-google-yellow-soft text-google-yellow",
		line: "var(--chart-3)",
	},
	green: {
		chip: "bg-google-green-soft text-google-green",
		line: "var(--chart-4)",
	},
	purple: {
		chip: "bg-[color-mix(in_srgb,var(--chart-5)_14%,transparent)] text-chart-5",
		line: "var(--chart-5)",
	},
};

/** Whether a rising value is good news, bad news, or neither. */
export type DeltaTone = "up-good" | "up-bad" | "neutral";

export const metricCardVariants = {
	hidden: { opacity: 0, y: 4 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.25, ease: [0.2, 0, 0, 1] },
	},
} as const;

function Sparkline({ trend, color }: { trend: number[]; color: string }) {
	const chartData = trend.map((value, index) => ({ index, value }));

	return (
		<ResponsiveContainer width="100%" height="100%">
			<AreaChart
				data={chartData}
				margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
			>
				<Area
					type="monotone"
					dataKey="value"
					stroke={color}
					strokeWidth={2}
					fill={color}
					fillOpacity={0.1}
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
			? "bg-muted text-muted-foreground"
			: good
				? "bg-success-soft text-success"
				: "bg-destructive-soft text-destructive";
	const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

	return (
		<span
			title={label}
			className={cn(
				"inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full px-2 text-xs font-medium tabular-nums",
				toneClass,
			)}
		>
			<Icon className="size-3.5" />
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
	const hue = hueStyles[accentHue[accent ?? "brand"]];
	const showTrend =
		!isLoading && trend && trend.length > 1 && trend.some((v) => v !== 0);
	const showDelta =
		!isLoading && typeof delta === "number" && Number.isFinite(delta);

	return (
		<motion.div
			variants={metricCardVariants}
			className={cn(
				"relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground transition-shadow duration-200 hover:shadow-elevation-1",
				className,
			)}
		>
			<div className="flex items-center gap-2 px-4 pt-4 sm:gap-3 sm:px-5 sm:pt-5">
				{icon ? (
					<span
						className={cn(
							"flex size-8 shrink-0 items-center justify-center rounded-full sm:size-9 [&_svg]:size-4 sm:[&_svg]:size-[18px]",
							hue.chip,
						)}
					>
						{icon}
					</span>
				) : null}
				<p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
					{label}
				</p>
				{tooltip ? (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={`More info about ${label}`}
									className="inline-flex shrink-0 rounded-full text-tertiary transition-colors hover:text-muted-foreground focus-ring"
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
			<div className="flex-1 px-4 pt-3 sm:px-5 sm:pt-4">
				{isLoading ? (
					<Skeleton className="h-9 w-28" />
				) : (
					<p className="truncate font-display text-[24px] font-normal leading-8 text-heading tabular-nums sm:text-[28px] sm:leading-9">
						{value}
					</p>
				)}
				{isLoading ? (
					<Skeleton className="mt-2 h-3 w-32" />
				) : subtitle ? (
					<div
						className="mt-1 truncate text-[13px] text-muted-foreground"
						title={typeof subtitle === "string" ? subtitle : undefined}
					>
						{subtitle}
					</div>
				) : null}
			</div>
			<div className={showTrend ? "mt-3 h-11" : "h-5"}>
				{showTrend ? <Sparkline trend={trend} color={hue.line} /> : null}
			</div>
		</motion.div>
	);
}
