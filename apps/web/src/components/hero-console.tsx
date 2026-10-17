"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

interface Row {
	key: number;
	model: string;
	route: string;
	status: "200" | "retry→200";
	latency: number;
	tokens: number;
	cost: number;
}

const ROUTES = ["primary", "secondary", "edge-us", "edge-eu", "edge-ap"];

const REPLY =
	"Sure. Here is a summary of the quarterly report in three bullet points, with the key numbers highlighted…";

function makeRow(key: number, models: string[]): Row {
	// Deterministic pseudo-random so SSR and first client render agree.
	const r = (n: number) => {
		const a = key * 9301;
		const b = n * 49297;
		return ((a + b) % 233280) / 233280;
	};
	const tokens = 200 + Math.round(r(1) * 2400);
	const spread = r(5) * 14;
	const rate = 2 + spread;
	return {
		key,
		model: models[key % models.length] ?? "auto",
		route: ROUTES[Math.abs(key) % ROUTES.length] ?? "primary",
		status: Math.abs(key) % 7 === 3 ? "retry→200" : "200",
		latency: 180 + Math.round(r(4) * 900),
		tokens,
		cost: (tokens / 1_000_000) * rate,
	};
}

export function HeroConsole({ models }: { models: string[] }) {
	const [tick, setTick] = useState(4);
	const [chars, setChars] = useState(0);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setChars(REPLY.length);
			return;
		}
		const id = window.setInterval(() => setTick((t) => t + 1), 2400);
		const typer = window.setInterval(
			() => setChars((c) => (c >= REPLY.length + 30 ? 0 : c + 1)),
			45,
		);
		return () => {
			window.clearInterval(id);
			window.clearInterval(typer);
		};
	}, []);

	const rows = Array.from({ length: 5 }, (_, i) => makeRow(tick - i, models));
	const spend = rows.reduce((s, r) => s + r.cost, 0);

	return (
		<div className="relative">
			<div
				aria-hidden="true"
				className="absolute -inset-6 rounded-[32px] bg-brand-gradient opacity-[0.12] blur-2xl"
			/>
			<div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-float">
				<div className="flex items-center justify-between border-b border-border bg-canvas px-4 py-2.5">
					<div className="flex items-center gap-1.5">
						<span className="size-2.5 rounded-full bg-coral/80" />
						<span className="size-2.5 rounded-full bg-amber/80" />
						<span className="size-2.5 rounded-full bg-success/80" />
					</div>
					<span className="font-mono text-[11px] text-muted-foreground">
						api.vichar.io/v1 · sample traffic
					</span>
					<span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
						<span className="live-dot size-1.5 rounded-full bg-success" />
						Live
					</span>
				</div>

				<div className="grid grid-cols-3 divide-x divide-border border-b border-border">
					{[
						[
							"Requests",
							Math.round(1280 + Math.imul(tick, 3)).toLocaleString("en-US"),
						],
						["p50 latency", `${rows[0]?.latency ?? 0} ms`],
						["Spend (5 req)", `$${spend.toFixed(4)}`],
					].map(([label, value]) => (
						<div key={label} className="px-4 py-3">
							<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
								{label}
							</p>
							<p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
								{value}
							</p>
						</div>
					))}
				</div>

				<ul className="relative h-[232px] overflow-hidden px-2 py-2 font-mono text-[11.5px]">
					<AnimatePresence initial={false}>
						{rows.map((r) => (
							<motion.li
								key={r.key}
								layout
								initial={{ opacity: 0, y: -14, scale: 0.98 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
								className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-lg px-2.5 py-2 odd:bg-secondary/50"
							>
								<span
									className={
										r.status === "200"
											? "rounded bg-success/12 px-1.5 py-0.5 text-[10px] font-semibold text-success"
											: "rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning"
									}
								>
									{r.status}
								</span>
								<span className="truncate text-foreground">
									{r.model}
									<span className="text-muted-foreground"> → {r.route}</span>
								</span>
								<span className="text-right tabular-nums text-muted-foreground">
									{r.latency}ms
								</span>
								<span className="w-16 text-right tabular-nums text-foreground">
									${r.cost.toFixed(4)}
								</span>
							</motion.li>
						))}
					</AnimatePresence>
				</ul>

				<div className="border-t border-border bg-canvas px-4 py-3">
					<p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
						stream · {rows[0]?.model}
					</p>
					<p className="mt-1 min-h-[40px] text-[13px] leading-relaxed text-foreground">
						{REPLY.slice(0, Math.min(chars, REPLY.length))}
						<span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-brand" />
					</p>
				</div>
			</div>
		</div>
	);
}
