import { cn } from "@/lib/utils";

const BAR_HEIGHTS = [
	42, 65, 38, 72, 55, 80, 48, 62, 35, 70, 58, 84, 44, 66, 52, 74, 40, 60, 78,
	50, 68, 46, 76, 56,
];

/** Skeleton shaped like a bar chart so loading states read as the real layout. */
export function ChartSkeleton({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"flex h-[350px] animate-pulse flex-col justify-end gap-3 px-4 pb-4 pt-6",
				className,
			)}
			aria-hidden="true"
		>
			<div className="flex min-h-0 flex-1 items-end gap-1.5">
				{BAR_HEIGHTS.map((h, i) => (
					<div
						key={i}
						className="min-w-0 flex-1 rounded-t-sm bg-muted"
						style={{ height: `${h}%` }}
					/>
				))}
			</div>
			<div className="h-px w-full bg-border" />
			<div className="flex justify-between">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="h-2 w-9 rounded bg-muted" />
				))}
			</div>
		</div>
	);
}

/** Skeleton rows for tables while data loads. */
export function TableSkeleton({
	className,
	rows = 6,
}: {
	className?: string;
	rows?: number;
}) {
	return (
		<div
			className={cn(
				"flex h-[350px] animate-pulse flex-col gap-2.5 px-4 py-5",
				className,
			)}
			aria-hidden="true"
		>
			{Array.from({ length: rows }).map((_, i) => (
				<div key={i} className="flex items-center gap-3">
					<div className="h-3.5 w-24 rounded bg-muted" />
					<div className="h-3.5 min-w-0 flex-1 rounded bg-muted" />
					<div className="h-3.5 w-16 rounded bg-muted" />
					<div className="h-3.5 w-12 rounded bg-muted" />
				</div>
			))}
		</div>
	);
}
