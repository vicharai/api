"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { ProviderLogo } from "@/components/provider-logo";
import { VicharMark } from "@/lib/vichar-logo";

const TARGETS = [
	{ logo: "openai", lab: "OpenAI", model: "vichar-gpt-5.6", ms: 712 },
	{ logo: "anthropic", lab: "Anthropic", model: "vichar-opus-5.5", ms: 640 },
	{
		logo: "google-ai-studio",
		lab: "Google",
		model: "vichar-gemini-3.1-pro",
		ms: 538,
	},
	{ logo: "xai", lab: "xAI", model: "vichar-grok-4.7", ms: 455 },
	{
		logo: "deepseek",
		lab: "DeepSeek",
		model: "vichar-deepseek-v4-pro",
		ms: 820,
	},
	{ logo: "moonshot", lab: "Moonshot", model: "vichar-kimi-k3", ms: 690 },
];

// SVG coordinate space; nodes are positioned in % of the same box.
const W = 800;
const H = 380;
const APP = { x: 90, y: H / 2 };
const HUB = { x: 380, y: H / 2 };
const TX = 700;
const ty = (i: number) => {
	const step = (H - 60) / (TARGETS.length - 1);
	const offset = step * i;
	return 30 + offset;
};

function curve(i: number) {
	const y = ty(i);
	return `M ${HUB.x} ${HUB.y} C ${HUB.x + 160} ${HUB.y}, ${TX - 160} ${y}, ${TX} ${y}`;
}

const pct = (x: number, y: number) => ({
	left: `${(x / W) * 100}%`,
	top: `${(y / H) * 100}%`,
});

const COLORS = [
	"var(--g-blue)",
	"var(--g-red)",
	"var(--g-yellow)",
	"var(--g-green)",
];

/** Your app → Vichar → one of many labs, cycling through example requests. */
export function RoutingFlow() {
	const reduce = useReducedMotion();
	const [active, setActive] = useState(1);

	useEffect(() => {
		if (reduce) {
			return;
		}
		const id = window.setInterval(
			() => setActive((a) => (a + 1) % TARGETS.length),
			2200,
		);
		return () => window.clearInterval(id);
	}, [reduce]);

	const t = TARGETS[active] ?? TARGETS[0];
	const color = COLORS[active % COLORS.length];

	return (
		<div>
			<div
				className="relative aspect-[800/620] w-full sm:aspect-[800/380]"
				role="img"
				aria-label="Your app sends one request to Vichar, which routes it to OpenAI, Anthropic, Google, xAI, DeepSeek or Moonshot"
			>
				<svg
					viewBox={`0 0 ${W} ${H}`}
					className="absolute inset-0 size-full"
					preserveAspectRatio="none"
					fill="none"
					aria-hidden="true"
				>
					<line
						x1={APP.x}
						y1={APP.y}
						x2={HUB.x}
						y2={HUB.y}
						className="stroke-border"
						strokeWidth={1.5}
						vectorEffect="non-scaling-stroke"
					/>
					{!reduce && (
						<motion.circle
							r={3.5}
							className="fill-brand"
							cy={APP.y}
							animate={{ cx: [APP.x, HUB.x] }}
							transition={{
								duration: 1,
								ease: "easeInOut",
								repeat: Infinity,
								repeatDelay: 1.2,
							}}
						/>
					)}
					{TARGETS.map((target, i) => (
						<motion.path
							key={target.logo}
							d={curve(i)}
							strokeWidth={1.5}
							vectorEffect="non-scaling-stroke"
							className="stroke-border"
							initial={{ pathLength: 0 }}
							whileInView={{ pathLength: 1 }}
							viewport={{ once: true }}
							transition={{ duration: 0.9, delay: 0.1 * i, ease: "easeOut" }}
						/>
					))}
					<motion.path
						key={active}
						d={curve(active)}
						strokeWidth={2}
						vectorEffect="non-scaling-stroke"
						style={{ stroke: color }}
						initial={{ pathLength: 0, opacity: 1 }}
						animate={{ pathLength: 1, opacity: 1 }}
						transition={{ duration: 0.7, ease: "easeInOut" }}
					/>
				</svg>

				<div
					className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
					style={pct(APP.x, APP.y)}
				>
					<span className="flex size-12 items-center justify-center rounded-full border border-border bg-card font-mono text-[11px] font-semibold text-body">
						{"</>"}
					</span>
					<span className="mt-2 text-xs text-muted-foreground">Your app</span>
				</div>

				<div
					className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
					style={pct(HUB.x, HUB.y)}
				>
					<span className="flex size-12 items-center justify-center rounded-2xl sm:size-16 border border-border bg-card shadow-[0_2px_8px_rgb(16_24_40/0.06)]">
						<VicharMark className="size-6 text-brand sm:size-8" />
					</span>
					<span className="mt-2 text-xs font-medium">Vichar</span>
				</div>

				{TARGETS.map((target, i) => (
					<div
						key={target.logo}
						className="absolute -translate-x-1/2 -translate-y-1/2"
						style={pct(TX + 26, ty(i))}
					>
						<span
							className={`flex size-9 items-center sm:size-11 justify-center rounded-full border bg-card transition-all duration-300 ${
								i === active ? "scale-110" : "border-border"
							}`}
							style={
								i === active
									? {
											borderColor: color,
											boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent)`,
										}
									: undefined
							}
							title={target.lab}
						>
							<ProviderLogo
								id={target.logo}
								className="size-5 text-foreground"
							/>
						</span>
					</div>
				))}
			</div>

			<div className="mx-auto mt-4 flex h-9 max-w-md items-center justify-center overflow-hidden whitespace-nowrap rounded-md border border-border bg-canvas px-3 font-mono text-[11px] sm:text-xs">
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={t.model}
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.2 }}
						className="truncate"
					>
						<span className="text-muted-foreground">example · </span>
						<span className="text-foreground">{t.model}</span>
						<span className="text-muted-foreground"> → {t.lab} · </span>
						<span className="text-success">200</span>
						<span className="text-muted-foreground"> · {t.ms} ms</span>
					</motion.span>
				</AnimatePresence>
			</div>
		</div>
	);
}
