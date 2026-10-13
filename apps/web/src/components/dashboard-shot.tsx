import {
	Bell,
	BookOpen,
	ChevronRight,
	Clock,
	HelpCircle,
	KeyRound,
	LineChart,
	ListTodo,
	type LucideIcon,
	Moon,
	Network,
	Search,
	Shapes,
	Users,
	Wallet,
} from "lucide-react";

import { VicharMark } from "@/lib/vichar-logo";

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
	{ group: "Workspace", items: [{ label: "Billing", icon: Wallet }] },
];

const STATS = [
	{
		label: "Balance",
		value: "$184.20",
		sub: "Prepaid credits",
		badge: "Auto top-up on",
		badgeCls: "bg-brand/10 text-brand",
	},
	{
		label: "Spend (7d)",
		value: "$63.48",
		sub: "Across 6 models",
		badge: "-8% vs prior 7d",
		badgeCls: "bg-secondary text-muted-foreground",
	},
	{
		label: "Requests (7d)",
		value: "48,210",
		sub: "14.2M total tokens",
		badge: "+12.4%",
		badgeCls: "bg-success/10 text-success",
	},
	{
		label: "Success rate",
		value: "99.6%",
		sub: "312ms median TTFT",
		badge: "Healthy",
		badgeCls: "bg-success/10 text-success",
	},
];

// 7 days, values 0..1
const BARS = [0.46, 0.64, 0.52, 0.78, 0.58, 0.92, 0.76];
const DAYS = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"];
const GRID = ["$25", "$50", "$75"];

const TOP_MODELS = [
	{
		id: "vichar-sonnet-5.5",
		lab: "Anthropic",
		reqs: "19,741",
		cost: "$26.12",
		share: "41%",
	},
	{
		id: "vichar-gpt-5.6",
		lab: "OpenAI",
		reqs: "11,088",
		cost: "$18.40",
		share: "29%",
	},
	{
		id: "vichar-gemini-3.1-pro",
		lab: "Google",
		reqs: "6,336",
		cost: "$11.20",
		share: "18%",
	},
	{
		id: "vichar-deepseek-v4-pro",
		lab: "DeepSeek",
		reqs: "11,045",
		cost: "$7.76",
		share: "12%",
	},
];

const REQUESTS = [
	{
		model: "vichar-sonnet-5.5",
		lab: "Anthropic",
		tokens: "812 → 274",
		cost: "$0.0044",
		time: "2m ago",
	},
	{
		model: "vichar-gpt-5.6",
		lab: "OpenAI",
		tokens: "1,240 → 96",
		cost: "$0.0036",
		time: "4m ago",
	},
	{
		model: "vichar-haiku-5.5",
		lab: "Anthropic",
		tokens: "402 → 88",
		cost: "$0.0001",
		time: "7m ago",
	},
	{
		model: "vichar-deepseek-v4-pro",
		lab: "DeepSeek",
		tokens: "2,011 → 640",
		cost: "$0.0026",
		time: "11m ago",
	},
];

export function DashboardShot() {
	return (
		<div
			aria-hidden="true"
			className="overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-[0_20px_50px_-15px_rgba(48,93,222,0.16),0_4px_20px_rgba(0,0,0,0.06)]"
		>
			{/* Browser chrome */}
			<div className="flex h-10 items-center gap-2 border-b border-border bg-secondary/40 px-4">
				<span className="size-2.5 rounded-full bg-[#f96a5e]" />
				<span className="size-2.5 rounded-full bg-[#f7bd4f]" />
				<span className="size-2.5 rounded-full bg-[#39c554]" />
				<span className="mx-auto flex w-[320px] items-center justify-center gap-1.5 rounded-md border border-border bg-background py-1 font-mono text-xs text-muted-foreground">
					<VicharMark className="size-3.5 text-brand" />
					<span>app.vichar.io/dashboard</span>
				</span>
				<span className="w-12" />
			</div>

			{/* App top header (matches real app-header.tsx) */}
			<div className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
				<div className="flex items-center gap-2.5">
					<div className="flex items-center gap-2">
						<span className="flex size-6 items-center justify-center rounded-md bg-brand text-white shadow-xs">
							<VicharMark className="size-4" />
						</span>
						<span className="font-display text-sm font-semibold tracking-tight">
							Vichar
						</span>
					</div>
					<span className="text-border">/</span>
					<span className="text-xs font-medium text-foreground">
						Default Workspace
					</span>
					<ChevronRight className="size-3.5 text-muted-foreground" />
					<span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
						Production API
					</span>
				</div>

				<div className="flex items-center gap-2.5">
					<span className="flex h-7 w-44 items-center justify-between rounded-md border border-border bg-secondary/30 px-2.5 text-xs text-muted-foreground">
						<span className="flex items-center gap-1.5">
							<Search className="size-3" />
							Search…
						</span>
						<kbd className="rounded border border-border bg-card px-1 font-mono text-[10px]">
							⌘K
						</kbd>
					</span>
					<span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 font-mono text-xs font-medium">
						<span className="size-1.5 rounded-full bg-success" />
						$184.20
					</span>
					<span className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground">
						<BookOpen className="size-3.5" />
						Docs
					</span>
					<Moon className="size-3.5 text-muted-foreground" />
					<Bell className="size-3.5 text-muted-foreground" />
					<span className="flex size-6 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white">
						VK
					</span>
				</div>
			</div>

			<div className="grid grid-cols-[196px_1fr] text-left">
				{/* Sidebar */}
				<div className="flex flex-col justify-between border-r border-border bg-secondary/20 px-3 py-4">
					<div>
						{NAV.map((g, gi) => (
							<div key={g.group ?? "top"} className={gi === 0 ? "" : "mt-4"}>
								{g.group && (
									<p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
										{g.group}
									</p>
								)}
								{g.items.map((it) => (
									<div
										key={it.label}
										className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
											it.active
												? "bg-brand/10 font-medium text-brand"
												: "text-muted-foreground"
										}`}
									>
										<it.icon className="size-3.5 shrink-0" strokeWidth={1.9} />
										{it.label}
									</div>
								))}
							</div>
						))}
					</div>
					<div className="border-t border-border px-2 pt-3">
						<div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
							<HelpCircle className="size-3.5" strokeWidth={1.8} />
							Help &amp; support
						</div>
					</div>
				</div>

				{/* Main content */}
				<div className="min-w-0 px-6 py-5">
					<div className="flex items-center justify-between">
						<div>
							<p className="font-display text-base font-semibold tracking-tight">
								Overview
							</p>
							<p className="text-xs text-muted-foreground">
								Real-time usage and spend across all active keys
							</p>
						</div>
						<div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 p-0.5 text-xs">
							<span className="rounded-md px-2 py-1 text-muted-foreground">
								24h
							</span>
							<span className="rounded-md bg-card px-2 py-1 font-medium text-foreground shadow-2xs">
								7d
							</span>
							<span className="rounded-md px-2 py-1 text-muted-foreground">
								30d
							</span>
						</div>
					</div>

					{/* Stat strip */}
					<div className="mt-4 grid grid-cols-4 gap-3">
						{STATS.map((s) => (
							<div
								key={s.label}
								className="rounded-xl border border-border bg-card px-4 py-3"
							>
								<div className="flex items-center justify-between gap-1">
									<p className="text-xs text-muted-foreground">{s.label}</p>
									<span
										className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.badgeCls}`}
									>
										{s.badge}
									</span>
								</div>
								<p className="mt-1.5 font-display text-2xl font-semibold leading-none tracking-tight">
									{s.value}
								</p>
								<p className="mt-1.5 text-[11px] text-muted-foreground">
									{s.sub}
								</p>
							</div>
						))}
					</div>

					{/* Usage chart */}
					<div className="mt-3.5 rounded-xl border border-border bg-card p-4">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<p className="text-xs font-semibold">Daily spend</p>
								<span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
									USD
								</span>
							</div>
							<p className="font-mono text-[11px] text-muted-foreground">
								Peak: Sun $14.80 · Total: $63.48
							</p>
						</div>
						<svg viewBox="0 0 640 160" className="mt-2 h-[148px] w-full">
							{GRID.map((g, i) => {
								const gridY = (i + 1) * 36;
								return (
									<g key={g}>
										<line
											x1="36"
											y1={132 - gridY}
											x2="630"
											y2={132 - gridY}
											className="stroke-border"
											strokeDasharray="3 4"
											strokeWidth="1"
										/>
										<text
											x="30"
											y={136 - gridY}
											textAnchor="end"
											className="fill-muted-foreground font-mono text-[10px]"
										>
											{g}
										</text>
									</g>
								);
							})}
							{BARS.map((v, i) => {
								const barH = v * 112;
								const barX = i * 82;
								const isLatest = i === BARS.length - 1;
								return (
									<rect
										key={DAYS[i]}
										x={54 + barX}
										y={132 - barH}
										width="50"
										height={barH}
										rx="5"
										className="fill-brand"
										opacity={isLatest ? 1 : 0.42}
									/>
								);
							})}
							{DAYS.map((d, i) => {
								const dayX = i * 82;
								return (
									<text
										key={d}
										x={79 + dayX}
										y="150"
										textAnchor="middle"
										className="fill-muted-foreground font-mono text-[10px]"
									>
										{d}
									</text>
								);
							})}
						</svg>
					</div>

					{/* Bottom tables — all 4 rows cleanly visible */}
					<div className="mt-3.5 grid grid-cols-2 gap-3.5">
						{/* Top models */}
						<div className="overflow-hidden rounded-xl border border-border bg-card">
							<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
								<p className="text-xs font-semibold">Top models</p>
								<span className="text-[11px] text-muted-foreground">
									By spend
								</span>
							</div>
							<table className="w-full text-xs">
								<thead>
									<tr className="border-b border-border bg-secondary/20 text-[11px] text-muted-foreground">
										<th className="px-4 py-2 text-left font-medium">Model</th>
										<th className="px-3 py-2 text-right font-medium">
											Requests
										</th>
										<th className="px-4 py-2 text-right font-medium">Cost</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border/60">
									{TOP_MODELS.map((m) => (
										<tr key={m.id}>
											<td className="whitespace-nowrap px-3.5 py-2">
												<p className="font-mono text-xs font-medium">{m.id}</p>
												<p className="text-[11px] text-muted-foreground">
													{m.lab}
												</p>
											</td>
											<td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
												{m.reqs}
											</td>
											<td className="whitespace-nowrap px-3.5 py-2 text-right font-mono text-xs font-medium tabular-nums">
												{m.cost}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						{/* Recent activity */}
						<div className="overflow-hidden rounded-xl border border-border bg-card">
							<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
								<p className="text-xs font-semibold">Recent activity</p>
								<span className="text-[11px] text-brand">View all →</span>
							</div>
							<table className="w-full text-xs">
								<thead>
									<tr className="border-b border-border bg-secondary/20 text-[11px] text-muted-foreground">
										<th className="px-3.5 py-2 text-left font-medium">Model</th>
										<th className="px-2.5 py-2 text-right font-medium">
											Tokens
										</th>
										<th className="px-2.5 py-2 text-right font-medium">Cost</th>
										<th className="px-3.5 py-2 text-right font-medium">Time</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border/60">
									{REQUESTS.map((r) => (
										<tr key={r.model + r.time}>
											<td className="whitespace-nowrap px-3.5 py-2">
												<div className="flex items-center gap-2">
													<span className="size-1.5 shrink-0 rounded-full bg-success" />
													<div>
														<p className="font-mono text-xs font-medium">
															{r.model}
														</p>
														<p className="text-[11px] text-muted-foreground">
															{r.lab}
														</p>
													</div>
												</div>
											</td>
											<td className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
												{r.tokens}
											</td>
											<td className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-xs font-medium tabular-nums">
												{r.cost}
											</td>
											<td className="whitespace-nowrap px-3.5 py-2 text-right font-mono text-[11px] text-muted-foreground">
												{r.time}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
