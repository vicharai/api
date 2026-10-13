/**
 * High-craft animated request-failover telemetry card.
 * Pure SVG + CSS keyframes; reduced-motion renders the completed failover state.
 */
export function FailoverViz() {
	return (
		<div
			aria-hidden="true"
			className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
		>
			{/* Top request telemetry bar */}
			<div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/30 px-4 py-2.5">
				<div className="flex min-w-0 items-center gap-2 font-mono text-xs">
					<span className="inline-flex shrink-0 items-center rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand">
						POST
					</span>
					<span className="truncate text-foreground">/v1/chat/completions</span>
				</div>
				<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-success">
					<span className="size-1.5 rounded-full bg-success" />
					200 OK · billed once
				</span>
			</div>

			{/* Routing topology canvas */}
			<div className="relative bg-secondary/15 px-3 py-4 sm:px-5 sm:py-5">
				<svg
					viewBox="0 0 580 232"
					className="w-full select-none overflow-visible"
				>
					<defs>
						<linearGradient
							id="vichar-node-grad"
							x1="0%"
							y1="0%"
							x2="100%"
							y2="100%"
						>
							<stop offset="0%" stopColor="#3b68e8" />
							<stop offset="100%" stopColor="#244bc5" />
						</linearGradient>
						<linearGradient
							id="success-line-grad"
							x1="0%"
							y1="0%"
							x2="100%"
							y2="0%"
						>
							<stop offset="0%" stopColor="#305dde" />
							<stop offset="100%" stopColor="#16a34a" />
						</linearGradient>
						<filter
							id="pulse-glow"
							x="-50%"
							y="-50%"
							width="200%"
							height="200%"
						>
							<feGaussianBlur stdDeviation="3" result="blur" />
							<feMerge>
								<feMergeNode in="blur" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>

					{/* Subtle background grid lines */}
					<g className="stroke-border/50" strokeWidth="1" strokeDasharray="2 4">
						<line x1="168" y1="16" x2="168" y2="216" />
						<line x1="374" y1="16" x2="374" y2="216" />
					</g>

					{/* Stage headers */}
					<text
						x="74"
						y="18"
						textAnchor="middle"
						className="fill-muted-foreground font-mono text-[10px] uppercase tracking-wider"
					>
						1. Request
					</text>
					<text
						x="272"
						y="18"
						textAnchor="middle"
						className="fill-muted-foreground font-mono text-[10px] uppercase tracking-wider"
					>
						2. Router
					</text>
					<text
						x="488"
						y="18"
						textAnchor="middle"
						className="fill-muted-foreground font-mono text-[10px] uppercase tracking-wider"
					>
						3. Upstream routes
					</text>

					{/* Connector wires (port-to-port, never inside nodes) */}
					{/* Wire 0: Client (136,120) -> Vichar (204,120) */}
					<path
						d="M 136 120 L 204 120"
						fill="none"
						className="stroke-brand/50"
						strokeWidth="2"
					/>

					{/* Wire A: Vichar (340,102) -> Route A (396,68) */}
					<path
						d="M 340 102 C 366 102, 368 68, 396 68"
						fill="none"
						className="stroke-destructive/45"
						strokeWidth="1.75"
						strokeDasharray="4 4"
					/>

					{/* Wire B: Vichar (340,138) -> Route B (396,172) */}
					<path
						d="M 340 138 C 366 138, 368 172, 396 172"
						fill="none"
						stroke="url(#success-line-grad)"
						strokeWidth="2.25"
					/>

					{/* Callout pill on Wire A */}
					<g transform="translate(342, 42)">
						<rect
							x="0"
							y="0"
							width="46"
							height="18"
							rx="9"
							className="fill-card stroke-border"
						/>
						<text
							x="23"
							y="12.5"
							textAnchor="middle"
							className="fill-muted-foreground font-mono text-[10px]"
						>
							try #1
						</text>
					</g>

					{/* Callout pill on Wire B */}
					<g transform="translate(338, 178)">
						<rect
							x="0"
							y="0"
							width="50"
							height="18"
							rx="9"
							className="fill-brand/10 stroke-brand/30"
						/>
						<text
							x="25"
							y="12.5"
							textAnchor="middle"
							className="fill-brand font-mono text-[10px] font-medium"
						>
							reroute
						</text>
					</g>

					{/* Animated packets */}
					<circle
						r="4.5"
						filter="url(#pulse-glow)"
						className="failover-packet-in fill-brand"
					/>
					<circle
						r="4.5"
						filter="url(#pulse-glow)"
						className="failover-packet-a fill-destructive"
					/>
					<circle
						r="5"
						filter="url(#pulse-glow)"
						className="failover-packet-b fill-success"
					/>

					{/* Node 1: Your app (x=12..136, y=78..162) */}
					<g transform="translate(12, 78)">
						<rect
							x="0"
							y="0"
							width="124"
							height="84"
							rx="12"
							className="fill-card stroke-border"
							strokeWidth="1.25"
						/>
						<text
							x="14"
							y="24"
							className="fill-muted-foreground font-mono text-[10px] uppercase tracking-wider"
						>
							SDK Client
						</text>
						<text
							x="14"
							y="45"
							className="fill-foreground text-[14px] font-semibold"
						>
							Your app
						</text>
						<rect
							x="14"
							y="56"
							width="96"
							height="18"
							rx="5"
							className="fill-secondary"
						/>
						<text
							x="22"
							y="68.5"
							className="fill-muted-foreground font-mono text-[10px]"
						>
							stream: true
						</text>
						{/* Output port */}
						<circle
							cx="124"
							cy="42"
							r="3.5"
							className="fill-brand stroke-card"
							strokeWidth="1.5"
						/>
					</g>

					{/* Node 2: Vichar Router (x=204..340, y=72..168) */}
					<g transform="translate(204, 72)">
						<rect
							x="-4"
							y="-4"
							width="144"
							height="104"
							rx="16"
							className="fill-brand/10"
						/>
						<rect
							x="0"
							y="0"
							width="136"
							height="96"
							rx="13"
							fill="url(#vichar-node-grad)"
						/>
						{/* Cloud mark + title */}
						<g transform="translate(14, 15) scale(0.78)" className="text-white">
							<path
								d="M17.5 18.4H9a7 7 0 1 1 6.71-8.7h1.79a4.35 4.35 0 1 1 0 8.7Z"
								fill="currentColor"
							/>
						</g>
						<text
							x="38"
							y="29"
							className="fill-white text-[14px] font-semibold"
						>
							Vichar
						</text>
						<text x="14" y="50" className="fill-white/80 text-[11px]">
							Health check &amp; retry
						</text>
						<rect
							x="14"
							y="62"
							width="108"
							height="20"
							rx="6"
							fill="rgba(255,255,255,0.14)"
						/>
						<text
							x="68"
							y="75.5"
							textAnchor="middle"
							className="fill-white font-mono text-[10px] font-medium"
						>
							failover: auto
						</text>
						{/* Ports */}
						<circle
							cx="0"
							cy="48"
							r="3.5"
							className="fill-white stroke-brand"
							strokeWidth="1.5"
						/>
						<circle
							cx="136"
							cy="30"
							r="3.5"
							className="fill-white stroke-brand"
							strokeWidth="1.5"
						/>
						<circle
							cx="136"
							cy="66"
							r="3.5"
							className="fill-white stroke-brand"
							strokeWidth="1.5"
						/>
					</g>

					{/* Node 3A: Route A — Fails (x=396..568, y=28..108) */}
					<g transform="translate(396, 28)">
						<rect
							x="0"
							y="0"
							width="172"
							height="80"
							rx="12"
							className="fill-card stroke-destructive/40"
							strokeWidth="1.25"
						/>
						<circle
							cx="0"
							cy="40"
							r="3.5"
							className="fill-destructive stroke-card"
							strokeWidth="1.5"
						/>
						<text
							x="14"
							y="25"
							className="fill-foreground text-[13px] font-semibold"
						>
							Route A
						</text>
						{/* 503 badge cleanly inside top-right */}
						<g className="failover-x" transform="translate(100, 11)">
							<rect
								x="0"
								y="0"
								width="58"
								height="20"
								rx="6"
								className="fill-destructive/12 stroke-destructive/30"
							/>
							<text
								x="29"
								y="13.5"
								textAnchor="middle"
								className="fill-destructive font-mono text-[10px] font-semibold"
							>
								× 503
							</text>
						</g>
						<text
							x="14"
							y="46"
							className="fill-muted-foreground font-mono text-[11px]"
						>
							Upstream timeout
						</text>
						<text
							x="14"
							y="64"
							className="fill-muted-foreground font-mono text-[10px]"
						>
							180ms · $0.00 charged
						</text>
					</g>

					{/* Node 3B: Route B — Succeeds (x=396..568, y=126..218) */}
					<g transform="translate(396, 126)">
						<rect
							x="0"
							y="0"
							width="172"
							height="92"
							rx="12"
							className="fill-card stroke-success/50"
							strokeWidth="1.5"
						/>
						<circle
							cx="0"
							cy="46"
							r="3.5"
							className="fill-success stroke-card"
							strokeWidth="1.5"
						/>
						<text
							x="14"
							y="25"
							className="fill-foreground text-[13px] font-semibold"
						>
							Route B
						</text>
						{/* 200 OK badge cleanly inside top-right */}
						<g className="failover-check" transform="translate(96, 11)">
							<rect
								x="0"
								y="0"
								width="62"
								height="20"
								rx="6"
								className="fill-success/12 stroke-success/35"
							/>
							<text
								x="31"
								y="13.5"
								textAnchor="middle"
								className="fill-success font-mono text-[10px] font-semibold"
							>
								✓ 200 OK
							</text>
						</g>
						<text
							x="14"
							y="46"
							className="fill-muted-foreground font-mono text-[11px]"
						>
							TTFT 310ms · stream
						</text>
						{/* Streaming token progress bar */}
						<rect
							x="14"
							y="58"
							width="144"
							height="6"
							rx="3"
							className="fill-secondary"
						/>
						<rect
							x="14"
							y="58"
							width="116"
							height="6"
							rx="3"
							className="failover-stream-bar fill-success"
						/>
						<text
							x="14"
							y="80"
							className="fill-success font-mono text-[10px] font-medium"
						>
							Delivered · billed once
						</text>
					</g>
				</svg>
			</div>

			{/* Bottom millisecond trace strip */}
			<div className="grid grid-cols-3 divide-x divide-border border-t border-border bg-card font-mono text-[11px]">
				<div className="px-3.5 py-2.5">
					<span className="text-muted-foreground">0ms</span>
					<p className="mt-0.5 truncate font-sans text-xs font-medium text-foreground">
						Request received
					</p>
				</div>
				<div className="px-3.5 py-2.5">
					<span className="text-destructive">180ms · 503</span>
					<p className="mt-0.5 truncate font-sans text-xs font-medium text-foreground">
						Route A skipped ($0)
					</p>
				</div>
				<div className="px-3.5 py-2.5">
					<span className="text-success">490ms · 200 OK</span>
					<p className="mt-0.5 truncate font-sans text-xs font-medium text-foreground">
						Route B completes
					</p>
				</div>
			</div>
		</div>
	);
}
