"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hero art: the glass cloud routes one request at a time down a thread to a
 * model. Fixed 560x520 canvas, scaled to its container. Reduced motion shows
 * a single static route.
 */

const W = 560;
const H = 520;
const ORIGIN = { x: 280, y: 296 };
const NODE_Y = 428;
const NODE_R = 21;

const ROUTES = [
	{ icon: "claude", model: "vichar-opus-5.5", x: 64 },
	{ icon: "openai", model: "vichar-gpt-5.6", x: 172 },
	{ icon: "gemini", model: "vichar-gemini-3.1-pro", x: 280 },
	{ icon: "grok", model: "vichar-grok-4.7", x: 388 },
	{ icon: "deepseek", model: "vichar-deepseek-v4-pro", x: 496 },
];

const threadPath = (x: number) =>
	`M ${ORIGIN.x} ${ORIGIN.y} C ${ORIGIN.x} ${ORIGIN.y + 70}, ${x} ${NODE_Y - 90}, ${x} ${NODE_Y - NODE_R}`;

export function HeroVisual() {
	const [active, setActive] = useState(1);
	const [scale, setScale] = useState(1);
	const boxRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = boxRef.current;
		if (!el) {
			return;
		}
		const ro = new ResizeObserver(([entry]) =>
			setScale(entry.contentRect.width / W),
		);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			return;
		}
		const id = setInterval(
			() => setActive((i) => (i + 1) % ROUTES.length),
			2400,
		);
		return () => clearInterval(id);
	}, []);

	return (
		<div aria-hidden="true" className="w-full max-w-[560px]">
			<div
				ref={boxRef}
				className="relative w-full overflow-hidden"
				style={{ aspectRatio: `${W} / ${H}` }}
			>
				<div
					className="absolute left-0 top-0 origin-top-left"
					style={{
						width: W,
						height: H,
						transform: `scale(${scale})`,
					}}
				>
					{/* Threads */}
					<svg
						viewBox={`0 0 ${W} ${H}`}
						width={W}
						height={H}
						className="absolute inset-0"
						fill="none"
					>
						{ROUTES.map((r) => (
							<path
								key={r.icon}
								d={threadPath(r.x)}
								className="stroke-foreground/[0.12]"
								strokeWidth="1"
							/>
						))}
						<path
							key={`pulse-${active}`}
							d={threadPath(ROUTES[active].x)}
							className="hero-pulse stroke-brand"
							strokeWidth="1.5"
							strokeLinecap="round"
							pathLength={100}
							strokeDasharray="22 100"
						/>
						<path
							d={threadPath(ROUTES[active].x)}
							className="stroke-brand/35 transition-all duration-500"
							strokeWidth="1"
						/>
					</svg>

					{/* Cloud (baked per theme; background equals page bg) */}
					<img
						src="/hero/cloud-glass-light.webp"
						alt=""
						width={1200}
						height={936}
						fetchPriority="high"
						className="hero-cloud absolute left-1/2 top-0 w-[400px] -translate-x-1/2 dark:hidden"
					/>
					<img
						src="/hero/cloud-glass-dark.webp"
						alt=""
						width={1200}
						height={936}
						fetchPriority="high"
						className="hero-cloud absolute left-1/2 top-0 hidden w-[400px] -translate-x-1/2 dark:block"
					/>

					{/* Model nodes */}
					{ROUTES.map((r, i) => {
						const on = i === active;
						return (
							<div
								key={r.icon}
								style={{
									left: r.x - NODE_R,
									top: NODE_Y - NODE_R,
									width: NODE_R * 2,
									height: NODE_R * 2,
								}}
								className={`absolute flex items-center justify-center rounded-full border bg-card transition-all duration-500 ${
									on
										? "border-brand/50 shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_12%,transparent),0_6px_16px_-6px_color-mix(in_srgb,var(--brand)_45%,transparent)]"
										: "border-border shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
								}`}
							>
								<img
									src={`/labs/${r.icon}.svg`}
									alt=""
									className={`size-[18px] transition-opacity duration-500 dark:invert ${
										on ? "opacity-100" : "opacity-45"
									}`}
								/>
							</div>
						);
					})}

					{/* Current route */}
					<div
						style={{ top: NODE_Y + NODE_R + 22 }}
						className="absolute inset-x-0 flex justify-center"
					>
						<span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
							<span className="text-muted-foreground">model:</span>
							<span
								key={ROUTES[active].model}
								className="hero-model-swap text-foreground"
							>
								"{ROUTES[active].model}"
							</span>
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
