"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

import type { ReactNode } from "react";

/** Product shot that settles from a slight tilt into place as you scroll. */
export function HeroShot({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const { scrollYProgress } = useScroll({
		target: ref,
		offset: ["start end", "start 30%"],
	});
	const rotateX = useTransform(scrollYProgress, [0, 1], [10, 0]);
	const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
	return (
		<div ref={ref} style={{ perspective: 1600 }}>
			<motion.div
				style={{ rotateX, scale, transformOrigin: "50% 0%" }}
				className="rounded-xl border border-border bg-card p-1.5 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_20px_40px_-24px_rgb(16_24_40/0.18)]"
			>
				{children}
			</motion.div>
		</div>
	);
}
