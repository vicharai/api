"use client";

import {
	animate,
	motion,
	MotionConfig,
	useInView,
	useMotionValue,
	useTransform,
} from "motion/react";
import { useEffect, useRef } from "react";

import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function MotionProvider({ children }: { children: ReactNode }) {
	return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function FadeIn({
	children,
	delay = 0,
	y = 18,
	className,
}: {
	children: ReactNode;
	delay?: number;
	y?: number;
	className?: string;
}) {
	return (
		<motion.div
			className={className}
			initial={{ opacity: 0, y }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-60px" }}
			transition={{ duration: 0.6, ease: EASE, delay }}
		>
			{children}
		</motion.div>
	);
}

export function Stagger({
	children,
	className,
	gap = 0.07,
}: {
	children: ReactNode;
	className?: string;
	gap?: number;
}) {
	return (
		<motion.div
			className={className}
			initial="hidden"
			whileInView="show"
			viewport={{ once: true, margin: "-60px" }}
			variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
		>
			{children}
		</motion.div>
	);
}

export function StaggerItem({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<motion.div
			className={className}
			variants={{
				hidden: { opacity: 0, y: 16 },
				show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
			}}
		>
			{children}
		</motion.div>
	);
}

/** Lifts a card slightly on hover. */
export function HoverLift({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<motion.div
			className={className}
			whileHover={{ y: -4 }}
			transition={{ type: "spring", stiffness: 300, damping: 22 }}
		>
			{children}
		</motion.div>
	);
}

/** Counts up to `value` once scrolled into view. */
export function CountUp({
	value,
	prefix = "",
	suffix = "",
	decimals = 0,
}: {
	value: number;
	prefix?: string;
	suffix?: string;
	decimals?: number;
}) {
	const ref = useRef<HTMLSpanElement>(null);
	const inView = useInView(ref, { once: true });
	const mv = useMotionValue(0);
	const text = useTransform(
		mv,
		(v) => `${prefix}${v.toFixed(decimals)}${suffix}`,
	);
	useEffect(() => {
		if (!inView) {
			return;
		}
		const controls = animate(mv, value, { duration: 1.4, ease: EASE });
		return () => controls.stop();
	}, [inView, mv, value]);
	return (
		<motion.span ref={ref} aria-label={`${prefix}${value}${suffix}`}>
			{text}
		</motion.span>
	);
}
