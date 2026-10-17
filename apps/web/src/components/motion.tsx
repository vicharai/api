"use client";

import { motion, MotionConfig } from "motion/react";

import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function MotionProvider({ children }: { children: ReactNode }) {
	return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function FadeIn({
	children,
	delay = 0,
	y = 12,
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
			transition={{ duration: 0.5, ease: EASE, delay }}
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
				hidden: { opacity: 0, y: 12 },
				show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
			}}
		>
			{children}
		</motion.div>
	);
}
