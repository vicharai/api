import type { ReactNode } from "react";

function Tile({
	title,
	body,
	children,
	span = 3,
}: {
	title: string;
	body: string;
	children: ReactNode;
	span?: 2 | 3 | 4;
}) {
	return (
		<div
			className="reveal group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:border-foreground/20"
			style={{ "--span": `span ${span}` } as React.CSSProperties}
		>
			<div
				aria-hidden="true"
				className="mb-5 flex h-[180px] items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-secondary/40 p-4"
			>
				{children}
			</div>
			<h3 className="font-display text-base font-semibold tracking-tight">
				{title}
			</h3>
			<p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
				{body}
			</p>
		</div>
	);
}

const CHIP = "rounded-md border px-2.5 py-1.5 text-xs font-medium leading-none";

function PromptCard() {
	return (
		<span className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
			Summarize this ticket…
		</span>
	);
}

export function BentoFeatures() {
	return (
		<div className="bento-grid mt-12 grid gap-4 sm:grid-cols-6">
			{/* Spend limits — wide */}
			<Tile
				span={4}
				title="Spend limits per key"
				body="Cap any API key at a fixed total or a recurring daily, weekly, or monthly budget, so a runaway job cannot drain your balance."
			>
				<div className="w-full max-w-[340px] rounded-lg border border-border bg-card p-4 font-mono text-xs shadow-sm">
					<div className="flex items-center justify-between">
						<span className="text-foreground">production</span>
						<span className="flex items-center gap-1.5 text-xs text-success">
							<span className="size-1.5 rounded-full bg-success" />
							Active
						</span>
					</div>
					<p className="mt-1 text-muted-foreground">vichar_7fK…a91</p>
					<div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
						<div className="h-full w-[42%] rounded-full bg-brand" />
					</div>
					<div className="mt-2 flex items-baseline justify-between text-xs">
						<span className="text-foreground">$42.18 of $100.00 · monthly</span>
						<span className="text-muted-foreground">Resets Nov 1</span>
					</div>
				</div>
			</Tile>

			{/* Key expiry — narrow */}
			<Tile
				span={2}
				title="Key expiry"
				body="Give keys a TTL for contractors, demos, or rotating services. They stop working at the timestamp you set."
			>
				<div className="w-full space-y-2">
					{[
						{
							n: "production",
							chip: "Never expires",
							cls: "border-border bg-card text-muted-foreground",
						},
						{
							n: "ci-runner",
							chip: "Expires in 30 days",
							cls: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
						},
						{
							n: "demo-contractor",
							chip: "Expired",
							cls: "border-border bg-secondary text-muted-foreground",
							dead: true,
						},
					].map((k) => (
						<div
							key={k.n}
							className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 font-mono text-xs"
						>
							<span
								className={k.dead ? "text-muted-foreground line-through" : ""}
							>
								{k.n}
							</span>
							<span
								className={`rounded-full border px-2 py-0.5 text-[10px] ${k.cls}`}
							>
								{k.chip}
							</span>
						</div>
					))}
				</div>
			</Tile>

			{/* Smart routing — narrow */}
			<Tile
				span={2}
				title="Smart routing"
				body="Send requests to the auto model and Vichar classifies difficulty, then routes to one of your configured models."
			>
				<div className="flex w-full flex-col items-center gap-1">
					<PromptCard />
					<svg width="20" height="10" className="text-muted-foreground">
						<path
							d="M10 0v6M6 4l4 4 4-4"
							stroke="currentColor"
							fill="none"
							strokeWidth="1.4"
						/>
					</svg>
					<span className="rounded-md bg-brand px-3 py-1 font-mono text-xs font-semibold text-white">
						auto
					</span>
					<svg width="120" height="12" className="text-border">
						<path
							d="M60 0 C 40 6 30 8 16 12"
							stroke="currentColor"
							fill="none"
						/>
						<path
							d="M60 0 C 50 6 48 8 46 12"
							stroke="currentColor"
							fill="none"
						/>
						<path
							d="M60 0 C 70 6 72 8 74 12"
							stroke="currentColor"
							fill="none"
						/>
						<path
							d="M60 0 C 80 6 90 8 104 12"
							stroke="currentColor"
							fill="none"
						/>
					</svg>
					<div className="grid grid-cols-2 gap-1.5">
						{["Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "DeepSeek V3.2"].map(
							(m, i) => (
								<span
									key={m}
									className={`${CHIP} ${
										i === 2
											? "border-brand/40 bg-brand/10 text-brand"
											: "border-border bg-card text-muted-foreground"
									}`}
								>
									{m}
								</span>
							),
						)}
					</div>
					<span className="mt-0.5 text-[11px] text-muted-foreground">
						Haiku picked for cost
					</span>
				</div>
			</Tile>

			{/* Prompt caching — wide */}
			<Tile
				span={4}
				title="Prompt caching"
				body="Repeated prompt prefixes hit provider-side caches automatically, and cached input tokens bill at a lower rate."
			>
				<div className="w-full max-w-[340px]">
					<div className="flex h-8 w-full overflow-hidden rounded-md border border-border text-xs font-medium">
						<div className="flex w-[62%] items-center justify-center bg-brand text-white">
							Cached 18,400
						</div>
						<div className="flex w-[38%] items-center justify-center bg-secondary text-muted-foreground">
							New 1,200
						</div>
					</div>
					<div className="mt-2.5 flex justify-between text-xs text-muted-foreground">
						<span>cached input · billed at the lower rate</span>
						<span className="font-mono">−50%</span>
					</div>
				</div>
			</Tile>

			{/* Shared workspace */}
			<Tile
				span={3}
				title="Shared workspace"
				body="Every key in the organization draws from one prepaid balance, with per-member budgets and roles."
			>
				<div className="w-full max-w-[300px] rounded-lg border border-border bg-card p-4 shadow-sm">
					{[
						{ ini: "AM", name: "Ari Morgan", role: "Owner" },
						{ ini: "RS", name: "Rhea Singh", role: "Admin" },
						{ ini: "KO", name: "Ken Ito", role: "Developer" },
					].map((m, i) => (
						<div key={m.ini} className="flex items-center gap-2.5 py-1.5">
							<span
								className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
								style={{
									backgroundColor: ["#305dde", "#4f80ff", "#38bdf8"][i],
								}}
							>
								{m.ini}
							</span>
							<span className="flex-1 truncate text-xs">{m.name}</span>
							<span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
								{m.role}
							</span>
						</div>
					))}
					<div className="mt-2 flex justify-center border-t border-border pt-3">
						<span className="rounded-full bg-secondary px-3 py-1 font-mono text-xs">
							Shared balance $184.20
						</span>
					</div>
				</div>
			</Tile>

			{/* Rate limits */}
			<Tile
				span={3}
				title="Rate limits that grow"
				body="New accounts start at 600 requests per minute; tiers raise limits automatically with age and spend."
			>
				<svg viewBox="0 0 300 132" className="h-[132px] w-full max-w-[320px]">
					{/* steps 600 → 1.2k → 2.4k → 6k → 12k */}
					<polyline
						points="36,96 96,96 96,80 156,80 156,64 216,64 216,40 276,40 276,16 296,16"
						fill="none"
						className="stroke-brand"
						strokeWidth="2"
						strokeLinejoin="round"
					/>
					{[96, 80, 64, 40, 16].map((y, i) => {
						const stepX = i * 60;
						return (
							<g key={y}>
								<text
									x={72 + stepX - 24}
									y={y - 6}
									textAnchor="middle"
									className="fill-muted-foreground text-[11px] font-medium"
								>
									{["600", "1.2k", "2.4k", "6k", "12k"][i]}
								</text>
								<text
									x={i === 4 ? 296 : 66 + stepX}
									y="124"
									textAnchor={i === 4 ? "end" : "middle"}
									className="fill-muted-foreground text-[11px]"
								>
									Tier {i}
								</text>
							</g>
						);
					})}
					<text
						x="30"
						y="100"
						className="fill-muted-foreground text-[10px]"
						textAnchor="end"
					>
						RPM
					</text>
				</svg>
			</Tile>
		</div>
	);
}
