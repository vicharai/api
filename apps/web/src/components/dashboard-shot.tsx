import {
	Bell,
	ChevronRight,
	Clock,
	HelpCircle,
	KeyRound,
	LineChart,
	ListTodo,
	type LucideIcon,
	Network,
	Search,
	Shapes,
	Users,
	Wallet,
} from "lucide-react";

/** High-fidelity decorative recreation of the dashboard Overview page. */

const NAV: Array<{
	group?: string;
	items: Array<{ label: string; icon: LucideIcon; active?: boolean }>;
}> = [
	{
		items: [
			{ label: "Overview", icon: Shapes, active: true },
			{ label: "Activity", icon: Clock },
			{ label: "Analytics", icon: LineChart },
		],
	},
	{
		group: "Build",
		items: [
			{ label: "API Keys", icon: KeyRound },
			{ label: "Models", icon: Network },
			{ label: "Smart Routing", icon: ListTodo },
		],
	},
	{ group: "Grow", items: [{ label: "Members", icon: Users }] },
	{ group: "Settings", items: [{ label: "Billing", icon: Wallet }] },
];

const STATS = [
	{ label: "Balance", value: "$184.20", sub: "credits" },
	{ label: "Spend", value: "$63.48", sub: "this week" },
	{ label: "Requests", value: "48,210", sub: "+12% vs last week" },
	{ label: "Error rate", value: "0.4%", sub: "7 days" },
];

// 7 days, values 0..1
const BARS = [0.42, 0.62, 0.5, 0.78, 0.55, 0.9, 0.7];
const DAYS = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"];
const GRID = ["$25", "$50", "$75"];

const TOP_MODELS = [
	{ id: "vichar-sonnet-5.5", reqs: "19,741", cost: "$26.12" },
	{ id: "vichar-gpt-5.6", reqs: "11,088", cost: "$18.40" },
	{ id: "vichar-deepseek-v4-pro", reqs: "6,750", cost: "$4.31" },
	{ id: "vichar-gemini-3.1-pro", reqs: "4,336", cost: "$9.02" },
];

const REQUESTS = [
	{
		model: "vichar-sonnet-5.5",
		lab: "Anthropic",
		tokens: "812 in, 274 out",
		cost: "$0.0044",
		time: "12:04",
	},
	{
		model: "vichar-gpt-5.6",
		lab: "OpenAI",
		tokens: "1,240 in, 96 out",
		cost: "$0.0036",
		time: "12:03",
	},
	{
		model: "vichar-haiku-5.5",
		lab: "Anthropic",
		tokens: "402 in, 88 out",
		cost: "$0.0001",
		time: "12:01",
	},
	{
		model: "vichar-deepseek-v4-pro",
		lab: "DeepSeek",
		tokens: "2,011 in, 640 out",
		cost: "$0.0026",
		time: "11:58",
	},
];

export function DashboardShot() {
	return (
		<div
			aria-hidden="true"
			className="overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-[0_16px_48px_-12px_rgba(48,93,222,0.18),0_4px_16px_rgba(0,0,0,0.06)]"
		>
			{/* browser chrome */}
			<div className="flex h-10 items-center gap-2 border-b border-border bg-secondary/40 px-4">
				<span className="size-2.5 rounded-full bg-[#f96a5e]" />
				<span className="size-2.5 rounded-full bg-[#f7bd4f]" />
				<span className="size-2.5 rounded-full bg-[#39c554]" />
				<span className="mx-auto flex w-[300px] items-center justify-center rounded-md border border-border bg-background py-1 font-mono text-xs text-muted-foreground">
					app.vichar.io
				</span>
				<span className="w-12" />
			</div>

			<div className="grid grid-cols-[190px_1fr] text-left">
				{/* sidebar */}
				<div className="border-r border-border bg-secondary/30 px-3 py-4">
					<div className="mb-4 flex items-center gap-2 px-1.5">
						<span className="flex size-5 items-center justify-center rounded bg-brand text-[10px] font-bold text-white">
							V
						</span>
						<span className="text-sm font-semibold">Vichar</span>
						<ChevronRight className="size-3 text-muted-foreground" />
						<span className="truncate text-xs text-muted-foreground">
							Default Organi…
						</span>
					</div>
					{NAV.map((g, gi) => (
						<div key={g.group ?? "top"} className={gi === 0 ? "" : "mt-4"}>
							{g.group && (
								<p className="px-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
									{g.group}
								</p>
							)}
							{g.items.map((it) => (
								<div
									key={it.label}
									className={`flex items-center gap-2 rounded-md px-1.5 py-1.5 text-xs ${
										it.active
											? "bg-accent font-medium"
											: "text-muted-foreground"
									}`}
								>
									<it.icon className="size-3.5 shrink-0" strokeWidth={1.8} />
									{it.label}
								</div>
							))}
						</div>
					))}
					<div className="mt-6 border-t border-border px-1.5 pt-3">
						<div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
							<HelpCircle className="size-3.5" strokeWidth={1.8} />
							Help
						</div>
					</div>
				</div>

				{/* main */}
				<div className="min-w-0 px-6 pb-6 pt-4">
					<div className="flex items-center justify-between">
						<p className="text-[17px] font-semibold">Overview</p>
						<div className="flex items-center gap-2.5">
							<span className="flex h-7 w-40 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground">
								<Search className="size-3" />
								Search or jump to…
							</span>
							<span className="rounded-md bg-secondary px-2 py-1 font-mono text-xs">
								$184.20
							</span>
							<Bell
								className="size-4 text-muted-foreground"
								strokeWidth={1.8}
							/>
							<span className="flex size-6 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white">
								E
							</span>
						</div>
					</div>

					{/* stat strip */}
					<div className="mt-4 grid grid-cols-4 gap-3">
						{STATS.map((s) => (
							<div
								key={s.label}
								className="rounded-lg border border-border px-4 py-3.5"
							>
								<p className="text-xs text-muted-foreground">{s.label}</p>
								<p className="mt-1 font-display text-[26px] font-semibold leading-none tracking-tight">
									{s.value}
								</p>
								<p className="mt-1.5 text-xs text-muted-foreground">{s.sub}</p>
							</div>
						))}
					</div>

					{/* usage chart */}
					<div className="mt-3 rounded-lg border border-border p-4">
						<div className="flex items-center justify-between">
							<p className="text-sm font-medium">Usage</p>
							<p className="text-xs text-muted-foreground">Last 7 days</p>
						</div>
						<svg viewBox="0 0 640 220" className="mt-2 h-[220px] w-full">
							{GRID.map((g, i) => {
								const gridY = (i + 1) * 48;
								return (
									<g key={g}>
										<line
											x1="34"
											y1={180 - gridY}
											x2="632"
											y2={180 - gridY}
											className="stroke-border"
											strokeDasharray="3 4"
											strokeWidth="1"
										/>
										<text
											x="30"
											y={184 - gridY}
											textAnchor="end"
											className="fill-muted-foreground text-[11px]"
										>
											{g}
										</text>
									</g>
								);
							})}
							{BARS.map((v, i) => {
								const barH = v * 158;
								const barX = i * 82;
								return (
									<rect
										key={DAYS[i]}
										x={52 + barX}
										y={180 - barH}
										width="52"
										height={barH}
										rx="4"
										className="fill-brand"
										opacity={i === BARS.length - 1 ? 1 : 0.4}
									/>
								);
							})}
							{DAYS.map((d, i) => {
								const dayX = i * 82;
								return (
									<text
										key={d}
										x={78 + dayX}
										y="200"
										textAnchor="middle"
										className="fill-muted-foreground text-[11px]"
									>
										{d}
									</text>
								);
							})}
						</svg>
					</div>

					<div className="mt-3 grid grid-cols-2 gap-3">
						{/* top models */}
						<div className="rounded-lg border border-border">
							<p className="border-b border-border px-4 py-2.5 text-sm font-medium">
								Top models
							</p>
							<table className="w-full text-xs">
								<thead>
									<tr className="border-b border-border text-muted-foreground">
										<th className="px-4 py-2 text-left font-medium">Model</th>
										<th className="px-4 py-2 text-right font-medium">
											Requests
										</th>
										<th className="px-4 py-2 text-right font-medium">Cost</th>
									</tr>
								</thead>
								<tbody>
									{TOP_MODELS.map((m) => (
										<tr
											key={m.id}
											className="border-b border-border/50 last:border-0"
										>
											<td className="px-4 py-2.5 font-mono">{m.id}</td>
											<td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
												{m.reqs}
											</td>
											<td className="px-4 py-2.5 text-right font-mono tabular-nums">
												{m.cost}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{/* recent requests */}
						<div className="rounded-lg border border-border">
							<p className="border-b border-border px-4 py-2.5 text-sm font-medium">
								Recent requests
							</p>
							<div className="px-4 py-1">
								{REQUESTS.map((r) => (
									<div
										key={r.model + r.time}
										className="flex items-start gap-2.5 border-b border-border/50 py-2.5 last:border-0"
									>
										<span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-success" />
										<div className="min-w-0 flex-1">
											<p className="truncate font-mono text-xs">{r.model}</p>
											<p className="truncate text-xs text-muted-foreground">
												{r.lab} · {r.tokens}
											</p>
										</div>
										<div className="shrink-0 text-right">
											<p className="font-mono text-xs tabular-nums">{r.cost}</p>
											<p className="text-[11px] text-muted-foreground">
												{r.time}
											</p>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
