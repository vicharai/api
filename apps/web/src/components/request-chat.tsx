"use client";

import { motion } from "motion/react";

const BUBBLES: Array<{ from: "app" | "vichar"; text: string; meta?: string }> =
	[
		{
			from: "app",
			text: "POST /v1/chat/completions",
			meta: 'model: "vichar-sonnet-5.5"',
		},
		{
			from: "vichar",
			text: "Primary route timed out. Retrying on another route.",
		},
		{ from: "vichar", text: "200 OK · streamed", meta: "640 ms · 412 tokens" },
		{ from: "app", text: "How much did that cost?" },
		{ from: "vichar", text: "$0.0021, logged to key production-backend." },
	];

/** Sequenced request/response bubbles for the "how it works" panel. */
export function RequestChat() {
	return (
		<motion.ul
			className="flex flex-col gap-2.5"
			initial="hidden"
			whileInView="show"
			viewport={{ once: true, margin: "-80px" }}
			variants={{ show: { transition: { staggerChildren: 0.45 } } }}
			aria-label="Example request handled by Vichar"
		>
			{BUBBLES.map((b) => (
				<motion.li
					key={b.text}
					variants={{
						hidden: { opacity: 0, y: 8, scale: 0.96 },
						show: {
							opacity: 1,
							y: 0,
							scale: 1,
							transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
						},
					}}
					className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug ${
						b.from === "app"
							? "self-end rounded-br-md bg-brand text-white"
							: "self-start rounded-bl-md bg-card text-foreground shadow-[0_1px_2px_rgb(16_24_40/0.06)]"
					}`}
				>
					<span className="block">{b.text}</span>
					{b.meta && (
						<span
							className={`mt-0.5 block font-mono text-[11px] ${
								b.from === "app" ? "text-white/75" : "text-muted-foreground"
							}`}
						>
							{b.meta}
						</span>
					)}
				</motion.li>
			))}
		</motion.ul>
	);
}
