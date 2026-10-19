"use client";

import { Check, Copy, Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { ProviderLogo } from "@/components/provider-logo";

export interface PlaygroundModel {
	id: string;
	name: string;
	logo: string;
	inputPerMillion: number | null;
	outputPerMillion: number | null;
}

const PROMPT = "Explain an API gateway in one sentence.";

const ANSWER =
	"An API gateway is a single entry point that receives every request, routes it to the right backend, and handles auth, limits and logging along the way.";

// Sample sizes and timings; the cost is computed from real catalogue prices.
const INPUT_TOKENS = 18;
const OUTPUT_TOKENS = 34;
const LATENCY = [612, 540, 488, 702, 455, 590];

function cost(m: PlaygroundModel) {
	const input = ((m.inputPerMillion ?? 0) / 1_000_000) * INPUT_TOKENS;
	const output = ((m.outputPerMillion ?? 0) / 1_000_000) * OUTPUT_TOKENS;
	return input + output;
}

export function HeroPlayground({ models }: { models: PlaygroundModel[] }) {
	const [index, setIndex] = useState(0);
	const [pinned, setPinned] = useState(false);
	const [chars, setChars] = useState(0);
	const [tab, setTab] = useState<"response" | "code">("response");
	const [copied, setCopied] = useState(false);
	const model = models[index] ?? models[0];

	// Stream the answer, then move to the next model unless the user picked one.
	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setChars(ANSWER.length);
			return;
		}
		setChars(0);
		let c = 0;
		const typer = window.setInterval(() => {
			c += 2;
			setChars(Math.min(c, ANSWER.length));
			if (c >= ANSWER.length) {
				window.clearInterval(typer);
			}
		}, 22);
		const next = pinned
			? undefined
			: window.setTimeout(() => setIndex((i) => (i + 1) % models.length), 5200);
		return () => {
			window.clearInterval(typer);
			if (next) {
				window.clearTimeout(next);
			}
		};
	}, [index, pinned, models.length]);

	if (!model) {
		return null;
	}

	const done = chars >= ANSWER.length;
	const code = `from openai import OpenAI

client = OpenAI(
    base_url="https://api.vichar.io/v1",
    api_key=VICHAR_API_KEY,
)

client.chat.completions.create(
    model="${model.id}",
    messages=[{"role": "user",
      "content": "${PROMPT}"}],
)`;

	return (
		<div className="relative rounded-[28px] border border-border bg-card shadow-[0_1px_3px_rgb(60_64_67/0.15),0_4px_8px_3px_rgb(60_64_67/0.08)]">
			<div className="flex items-center justify-between border-b border-border px-5 py-3.5">
				<div className="flex items-center gap-2">
					<span className="size-2.5 rounded-full bg-g-red" />
					<span className="size-2.5 rounded-full bg-g-yellow" />
					<span className="size-2.5 rounded-full bg-g-green" />
					<span className="ml-2 text-sm font-medium">Playground</span>
				</div>
				<div className="flex rounded-full bg-surface-2 p-0.5 text-xs font-medium">
					{(["response", "code"] as const).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTab(t)}
							className={`relative rounded-full px-3 py-1 capitalize transition-colors ${
								tab === t ? "text-foreground" : "text-muted-foreground"
							}`}
						>
							{tab === t && (
								<motion.span
									layoutId="pg-tab"
									className="absolute inset-0 rounded-full bg-card shadow-[0_1px_2px_rgb(60_64_67/0.2)]"
									transition={{ type: "spring", stiffness: 500, damping: 35 }}
								/>
							)}
							<span className="relative">{t}</span>
						</button>
					))}
				</div>
			</div>

			<div className="flex gap-2 overflow-x-auto px-5 pt-4 [scrollbar-width:none]">
				{models.map((m, i) => (
					<button
						key={m.id}
						type="button"
						onClick={() => {
							setPinned(true);
							setIndex(i);
						}}
						className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
							i === index
								? "border-transparent bg-g-blue-soft text-g-blue-deep"
								: "border-border text-body hover:bg-surface-2"
						}`}
						aria-pressed={i === index}
					>
						<ProviderLogo id={m.logo} className="size-3.5 text-foreground" />
						{m.name}
					</button>
				))}
			</div>

			<div className="px-5 pb-5 pt-4">
				<div className="flex justify-end">
					<p className="max-w-[85%] rounded-[20px] rounded-br-md bg-surface-2 px-4 py-2.5 text-sm">
						{PROMPT}
					</p>
				</div>

				<div className="mt-4 h-[188px] sm:h-[176px]">
					<AnimatePresence mode="wait" initial={false}>
						{tab === "response" ? (
							<motion.div
								key="response"
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -6 }}
								transition={{ duration: 0.2 }}
								className="flex gap-3"
							>
								<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border">
									<ProviderLogo
										id={model.logo}
										className="size-3.5 text-foreground"
									/>
								</span>
								<p className="text-[15px] leading-relaxed text-foreground">
									{ANSWER.slice(0, chars)}
									{!done && (
										<span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 rounded-full bg-g-blue" />
									)}
								</p>
							</motion.div>
						) : (
							<motion.div
								key="code"
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -6 }}
								transition={{ duration: 0.2 }}
								className="relative h-full overflow-hidden rounded-2xl bg-code"
							>
								<button
									type="button"
									aria-label="Copy code"
									onClick={() => {
										void navigator.clipboard.writeText(code);
										setCopied(true);
										window.setTimeout(() => setCopied(false), 1500);
									}}
									className="absolute right-3 top-3 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
								>
									{copied ? (
										<Check className="size-3.5" />
									) : (
										<Copy className="size-3.5" />
									)}
								</button>
								<pre className="h-full overflow-auto p-4 font-mono text-[11.5px] leading-[1.55] text-[#e8eaed]">
									{code}
								</pre>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				<div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
					{[
						["Latency", `${LATENCY[index % LATENCY.length]} ms`],
						["Tokens", `${INPUT_TOKENS} → ${OUTPUT_TOKENS}`],
						["Cost", `$${cost(model).toFixed(6)}`],
					].map(([label, value]) => (
						<div key={label}>
							<p className="text-[11px] text-muted-foreground">{label}</p>
							<p className="mt-0.5 font-mono text-[13px] font-medium tabular-nums">
								{done ? value : "…"}
							</p>
						</div>
					))}
				</div>
				<p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
					<Play className="size-3 fill-current" />
					Sample run · cost uses this model's live per-token price
				</p>
			</div>
		</div>
	);
}
