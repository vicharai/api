"use client";

import { Check, Copy } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

const TOKEN =
	/(\/\/[^\n]*|#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:import|from|const|await|new|async|return|print|def|export)\b|\b\d+(?:\.\d+)?\b)/g;

function colorFor(t: string) {
	if (t.startsWith("//") || (t.startsWith("#") && !t.startsWith("#!"))) {
		return "text-[#9aa0a6]";
	}
	if (/^["'`]/.test(t)) {
		return "text-[#81c995]";
	}
	if (/^\d/.test(t)) {
		return "text-[#fdd663]";
	}
	return "text-[#c58af9]";
}

function Line({ text }: { text: string }) {
	const parts = text.split(TOKEN);
	return (
		<>
			{parts.map((p, i) =>
				i % 2 === 1 ? (
					// eslint-disable-next-line @eslint-react/no-array-index-key
					<span key={i} className={colorFor(p)}>
						{p}
					</span>
				) : (
					p
				),
			)}
		</>
	);
}

/** Dark editor window with tabs, light syntax colouring and +/- diff lines. */
export function CodeWindow({
	snippets,
	filename,
}: {
	snippets: Record<string, string>;
	filename?: string;
}) {
	const tabs = Object.keys(snippets);
	const [tab, setTab] = useState(tabs[0] ?? "");
	const [copied, setCopied] = useState(false);
	const code = snippets[tab] ?? "";
	const lines = code.split("\n");

	return (
		<div className="overflow-hidden rounded-[24px] bg-code text-[#e8eaed] shadow-[0_24px_48px_-24px_rgb(0_0_0/0.5)] ring-1 ring-white/10">
			<div className="flex items-center gap-1 border-b border-white/10 px-3 py-2.5">
				{tabs.map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => setTab(t)}
						className={`relative rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
							t === tab ? "text-white" : "text-white/55 hover:text-white/80"
						}`}
					>
						{t === tab && (
							<motion.span
								layoutId={`cw-${filename ?? "code"}`}
								className="absolute inset-0 rounded-full bg-white/10"
								transition={{ type: "spring", stiffness: 500, damping: 35 }}
							/>
						)}
						<span className="relative">{t}</span>
					</button>
				))}
				<span className="ml-auto hidden font-mono text-[11px] text-white/40 sm:inline">
					{filename}
				</span>
				<button
					type="button"
					aria-label="Copy code"
					onClick={() => {
						void navigator.clipboard.writeText(
							lines
								.filter((l) => !l.startsWith("-"))
								.map((l) => (l.startsWith("+") ? ` ${l.slice(1)}` : l))
								.join("\n"),
						);
						setCopied(true);
						window.setTimeout(() => setCopied(false), 1500);
					}}
					className="ml-2 rounded-full p-2 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
				>
					{copied ? (
						<Check className="size-3.5" />
					) : (
						<Copy className="size-3.5" />
					)}
				</button>
			</div>
			<pre className="overflow-x-auto py-4 font-mono text-[12.5px] leading-[1.75]">
				{lines.map((l, i) => {
					const removed = l.startsWith("-");
					const added = l.startsWith("+");
					return (
						<div
							// eslint-disable-next-line @eslint-react/no-array-index-key
							key={i}
							className={`flex pr-5 ${
								removed ? "bg-[#f28b82]/12" : added ? "bg-[#81c995]/12" : ""
							}`}
						>
							<span className="w-10 shrink-0 select-none pr-3 text-right text-white/25">
								{i + 1}
							</span>
							<span
								className={`w-4 shrink-0 select-none ${removed ? "text-[#f28b82]" : added ? "text-[#81c995]" : ""}`}
							>
								{removed ? "−" : added ? "+" : ""}
							</span>
							<span className={removed ? "text-white/45 line-through" : ""}>
								<Line text={removed || added ? l.slice(1) : l} />
							</span>
						</div>
					);
				})}
			</pre>
		</div>
	);
}
