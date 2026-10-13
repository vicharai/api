"use client";

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

/** Pill-tab model picker; only the `model:` line in the code block changes. */
export function ModelSwitcher({ models }: { models: SwitcherModel[] }) {
	const [sel, setSel] = useState(0);
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

	return (
		<div className="min-w-0">
			<div
				role="tablist"
				aria-label="Pick a model"
				className="flex flex-wrap gap-1.5"
				onKeyDown={onKeyDown}
			>
				{models.map((m, i) => (
					<button
						key={m.id}
						ref={(el) => {
							tabsRef.current[i] = el;
						}}
						role="tab"
						aria-selected={i === sel}
						tabIndex={i === sel ? 0 : -1}
						onClick={() => setSel(i)}
						className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
							i === sel
								? "border-foreground bg-foreground text-background"
								: "border-border bg-card text-muted-foreground hover:text-foreground"
						}`}
					>
						{m.displayName}
					</button>
				))}
			</div>

			<div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card font-mono text-[13px] leading-[1.7] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
				<div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
					<span>app.ts</span>
					<span>TypeScript</span>
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
						<span className={prop}> baseURL</span>
						<span className={muted}>: </span>
						<span className={str}>"https://api.vichar.io/v1"</span>
						<span className={muted}>,{"\n"}</span>
						<span className={prop}> apiKey</span>
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
						<span className="-mx-4 block bg-brand/10 px-4">
							<span className={prop}> model</span>
							<span className={muted}>: </span>
							<span className={str}>"{current.id}"</span>
							<span className={muted}>,</span>
						</span>
						<span className={prop}> messages</span>
						<span className={muted}>: [{"{ "} </span>
						<span className={prop}>role</span>
						<span className={muted}>: </span>
						<span className={str}>"user"</span>
						<span className={muted}>, </span>
						<span className={prop}>content</span>
						<span className={muted}>: </span>
						<span className={str}>"Hello"</span>
						<span className={muted}>
							{" }],\n"});{"\n"}
						</span>
						<span className={prop}>console</span>
						<span className={muted}>.log(resp.choices[</span>
						<span className={prop}>0</span>
						<span className={muted}>].message.content);</span>
					</code>
				</pre>
			</div>

			<div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card">
				<div className="px-4 py-3">
					<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
						Context
					</p>
					<p className="mt-0.5 font-mono text-sm font-medium">
						{formatContext(current.contextLength)}
					</p>
				</div>
				<div className="px-4 py-3">
					<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
						Input / 1M
					</p>
					<p className="mt-0.5 font-mono text-sm font-medium">
						{formatPrice(current.inputPerMillion)}
					</p>
				</div>
				<div className="px-4 py-3">
					<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
						Output / 1M
					</p>
					<p className="mt-0.5 font-mono text-sm font-medium">
						{formatPrice(current.outputPerMillion)}
					</p>
				</div>
			</div>
		</div>
	);
}
