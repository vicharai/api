"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface CodeCardProps {
	snippets: Record<string, string>;
	/** Tabs whose content is rendered as a +/- diff. */
	diffTabs?: string[];
}

function CodeBody({ code, diff }: { code: string; diff: boolean }) {
	if (!diff) {
		return <>{code}</>;
	}
	return (
		<>
			{code.split("\n").map((line) => {
				const isRemoved = line.startsWith("-");
				const isAdded = line.startsWith("+");
				const cls = isRemoved
					? "border-l-2 border-destructive bg-destructive/10 text-destructive"
					: isAdded
						? "border-l-2 border-success bg-success/10 text-success"
						: "text-muted-foreground";
				return (
					<span key={line} className={`-mx-4 block px-4 ${cls}`}>
						{line}
					</span>
				);
			})}
		</>
	);
}

/** Tabbed code card with copy button. */
export function CodeCard({ snippets, diffTabs = [] }: CodeCardProps) {
	const tabs = Object.keys(snippets);
	const [tab, setTab] = useState(tabs[0]);
	const [copied, setCopied] = useState(false);
	const isDiff = diffTabs.includes(tab);

	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card">
			<div className="flex items-center justify-between border-b border-border bg-secondary/30 px-3 py-2">
				<div className="flex gap-1">
					{tabs.map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTab(t)}
							className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
								tab === t
									? "bg-card text-foreground shadow-2xs"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{t}
						</button>
					))}
				</div>
				<button
					type="button"
					aria-label="Copy code"
					onClick={() => {
						void navigator.clipboard.writeText(snippets[tab]).then(() => {
							setCopied(true);
							setTimeout(() => setCopied(false), 1600);
						});
					}}
					className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					{copied ? (
						<Check className="size-3.5 text-success" />
					) : (
						<Copy className="size-3.5" />
					)}
				</button>
			</div>
			<pre className="overflow-x-auto p-4 text-[12.5px] leading-[1.75]">
				<code className="font-mono">
					<CodeBody code={snippets[tab]} diff={isDiff} />
				</code>
			</pre>
		</div>
	);
}
