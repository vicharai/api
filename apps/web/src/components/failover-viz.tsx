/**
 * Request trace view: one request, two attempts, one bill. Spans are placed on
 * a 0-500ms scale; a playhead sweeps the timeline and reveals the spans.
 * Monochrome + brand blue only. Reduced motion shows the finished trace.
 */

const SCALE_MS = 500;
const pct = (ms: number) => `${(ms / SCALE_MS) * 100}%`;
const TICKS = [0, 100, 200, 300, 400, 500];

interface Span {
	label: string;
	short: string;
	depth: 0 | 1;
	start: number;
	end: number;
	kind: "root" | "abandoned" | "gap" | "active";
	note?: string;
	ttft?: number;
}

const SPANS: Span[] = [
	{
		label: "POST /v1/chat/completions",
		short: "request",
		depth: 0,
		start: 0,
		end: 490,
		kind: "root",
		note: "490 ms",
	},
	{
		label: "attempt 1 · route A",
		short: "attempt 1",
		depth: 1,
		start: 4,
		end: 180,
		kind: "abandoned",
		note: "timeout",
	},
	{
		label: "reroute",
		short: "reroute",
		depth: 1,
		start: 180,
		end: 192,
		kind: "gap",
		note: "12 ms",
	},
	{
		label: "attempt 2 · route B",
		short: "attempt 2",
		depth: 1,
		start: 192,
		end: 490,
		kind: "active",
		ttft: 310,
	},
];

function SpanBar({ span }: { span: Span }) {
	const left = pct(span.start);
	const width = pct(span.end - span.start);
	if (span.kind === "root") {
		return (
			<div
				style={{ left, width }}
				className="absolute inset-y-[7px] rounded-[4px] border border-foreground/15 bg-foreground/[0.06]"
			/>
		);
	}
	if (span.kind === "abandoned") {
		return (
			<div
				style={{ left, width }}
				className="trace-hatch absolute inset-y-[7px] rounded-[4px] border border-foreground/15"
			/>
		);
	}
	if (span.kind === "gap") {
		return (
			<div
				style={{ left, width }}
				className="absolute inset-y-[9px] rounded-[3px] bg-brand/45"
			/>
		);
	}
	const ttftOffset = span.ttft
		? (span.ttft - span.start) / (span.end - span.start)
		: 0;
	return (
		<div
			style={{ left, width }}
			className="absolute inset-y-[7px] flex overflow-hidden rounded-[4px]"
		>
			<div
				style={{ width: `${ttftOffset * 100}%` }}
				className="h-full bg-brand/30"
			/>
			<div className="h-full flex-1 bg-brand" />
		</div>
	);
}

export function FailoverViz() {
	return (
		<div
			aria-hidden="true"
			className="overflow-hidden rounded-xl border border-border bg-card"
		>
			{/* Header */}
			<div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
				<div className="flex min-w-0 items-baseline gap-2.5">
					<span className="text-[13px] font-semibold text-foreground">
						Trace
					</span>
					<span className="truncate font-mono text-[11px] text-muted-foreground">
						req_7Hf2c9a1
					</span>
				</div>
				<span className="shrink-0 font-mono text-[11px] text-muted-foreground">
					vichar-sonnet-5.5
				</span>
			</div>

			{/* Timeline */}
			<div className="px-5 pb-4 pt-3">
				<div className="grid grid-cols-[84px_1fr] gap-x-3 sm:grid-cols-[176px_1fr] sm:gap-x-4">
					{/* Ruler */}
					<div />
					<div className="relative h-5">
						{TICKS.map((t) => (
							<span
								key={t}
								style={{ left: pct(t) }}
								className={`absolute top-0 font-mono text-[10px] text-muted-foreground ${
									t % 200 !== 0 ? "hidden " : ""
								}${
									t === 0
										? ""
										: t === SCALE_MS
											? "-translate-x-full"
											: "-translate-x-1/2"
								}`}
							>
								{t === 0 ? "0" : `${t}ms`}
							</span>
						))}
					</div>

					{/* Labels column */}
					<div className="flex flex-col">
						{SPANS.map((s) => (
							<div
								key={s.label}
								className={`flex h-[34px] items-center gap-1.5 truncate font-mono text-[11px] ${
									s.depth === 0
										? "font-medium text-foreground"
										: s.kind === "active"
											? "text-foreground"
											: "text-muted-foreground"
								}`}
							>
								{s.depth === 1 && (
									<span className="text-muted-foreground/60">
										{s === SPANS[SPANS.length - 1] ? "└" : "├"}
									</span>
								)}
								<span className="truncate sm:hidden">{s.short}</span>
								<span className="hidden truncate sm:inline">{s.label}</span>
							</div>
						))}
					</div>

					{/* Spans column with gridlines + playhead */}
					<div className="relative">
						{TICKS.map((t) => (
							<span
								key={t}
								style={{ left: pct(t) }}
								className="absolute inset-y-0 w-px bg-border/70"
							/>
						))}
						{SPANS.map((s) => (
							<div key={s.label} className="relative h-[34px]">
								<SpanBar span={s} />
								{s.note && (
									<span
										style={{ left: `calc(${pct(s.end)} + 6px)` }}
										className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-muted-foreground ${
											s.end > 420 ? "hidden" : ""
										}`}
									>
										{s.note}
									</span>
								)}
								{s.ttft && (
									<span
										style={{ left: pct(s.ttft) }}
										className="absolute inset-y-[3px] w-px bg-foreground/70"
									/>
								)}
							</div>
						))}

						{/* Reveal mask + playhead (animated) */}
						<div className="trace-mask pointer-events-none absolute inset-y-0 right-0 bg-card/85" />
						<div className="trace-playhead pointer-events-none absolute inset-y-[-6px] w-px bg-brand">
							<span className="absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-brand" />
						</div>
					</div>
				</div>

				{/* Legend */}
				<div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[10px] text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<span className="trace-hatch inline-block h-2 w-3.5 rounded-[2px] border border-foreground/15" />
						failed, not billed
					</span>
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-2 w-3.5 rounded-[2px] bg-brand" />
						streaming
					</span>
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-2.5 w-px bg-foreground/70" />
						first token at 310ms
					</span>
				</div>
			</div>

			{/* Summary */}
			<dl className="grid grid-cols-3 divide-x divide-border border-t border-border">
				{[
					["Attempts", "2"],
					["Billed", "1"],
					["Route A cost", "$0.00"],
				].map(([k, v]) => (
					<div key={k} className="px-5 py-3">
						<dt className="truncate text-[11px] text-muted-foreground">{k}</dt>
						<dd className="mt-0.5 font-mono text-sm font-medium tabular-nums text-foreground">
							{v}
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
