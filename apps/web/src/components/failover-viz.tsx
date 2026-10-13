import { VicharMark } from "@/lib/vichar-logo";

/**
 * Architectural request-failover inspector & waterfall trace.
 * Monochrome + Vichar brand blue palette (no traffic-light red/green).
 */
export function FailoverViz() {
	return (
		<div
			aria-hidden="true"
			className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
		>
			{/* Header bar */}
			<div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/25 px-4 py-3">
				<div className="flex items-center gap-2 whitespace-nowrap font-mono text-xs">
					<span className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium text-foreground">
						POST
					</span>
					<span className="text-foreground">/v1/chat/completions</span>
				</div>
				<span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-brand/25 bg-brand/8 px-2.5 py-0.5 font-mono text-[11px] font-medium text-brand">
					<span className="size-1.5 rounded-full bg-brand" />
					200 OK · billed once
				</span>
			</div>

			{/* Topology diagram: HTML/CSS nodes + precision SVG connector curves */}
			<div className="grid grid-cols-[106px_1fr_202px] items-center gap-0 bg-secondary/10 px-4 py-5 sm:grid-cols-[118px_1fr_224px] sm:px-5">
				{/* Left node: Client */}
				<div className="relative z-10 rounded-xl border border-border bg-card p-3 shadow-2xs">
					<div className="flex items-center justify-between">
						<span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
							Client
						</span>
						<span className="size-1.5 rounded-full bg-brand" />
					</div>
					<p className="mt-1 text-xs font-semibold text-foreground">Your app</p>
					<p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
						sonnet-5.5
					</p>
				</div>

				{/* Center router + SVG bezier connectors */}
				<div className="relative flex items-center justify-center">
					<svg
						viewBox="0 0 220 132"
						className="h-[132px] w-full overflow-visible"
						preserveAspectRatio="none"
					>
						{/* Left wire: Client (0,66) -> Router (74,66) */}
						<line
							x1="0"
							y1="66"
							x2="74"
							y2="66"
							className="stroke-border"
							strokeWidth="1.5"
						/>
						<line
							x1="0"
							y1="66"
							x2="74"
							y2="66"
							className="failover-trace-in stroke-brand"
							strokeWidth="1.75"
							strokeDasharray="18 60"
						/>

						{/* Upper wire: Router (146,56) -> Primary route (220,30) — muted dashed */}
						<path
							d="M 146 56 C 180 56, 184 30, 220 30"
							fill="none"
							className="stroke-border"
							strokeWidth="1.5"
							strokeDasharray="3 3"
						/>

						{/* Lower wire: Router (146,76) -> Fallback route (220,102) — active brand blue */}
						<path
							d="M 146 76 C 180 76, 184 102, 220 102"
							fill="none"
							className="stroke-brand/35"
							strokeWidth="1.75"
						/>
						<path
							d="M 146 76 C 180 76, 184 102, 220 102"
							fill="none"
							className="failover-trace-out stroke-brand"
							strokeWidth="2"
							strokeDasharray="24 80"
						/>

						{/* Terminal dots */}
						<circle cx="0" cy="66" r="2.5" className="fill-brand" />
						<circle
							cx="220"
							cy="30"
							r="2.5"
							className="fill-muted-foreground/50"
						/>
						<circle cx="220" cy="102" r="3" className="fill-brand" />
					</svg>

					{/* Center hub card */}
					<div className="absolute flex items-center gap-2 rounded-xl border border-brand/30 bg-card px-2.5 py-2 shadow-[0_4px_16px_rgba(48,93,222,0.12)]">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
							<VicharMark className="size-3.5" />
						</span>
						<span className="pr-0.5 text-xs font-semibold text-foreground">
							Vichar
						</span>
					</div>
				</div>

				{/* Right stack: Route A (muted/skipped) + Route B (active/selected) */}
				<div className="relative z-10 space-y-3">
					{/* Route A — Primary (timed out, skipped) */}
					<div className="rounded-xl border border-border/80 bg-secondary/35 px-3 py-2.5 opacity-75">
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs font-medium text-muted-foreground line-through decoration-muted-foreground/50">
								Route A · Primary
							</span>
							<span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
								503 · 180ms
							</span>
						</div>
						<div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
							<span>Upstream timeout</span>
							<span>$0.00</span>
						</div>
					</div>

					{/* Route B — Backup (active, billed) */}
					<div className="rounded-xl border border-brand/40 bg-card px-3 py-2.5 shadow-[0_2px_12px_rgba(48,93,222,0.08)]">
						<div className="flex items-center justify-between gap-2">
							<span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
								<span className="size-1.5 rounded-full bg-brand" />
								Route B · Backup
							</span>
							<span className="rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-brand">
								200 OK
							</span>
						</div>
						<div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
							<span>310ms TTFT</span>
							<span className="font-medium text-foreground">Billed once</span>
						</div>
					</div>
				</div>
			</div>

			{/* Waterfall request timeline */}
			<div className="border-t border-border bg-card px-4 py-3.5 sm:px-5">
				<div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Execution trace</span>
					<span>Total: 490ms</span>
				</div>

				<div className="mt-2.5 space-y-2 font-mono text-[11px]">
					{/* Row 1: Attempt 1 */}
					<div className="grid grid-cols-[110px_1fr_68px] items-center gap-3">
						<span className="truncate text-muted-foreground">1. Route A</span>
						<div className="relative h-2 rounded-full bg-secondary">
							<div
								style={{ width: "36%" }}
								className="h-full rounded-full bg-muted-foreground/35"
							/>
						</div>
						<span className="text-right text-muted-foreground">180ms</span>
					</div>

					{/* Row 2: Switchover */}
					<div className="grid grid-cols-[110px_1fr_68px] items-center gap-3">
						<span className="truncate text-muted-foreground">2. Reroute</span>
						<div className="relative h-2 rounded-full bg-secondary">
							<div
								style={{ left: "36%", width: "5%" }}
								className="absolute top-0 h-full rounded-full bg-brand/60"
							/>
						</div>
						<span className="text-right text-muted-foreground">+12ms</span>
					</div>

					{/* Row 3: Attempt 2 */}
					<div className="grid grid-cols-[110px_1fr_68px] items-center gap-3">
						<span className="truncate font-medium text-foreground">
							3. Route B
						</span>
						<div className="relative h-2 overflow-hidden rounded-full bg-secondary">
							<div
								style={{ left: "41%", width: "59%" }}
								className="failover-bar-pulse absolute top-0 h-full rounded-full bg-brand"
							/>
						</div>
						<span className="text-right font-medium text-brand">310ms</span>
					</div>
				</div>
			</div>
		</div>
	);
}
