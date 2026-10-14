import { Check } from "lucide-react";

import { VicharMark } from "@/lib/vichar-logo";

import type { ReactNode } from "react";

/**
 * One container level per tile: the visual sits directly on the card above a
 * hairline, then title + copy. Monochrome + brand blue only.
 */
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
			className="reveal flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-foreground/20"
			style={{ "--span": `span ${span}` } as React.CSSProperties}
		>
			<div
				aria-hidden="true"
				className="flex h-[200px] flex-col justify-center border-b border-border/70 px-6"
			>
				{children}
			</div>
			<div className="px-6 pb-6 pt-5">
				<h3 className="font-display text-[15px] font-semibold tracking-tight">
					{title}
				</h3>
				<p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
					{body}
				</p>
			</div>
		</div>
	);
}

const mono = "font-mono text-[12px]";

function SpendVisual() {
	const filled = 8; // 42% of 20 segments, rounded down
	return (
		<div className="w-full">
			<div className="flex items-baseline justify-between gap-4">
				<div className="min-w-0">
					<p className="truncate text-[13px] font-medium text-foreground">
						production-backend
					</p>
					<p className={`${mono} text-muted-foreground`}>vc_7fK…a91</p>
				</div>
				<p className={`${mono} shrink-0 text-muted-foreground`}>
					monthly limit
				</p>
			</div>
			<p className="mt-4 font-display text-[28px] font-semibold leading-none tracking-tight tabular-nums">
				$42.18
				<span className="ml-1.5 text-base font-medium text-muted-foreground">
					of $100.00
				</span>
			</p>
			<div className="mt-3 grid grid-cols-20 gap-[3px]">
				{Array.from({ length: 20 }, (_, i) => (
					<span
						key={i}
						className={`h-2.5 rounded-[2px] ${i < filled ? "bg-brand" : "bg-foreground/[0.08]"}`}
					/>
				))}
			</div>
			<p className={`${mono} mt-2.5 text-muted-foreground`}>
				Resets Nov 1 · key pauses at the limit
			</p>
		</div>
	);
}

function ExpiryVisual() {
	const rows = [
		{ name: "production", state: "No expiry", tone: "text-muted-foreground" },
		{ name: "ci-runner", state: "Expires in 30d", tone: "text-brand" },
		{
			name: "contractor-demo",
			state: "Expired",
			tone: "text-muted-foreground",
			dead: true,
		},
	];
	return (
		<div className="w-full divide-y divide-border/70">
			{rows.map((r) => (
				<div
					key={r.name}
					className="flex items-center justify-between gap-3 py-2.5"
				>
					<span
						className={`${mono} truncate ${
							r.dead
								? "text-muted-foreground line-through decoration-foreground/30"
								: "text-foreground"
						}`}
					>
						{r.name}
					</span>
					<span className={`${mono} shrink-0 ${r.tone}`}>{r.state}</span>
				</div>
			))}
		</div>
	);
}

function RoutingVisual() {
	const models = [
		{ id: "vichar-opus-5.5", price: "$4.00" },
		{ id: "vichar-sonnet-5.5", price: "$2.00" },
		{ id: "vichar-haiku-5.5", price: "$0.10", picked: true },
	];
	return (
		<div className="w-full">
			<div className="flex items-center justify-between gap-3">
				<span className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2 py-1 font-mono text-[11px] font-medium text-background">
					<VicharMark className="size-3" />
					auto
				</span>
				<span className={`${mono} text-muted-foreground`}>simple prompt</span>
			</div>
			<div className="mt-3 space-y-0.5">
				{models.map((m) => (
					<div
						key={m.id}
						className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 ${
							m.picked ? "bg-brand/[0.08]" : ""
						}`}
					>
						<span
							className={`${mono} flex min-w-0 items-center gap-2 ${
								m.picked ? "text-brand" : "text-muted-foreground"
							}`}
						>
							<span className="flex size-3 shrink-0 items-center justify-center">
								{m.picked && <Check className="size-3" strokeWidth={2.5} />}
							</span>
							<span className="truncate">{m.id}</span>
						</span>
						<span
							className={`${mono} shrink-0 tabular-nums ${
								m.picked ? "text-brand" : "text-muted-foreground"
							}`}
						>
							{m.price}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function CachingVisual() {
	// vichar-sonnet-5.5: input $2.00/M, cached input $0.10/M
	return (
		<div className="w-full">
			<div className="flex items-baseline justify-between gap-4">
				<p className="text-[13px] font-medium text-foreground">
					19,600 input tokens
				</p>
				<p className={`${mono} text-muted-foreground`}>vichar-sonnet-5.5</p>
			</div>
			<div className="mt-3 flex h-3 w-full gap-[3px]">
				<span
					className="h-full rounded-[3px] bg-brand"
					style={{ width: "94%" }}
				/>
				<span className="h-full flex-1 rounded-[3px] bg-foreground/[0.12]" />
			</div>
			<div
				className={`${mono} mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-muted-foreground`}
			>
				<span>
					<span className="text-brand">18,400</span> cached · $0.10/M
				</span>
				<span>1,200 new · $2.00/M</span>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-4 border-t border-border/70 pt-3">
				<div>
					<p className={`${mono} text-muted-foreground`}>without cache</p>
					<p className="mt-0.5 font-mono text-[15px] text-muted-foreground line-through decoration-foreground/30">
						$0.0392
					</p>
				</div>
				<div>
					<p className={`${mono} text-muted-foreground`}>with cache</p>
					<p className="mt-0.5 font-mono text-[15px] font-medium text-foreground">
						$0.0042
					</p>
				</div>
			</div>
		</div>
	);
}

function WorkspaceVisual() {
	const members = [
		{ ini: "AM", name: "Ari Morgan", role: "owner", spend: "$28.40" },
		{ ini: "RS", name: "Rhea Singh", role: "admin", spend: "$19.10" },
		{ ini: "KI", name: "Ken Ito", role: "developer", spend: "$15.98" },
	];
	return (
		<div className="w-full">
			<div className="flex items-baseline justify-between gap-3 pb-2">
				<p className="text-[13px] font-medium text-foreground">
					Acme Engineering
				</p>
				<p className={`${mono} text-muted-foreground`}>
					shared balance <span className="text-foreground">$184.20</span>
				</p>
			</div>
			<div className="divide-y divide-border/70 border-t border-border/70">
				{members.map((m) => (
					<div key={m.ini} className="flex items-center gap-3 py-2">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] text-[10px] font-semibold text-foreground">
							{m.ini}
						</span>
						<span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
							{m.name}
						</span>
						<span className={`${mono} w-20 text-muted-foreground`}>
							{m.role}
						</span>
						<span
							className={`${mono} w-14 text-right tabular-nums text-foreground`}
						>
							{m.spend}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function RateLimitVisual() {
	const tiers = [
		{ rpm: "600", h: 14, tone: "bg-brand/30" },
		{ rpm: "1.2k", h: 24, tone: "bg-brand/45" },
		{ rpm: "2.4k", h: 40, tone: "bg-brand/60" },
		{ rpm: "6k", h: 66, tone: "bg-brand/80" },
		{ rpm: "12k", h: 100, tone: "bg-brand" },
	];
	return (
		<div className="w-full">
			<div className="flex items-baseline justify-between gap-3">
				<p className="text-[13px] font-medium text-foreground">
					Requests per minute
				</p>
				<p className={`${mono} text-muted-foreground`}>by tier</p>
			</div>
			<div className="mt-3 grid grid-cols-5 items-end gap-2">
				{tiers.map((t, i) => (
					<div key={t.rpm} className="flex flex-col items-center">
						<span
							className={`${mono} tabular-nums ${i === tiers.length - 1 ? "text-foreground" : "text-muted-foreground"}`}
						>
							{t.rpm}
						</span>
						<div className="mt-1.5 flex h-[78px] w-full items-end">
							<span
								style={{ height: `${t.h}%` }}
								className={`w-full rounded-t-[3px] ${t.tone}`}
							/>
						</div>
						<span className={`${mono} mt-1.5 text-muted-foreground`}>T{i}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function BentoFeatures() {
	return (
		<div className="bento-grid mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
			<Tile
				span={4}
				title="Spend limits per key"
				body="Cap any API key at a fixed total or a recurring daily, weekly, or monthly budget, so a runaway job cannot drain your balance."
			>
				<SpendVisual />
			</Tile>
			<Tile
				span={2}
				title="Key expiry"
				body="Give keys a lifetime for contractors, demos, or rotating services. They stop working at the time you set."
			>
				<ExpiryVisual />
			</Tile>
			<Tile
				span={2}
				title="Smart routing"
				body="Send requests to auto and Vichar picks one of your configured models based on how hard the prompt is."
			>
				<RoutingVisual />
			</Tile>
			<Tile
				span={4}
				title="Prompt caching"
				body="Repeated prompt prefixes hit provider caches, and cached input tokens are billed at the model's lower cached rate."
			>
				<CachingVisual />
			</Tile>
			<Tile
				span={3}
				title="Shared workspace"
				body="Every key in the workspace draws from one prepaid balance, with roles and per-member budgets."
			>
				<WorkspaceVisual />
			</Tile>
			<Tile
				span={3}
				title="Rate limits that grow"
				body="New accounts start at 600 requests per minute. Limits rise automatically as your account ages and spends."
			>
				<RateLimitVisual />
			</Tile>
		</div>
	);
}
