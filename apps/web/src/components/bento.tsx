import { Check, KeyRound } from "lucide-react";

import { VicharMark } from "@/lib/vichar-logo";

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
				className="mb-5 flex h-[196px] items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-secondary/35 p-4"
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

const TIERS = [
	{ tier: "Tier 0", rpm: "600", h: 24, opacity: "bg-brand/35" },
	{ tier: "Tier 1", rpm: "1.2k", h: 40, opacity: "bg-brand/50" },
	{ tier: "Tier 2", rpm: "2.4k", h: 58, opacity: "bg-brand/65" },
	{ tier: "Tier 3", rpm: "6k", h: 78, opacity: "bg-brand/80" },
	{ tier: "Tier 4", rpm: "12k", h: 100, opacity: "bg-brand" },
];

export function BentoFeatures() {
	return (
		<div className="bento-grid mt-12 grid gap-4 sm:grid-cols-6">
			{/* 1. Spend limits — wide (4 cols) */}
			<Tile
				span={4}
				title="Spend limits per key"
				body="Cap any API key at a fixed total or a recurring daily, weekly, or monthly budget, so a runaway job cannot drain your balance."
			>
				<div className="w-full max-w-[520px] rounded-xl border border-border bg-card p-4 shadow-2xs">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<span className="flex size-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
								<KeyRound className="size-3.5" />
							</span>
							<div>
								<p className="text-xs font-semibold text-foreground">
									production-backend
								</p>
								<p className="font-mono text-[11px] text-muted-foreground">
									vichar_7fK…a91
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<span className="rounded-md border border-border bg-secondary/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
								Monthly cap
							</span>
							<span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-[11px] font-medium text-success">
								<span className="size-1.5 rounded-full bg-success" />
								Active
							</span>
						</div>
					</div>

					<div className="relative mt-4">
						<div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
							<div className="h-full w-[42%] rounded-full bg-brand" />
						</div>
						{/* 80% threshold tick */}
						<div
							style={{ left: "80%" }}
							className="absolute -top-1 h-4.5 w-px border-l border-dashed border-muted-foreground/60"
						/>
					</div>

					<div className="mt-2.5 flex items-center justify-between font-mono text-xs">
						<span className="font-medium text-foreground">
							$42.18 <span className="text-muted-foreground">/ $100.00</span>
						</span>
						<span className="text-[11px] text-muted-foreground">
							Alert at 80% · Resets Nov 1
						</span>
					</div>
				</div>
			</Tile>

			{/* 2. Key expiry — narrow (2 cols) */}
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
							cls: "border-border bg-secondary/60 text-foreground",
						},
						{
							n: "ci-runner",
							chip: "30d left",
							cls: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
						},
						{
							n: "demo-contractor",
							chip: "Expired",
							cls: "border-destructive/25 bg-destructive/10 text-destructive",
							dead: true,
						},
					].map((k) => (
						<div
							key={k.n}
							className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs shadow-2xs"
						>
							<span
								className={
									k.dead
										? "text-muted-foreground line-through"
										: "font-medium text-foreground"
								}
							>
								{k.n}
							</span>
							<span
								className={`rounded-full border px-2 py-0.5 font-sans text-[11px] font-medium ${k.cls}`}
							>
								{k.chip}
							</span>
						</div>
					))}
				</div>
			</Tile>

			{/* 3. Smart routing — narrow (2 cols) */}
			<Tile
				span={2}
				title="Smart routing"
				body="Send requests to the auto model and Vichar classifies difficulty, then routes to one of your configured models."
			>
				<div className="w-full rounded-xl border border-border bg-card p-3 shadow-2xs">
					<div className="flex items-center justify-between border-b border-border pb-2">
						<span className="inline-flex items-center gap-1.5 rounded-md bg-brand px-2 py-0.5 font-mono text-xs font-semibold text-white">
							<VicharMark className="size-3" />
							auto
						</span>
						<span className="font-mono text-[11px] text-muted-foreground">
							difficulty: low
						</span>
					</div>
					<div className="mt-2 space-y-1.5 font-mono text-xs">
						{[
							{ m: "vichar-opus-5.5", p: "$4.00/M", picked: false },
							{ m: "vichar-sonnet-5.5", p: "$2.00/M", picked: false },
							{ m: "vichar-haiku-5.5", p: "$0.10/M", picked: true },
						].map((r) => (
							<div
								key={r.m}
								className={`flex items-center justify-between rounded-md px-2 py-1 ${
									r.picked
										? "border border-brand/35 bg-brand/10 font-medium text-brand"
										: "text-muted-foreground"
								}`}
							>
								<span className="flex items-center gap-1.5 truncate">
									{r.picked ? (
										<Check className="size-3 shrink-0" />
									) : (
										<span className="size-3 shrink-0" />
									)}
									{r.m}
								</span>
								<span className="shrink-0 text-[11px]">{r.p}</span>
							</div>
						))}
					</div>
				</div>
			</Tile>

			{/* 4. Prompt caching — wide (4 cols) */}
			<Tile
				span={4}
				title="Prompt caching"
				body="Repeated prompt prefixes hit provider-side caches automatically, and cached input tokens bill at a lower rate."
			>
				<div className="w-full max-w-[520px] rounded-xl border border-border bg-card p-4 shadow-2xs">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<span className="font-mono text-xs font-semibold text-foreground">
								19,600 input tokens
							</span>
							<span className="text-xs text-muted-foreground">
								· system + repo context
							</span>
						</div>
						<span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-success">
							Cache HIT · −90% rate
						</span>
					</div>

					<div className="mt-3 flex h-8 w-full overflow-hidden rounded-lg border border-border font-mono text-xs font-medium">
						<div className="flex w-[78%] items-center justify-between bg-brand px-3 text-white">
							<span>Cached prefix</span>
							<span>18,400 tok</span>
						</div>
						<div className="flex w-[22%] items-center justify-center bg-secondary text-muted-foreground">
							1,200 new
						</div>
					</div>

					<div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
						<span>Cached input: $0.20 / 1M · Standard: $2.00 / 1M</span>
						<span className="font-medium text-foreground">
							Charged $0.0061 instead of $0.0392
						</span>
					</div>
				</div>
			</Tile>

			{/* 5. Shared workspace (3 cols) */}
			<Tile
				span={3}
				title="Shared workspace"
				body="Every key in the organization draws from one prepaid balance, with per-member budgets and roles."
			>
				<div className="w-full max-w-[380px] rounded-xl border border-border bg-card p-3.5 shadow-2xs">
					<div className="flex items-center justify-between border-b border-border pb-2.5">
						<div className="flex items-center gap-2">
							<span className="flex size-5 items-center justify-center rounded bg-brand text-white">
								<VicharMark className="size-3.5" />
							</span>
							<span className="text-xs font-semibold">Acme Engineering</span>
						</div>
						<span className="rounded-full bg-brand/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-brand">
							Balance $184.20
						</span>
					</div>
					<div className="mt-2 space-y-1.5">
						{[
							{ ini: "AM", name: "Ari Morgan", spend: "$28.40", role: "Owner" },
							{ ini: "RS", name: "Rhea Singh", spend: "$19.10", role: "Admin" },
							{
								ini: "KO",
								name: "Ken Ito",
								spend: "$15.98",
								role: "Developer",
							},
						].map((m, i) => (
							<div
								key={m.ini}
								className="flex items-center gap-2.5 text-xs leading-none"
							>
								<span
									className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
									style={{
										backgroundColor: ["#305dde", "#4f80ff", "#0284c7"][i],
									}}
								>
									{m.ini}
								</span>
								<span className="flex-1 truncate font-medium">{m.name}</span>
								<span className="font-mono text-[11px] text-muted-foreground">
									{m.spend}
								</span>
								<span className="rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground">
									{m.role}
								</span>
							</div>
						))}
					</div>
				</div>
			</Tile>

			{/* 6. Rate limits that grow (3 cols) — 5 equal columns, zero collision */}
			<Tile
				span={3}
				title="Rate limits that grow"
				body="New accounts start at 600 requests per minute; tiers raise limits automatically with age and spend."
			>
				<div className="w-full max-w-[380px] rounded-xl border border-border bg-card p-3.5 shadow-2xs">
					<div className="flex items-center justify-between text-xs">
						<span className="font-semibold text-foreground">
							Requests per minute
						</span>
						<span className="font-mono text-[11px] text-muted-foreground">
							600 → 12,000 RPM
						</span>
					</div>
					<div className="mt-3 grid grid-cols-5 items-end gap-2.5 pt-2">
						{TIERS.map((t) => (
							<div key={t.tier} className="flex flex-col items-center">
								<span className="font-mono text-[11px] font-semibold text-foreground">
									{t.rpm}
								</span>
								<div className="mt-1 flex h-[68px] w-full items-end">
									<div
										style={{ height: `${t.h}%` }}
										className={`w-full rounded-t-md ${t.opacity}`}
									/>
								</div>
								<span className="mt-1.5 font-mono text-[11px] text-muted-foreground">
									{t.tier}
								</span>
							</div>
						))}
					</div>
				</div>
			</Tile>
		</div>
	);
}
