"use client";

import { motion, useReducedMotion } from "motion/react";

import { ProviderLogo } from "@/components/provider-logo";
import { VicharMark } from "@/lib/vichar-logo";

/** Lab cards placed on two orbits; x/y are percentages of the square. */
const NODES = [
	{ name: "OpenAI", logo: "openai", tag: "GPT", x: 18, y: 14 },
	{ name: "Claude", logo: "anthropic", tag: "Reasoning", x: 78, y: 12 },
	{ name: "Gemini", logo: "google-ai-studio", tag: "Multimodal", x: 88, y: 50 },
	{ name: "DeepSeek", logo: "deepseek", tag: "Open weights", x: 76, y: 86 },
	{ name: "Grok", logo: "xai", tag: "Realtime", x: 24, y: 88 },
	{ name: "Qwen", logo: "alibaba", tag: "Coding", x: 8, y: 52 },
	{ name: "Kimi", logo: "moonshot", tag: "Long context", x: 50, y: 4 },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function ModelUniverse() {
	const reduce = useReducedMotion();
	return (
		<div
			className="relative mx-auto aspect-square w-full max-w-[520px]"
			role="img"
			aria-label="Vichar connects your app to models from OpenAI, Anthropic, Google, DeepSeek, xAI, Alibaba and Moonshot"
		>
			{[92, 64, 36].map((size, i) => (
				<motion.div
					key={size}
					aria-hidden="true"
					className="absolute left-1/2 top-1/2 rounded-full border border-dashed border-border"
					style={{
						width: `${size}%`,
						height: `${size}%`,
						x: "-50%",
						y: "-50%",
					}}
					initial={{ opacity: 0, scale: 0.85 }}
					whileInView={{ opacity: 1, scale: 1 }}
					viewport={{ once: true }}
					transition={{ duration: 0.8, ease: EASE, delay: i * 0.08 }}
				/>
			))}

			{/* A request travelling around the outer orbit. */}
			{!reduce && (
				<motion.div
					aria-hidden="true"
					className="absolute left-1/2 top-1/2 size-[92%]"
					style={{ x: "-50%", y: "-50%" }}
					animate={{ rotate: 360 }}
					transition={{ duration: 18, ease: "linear", repeat: Infinity }}
				>
					<span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" />
				</motion.div>
			)}
			{!reduce && (
				<motion.div
					aria-hidden="true"
					className="absolute left-1/2 top-1/2 size-[64%]"
					style={{ x: "-50%", y: "-50%" }}
					animate={{ rotate: -360 }}
					transition={{ duration: 26, ease: "linear", repeat: Infinity }}
				>
					<span className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-orange" />
				</motion.div>
			)}

			<motion.div
				className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
				initial={{ opacity: 0, scale: 0.9 }}
				whileInView={{ opacity: 1, scale: 1 }}
				viewport={{ once: true }}
				transition={{ duration: 0.6, ease: EASE, delay: 0.2 }}
			>
				<span className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card shadow-[0_2px_8px_rgb(16_24_40/0.06)]">
					<VicharMark className="size-8 text-brand" />
				</span>
				<span className="mt-2 text-sm font-semibold">Vichar</span>
				<span className="font-mono text-[10px] text-muted-foreground">/v1</span>
			</motion.div>

			{NODES.map((n, i) => (
				<motion.div
					key={n.name}
					className="absolute"
					style={{ left: `${n.x}%`, top: `${n.y}%`, x: "-50%", y: "-50%" }}
					initial={{ opacity: 0, y: "-30%" }}
					whileInView={{ opacity: 1, y: "-50%" }}
					viewport={{ once: true }}
					transition={{
						duration: 0.6,
						ease: EASE,
						delay: 0.3 + Math.fround(i * 0.07),
					}}
				>
					<motion.div
						animate={reduce ? undefined : { y: [0, -5, 0] }}
						transition={{
							duration: 4 + (i % 3),
							ease: "easeInOut",
							repeat: Infinity,
							delay: i * 0.4,
						}}
						className="rounded-lg border border-border bg-card shadow-[0_1px_3px_rgb(16_24_40/0.06)]"
					>
						<span className="block border-b border-border px-2.5 py-1 text-[10px] text-muted-foreground">
							{n.tag}
						</span>
						<span className="flex items-center gap-2 px-3 py-2">
							<ProviderLogo id={n.logo} className="size-4 text-foreground" />
							<span className="text-[13px] font-semibold">{n.name}</span>
						</span>
					</motion.div>
				</motion.div>
			))}
		</div>
	);
}
