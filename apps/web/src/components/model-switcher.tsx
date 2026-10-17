"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

import { formatContext, formatPrice } from "@/lib/models";

export interface SwitcherModel {
	id: string;
	displayName: string;
	contextLength: number;
	inputPerMillion: number | null;
	outputPerMillion: number | null;
}

const kw = "text-[#7c3aed] dark:text-[#b48cff]";
const str = "text-[#116a26] dark:text-[#7ee29a]";
const muted = "text-muted-foreground";
const prop = "text-foreground";

function labIconForModel(id: string): string {
	if (id.includes("opus") || id.includes("sonnet") || id.includes("haiku")) {
		return "claude";
	}
	if (id.includes("gpt")) {
		return "openai";
	}
	if (id.includes("gemini")) {
		return "gemini";
	}
	if (id.includes("grok")) {
		return "grok";
	}
	if (id.includes("deepseek")) {
		return "deepseek";
	}
	if (id.includes("kimi")) {
		return "kimi";
	}
	return "openai";
}

/** Structured 3x2 model picker; only the `model:` line in the code block changes. */
export function ModelSwitcher({ models }: { models: SwitcherModel[] }) {
	const [sel, setSel] = useState(0);
	const [copied, setCopied] = useState(false);
	const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
	const current = models[sel];

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") {
			return;
		}
		e.preventDefault();
		const dir = e.key === "ArrowRight" ? 1 : -1;
		const next = (sel + dir + models.length) % models.length;
		setSel(next);
		tabsRef.current[next]?.focus();
	}

	const rawCode = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.vichar.io/v1",
  apiKey: process.env.VICHAR_API_KEY,
});

const resp = await client.chat.completions.create({
  model: "${current.id}",
  messages: [{ role: "user", content: "Hello" }],
});
console.log(resp.choices[0].message.content);`;

	return (
		<div className="min-w-0">
			<div
				role="tablist"
				aria-label="Pick a model"
				className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3"
				onKeyDown={onKeyDown}
			>
				{models.map((m, i) => {
					const active = i === sel;
					const icon = labIconForModel(m.id);
					return (
						<button
							key={m.id}
							ref={(el) => {
								tabsRef.current[i] = el;
							}}
							type="button"
							role="tab"
							aria-selected={active}
							tabIndex={active ? 0 : -1}
							onClick={() => setSel(i)}
							className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-all ${
								active
									? "border-foreground bg-foreground text-background shadow-2xs"
									: "border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground"
							}`}
						>
							<img
								src={`/labs/${icon}.svg`}
								alt=""
								className={`size-4 shrink-0 ${
									active ? "invert dark:invert-0" : "opacity-75 dark:invert"
								}`}
							/>
							<span className="truncate">{m.displayName}</span>
						</button>
					);
				})}
			</div>

			<div className="mt-3.5 overflow-hidden rounded-xl border border-border bg-card font-mono text-[12px] leading-[1.75] sm:text-[12.5px] shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
				<div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2 text-xs text-muted-foreground">
					<div className="flex items-center gap-2">
						<span className="font-medium text-foreground">app.ts</span>
						<span>·</span>
						<span>OpenAI TypeScript SDK</span>
					</div>
					<button
						type="button"
						aria-label="Copy snippet"
						onClick={() => {
							void navigator.clipboard.writeText(rawCode).then(() => {
								setCopied(true);
								setTimeout(() => setCopied(false), 1600);
							});
						}}
						className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						{copied ? (
							<Check className="size-3.5 text-success" />
						) : (
							<Copy className="size-3.5" />
						)}
					</button>
				</div>
				<pre className="overflow-x-auto p-4">
					<code>
						<span className={kw}>import</span>
						<span className={muted}>{' OpenAI from "openai";\n\n'}</span>
						<span className={kw}>const</span>
						<span className={prop}> client </span>
						<span className={muted}>= </span>
						<span className={kw}>new</span>
						<span className={prop}> OpenAI</span>
						<span className={muted}>({"{\n"}</span>
						<span className={prop}>{"  baseURL"}</span>
						<span className={muted}>: </span>
						<span className={str}>"https://api.vichar.io/v1"</span>
						<span className={muted}>,{"\n"}</span>
						<span className={prop}>{"  apiKey"}</span>
						<span className={muted}>: </span>
						<span className={prop}>process</span>
						<span className={muted}>.env.</span>
						<span className={prop}>VICHAR_API_KEY</span>
						<span className={muted}>,{"\n});\n\n"}</span>
						<span className={kw}>const</span>
						<span className={prop}> resp </span>
						<span className={muted}>= </span>
						<span className={kw}>await</span>
						<span className={prop}> client.chat.completions.create</span>
						<span className={muted}>({"{\n"}</span>
						<span className="-mx-4 flex items-center justify-between border-l-2 border-brand bg-brand/10 px-4">
							<span>
								<span className={prop}>{"  model"}</span>
								<span className={muted}>: </span>
								<span className={str}>"{current.id}"</span>
								<span className={muted}>,</span>
							</span>
							<span className="hidden text-[11px] text-brand sm:inline">
								selected
							</span>
						</span>
						<span className={prop}>{"  messages"}</span>
						<span className={muted}>: [{"{ "}</span>
						<span className={prop}>role</span>
						<span className={muted}>: </span>
						<span className={str}>"user"</span>
						<span className={muted}>, </span>
						<span className={prop}>content</span>
						<span className={muted}>: </span>
						<span className={str}>"Hello"</span>
						<span className={muted}>{" }],\n});\n"}</span>
						<span className={prop}>console</span>
						<span className={muted}>.log(resp.choices[</span>
						<span className={prop}>0</span>
						<span className={muted}>].message.content);</span>
					</code>
				</pre>
			</div>

			<div className="mt-3.5 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card shadow-2xs">
				<div className="px-4 py-2.5">
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Context
					</p>
					<p className="mt-0.5 font-mono text-sm font-semibold">
						{formatContext(current.contextLength)}
					</p>
				</div>
				<div className="px-4 py-2.5">
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Input / 1M
					</p>
					<p className="mt-0.5 font-mono text-sm font-semibold">
						{formatPrice(current.inputPerMillion)}
					</p>
				</div>
				<div className="px-4 py-2.5">
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Output / 1M
					</p>
					<p className="mt-0.5 font-mono text-sm font-semibold">
						{formatPrice(current.outputPerMillion)}
					</p>
				</div>
			</div>
		</div>
	);
}
