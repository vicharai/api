"use client";

import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

/** Animated accordion; first item open by default. */
export function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
	const [open, setOpen] = useState<string | null>(items[0]?.q ?? null);
	return (
		<ul className="divide-y divide-border border-y border-border">
			{items.map((f) => {
				const isOpen = open === f.q;
				return (
					<li key={f.q}>
						<button
							type="button"
							onClick={() => setOpen(isOpen ? null : f.q)}
							aria-expanded={isOpen}
							className="flex w-full items-center justify-between gap-6 py-5 text-left text-[17px] font-medium text-foreground"
						>
							{f.q}
							<motion.span
								animate={{ rotate: isOpen ? 45 : 0 }}
								transition={{ duration: 0.2 }}
								className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors ${
									isOpen ? "bg-g-blue-soft text-g-blue-deep" : "bg-surface-2"
								}`}
							>
								<Plus className="size-4" />
							</motion.span>
						</button>
						<AnimatePresence initial={false}>
							{isOpen && (
								<motion.div
									initial={{ height: 0, opacity: 0 }}
									animate={{ height: "auto", opacity: 1 }}
									exit={{ height: 0, opacity: 0 }}
									transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
									className="overflow-hidden"
								>
									<p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-body">
										{f.a}
									</p>
								</motion.div>
							)}
						</AnimatePresence>
					</li>
				);
			})}
		</ul>
	);
}
