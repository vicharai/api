"use client";

import { motion, useReducedMotion } from "motion/react";

interface Shape {
	className: string;
	style: React.CSSProperties;
	drift: { x?: number[]; y?: number[]; rotate?: number[] };
	duration: number;
}

const HERO: Shape[] = [
	{
		className: "size-20 rounded-full bg-g-blue",
		style: { left: "-2.5rem", top: "34%" },
		drift: { y: [0, -14, 0] },
		duration: 9,
	},
	{
		className: "h-14 w-28 rounded-t-full bg-g-yellow",
		style: { right: "6%", top: "-1.75rem" },
		drift: { rotate: [0, 8, 0] },
		duration: 11,
	},
	{
		className: "size-16 rounded-[18px] bg-g-red",
		style: { right: "-2rem", top: "46%" },
		drift: { rotate: [12, 30, 12], y: [0, 10, 0] },
		duration: 12,
	},
	{
		className: "h-10 w-28 rounded-full bg-g-green",
		style: { left: "12%", bottom: "-1.25rem" },
		drift: { x: [0, 16, 0] },
		duration: 10,
	},
];

const CTA: Shape[] = [
	{
		className: "size-40 rounded-full bg-white/10",
		style: { left: "-3rem", top: "-3rem" },
		drift: { y: [0, 12, 0] },
		duration: 10,
	},
	{
		className: "h-16 w-32 rounded-t-full bg-g-yellow",
		style: { right: "8%", bottom: "-0.5rem" },
		drift: { rotate: [0, -6, 0] },
		duration: 11,
	},
	{
		className: "size-14 rounded-[16px] bg-g-red",
		style: { right: "18%", top: "18%" },
		drift: { rotate: [10, 28, 10] },
		duration: 12,
	},
	{
		className: "size-8 rounded-full bg-g-green",
		style: { left: "16%", bottom: "20%" },
		drift: { y: [0, -10, 0] },
		duration: 8,
	},
];

/** Flat, slowly drifting brand shapes. `set` picks the arrangement. */
export function GShapes({ set = "hero" }: { set?: "hero" | "cta" }) {
	const reduce = useReducedMotion();
	const shapes = set === "hero" ? HERO : CTA;
	return (
		<div aria-hidden="true" className="pointer-events-none absolute inset-0">
			{shapes.map((s) => (
				<motion.span
					key={s.className}
					className={`absolute ${s.className}`}
					style={s.style}
					initial={{ opacity: 0, scale: 0.6 }}
					animate={
						reduce
							? { opacity: 1, scale: 1 }
							: { opacity: 1, scale: 1, ...s.drift }
					}
					transition={{
						opacity: { duration: 0.6 },
						scale: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
						default: {
							duration: s.duration,
							repeat: Infinity,
							ease: "easeInOut",
						},
					}}
				/>
			))}
		</div>
	);
}
