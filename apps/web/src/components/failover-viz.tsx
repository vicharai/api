/**
 * Animated request-failover diagram. Pure CSS/SVG; the final state is also
 * the reduced-motion rendering.
 */
export function FailoverViz() {
	return (
		<div
			aria-hidden="true"
			className="flex h-full items-center overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
		>
			<svg viewBox="0 0 620 200" className="w-full">
				{/* nodes */}
				<g>
					<rect
						x="8"
						y="72"
						width="120"
						height="44"
						rx="11"
						className="fill-secondary stroke-border"
					/>
					<text
						x="68"
						y="99"
						textAnchor="middle"
						className="fill-foreground text-[14px] font-medium"
					>
						Your app
					</text>
				</g>
				<g>
					<rect
						x="238"
						y="72"
						width="120"
						height="44"
						rx="11"
						className="fill-brand stroke-brand"
					/>
					<text
						x="298"
						y="99"
						textAnchor="middle"
						className="fill-white text-[14px] font-medium"
					>
						Vichar
					</text>
				</g>
				<g>
					<rect
						x="452"
						y="22"
						width="140"
						height="42"
						rx="10"
						className="fill-card stroke-border"
					/>
					<text
						x="522"
						y="42"
						textAnchor="middle"
						className="fill-foreground text-[13px] font-medium"
					>
						Route A
					</text>
					<text
						x="522"
						y="57"
						textAnchor="middle"
						className="fill-muted-foreground text-[11px]"
					>
						same model
					</text>
				</g>
				<g>
					<rect
						x="452"
						y="124"
						width="140"
						height="42"
						rx="10"
						className="fill-card stroke-border"
					/>
					<text
						x="522"
						y="144"
						textAnchor="middle"
						className="fill-foreground text-[13px] font-medium"
					>
						Route B
					</text>
					<text
						x="522"
						y="159"
						textAnchor="middle"
						className="fill-muted-foreground text-[11px]"
					>
						same model
					</text>
				</g>
				{/* edges */}
				<line
					x1="128"
					y1="94"
					x2="235"
					y2="94"
					className="stroke-border"
					strokeWidth="1.5"
				/>
				<path
					d="M358 84 C 410 84 410 43 449 43"
					fill="none"
					className="stroke-border"
					strokeWidth="1.5"
				/>
				<path
					d="M358 104 C 410 104 410 145 449 145"
					fill="none"
					className="stroke-border"
					strokeWidth="1.5"
				/>
				{/* attempt labels on the paths */}
				<text
					x="400"
					y="30"
					className="fill-muted-foreground text-[11px] font-medium"
				>
					attempt 1
				</text>
				<text
					x="400"
					y="196"
					className="fill-muted-foreground text-[11px] font-medium"
				>
					attempt 2
				</text>
				{/* moving packets */}
				<circle r="4.5" className="failover-packet-a fill-brand" />
				<circle r="4.5" className="failover-packet-b fill-brand" />
				{/* status badges inside the route boxes */}
				<g className="failover-x">
					<circle cx="576" cy="43" r="9" className="fill-destructive" />
					<path d="M572 39l8 8m0 -8l-8 8" stroke="white" strokeWidth="1.6" />
				</g>
				<g className="failover-check">
					<circle cx="576" cy="145" r="9" className="fill-success" />
					<path
						d="M571 145l4 4 7-7"
						stroke="white"
						strokeWidth="1.6"
						fill="none"
					/>
				</g>
				{/* response pill */}
				<g className="failover-done">
					<rect
						x="452"
						y="176"
						width="140"
						height="22"
						rx="11"
						className="fill-success/10 stroke-success/40"
					/>
					<text
						x="522"
						y="191"
						textAnchor="middle"
						className="fill-success text-[11px] font-medium"
					>
						200 OK · billed once
					</text>
				</g>
			</svg>
		</div>
	);
}
