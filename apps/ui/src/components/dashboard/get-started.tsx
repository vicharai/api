"use client";

import { Check, Copy, Key, Wallet } from "lucide-react";
import { useState } from "react";

import { CreateApiKeyDialog } from "@/components/api-keys/create-api-key-dialog";
import { TopUpCreditsDialog } from "@/components/credits/top-up-credits-dialog";
import { Button } from "@/lib/components/button";
import { SquircleSurface } from "@/lib/components/squircle";
import { toast } from "@/lib/components/use-toast";
import { cn } from "@/lib/utils";

import type { Organization, Project } from "@/lib/types";

const TABS = ["cURL", "TypeScript", "Python"] as const;
type CodeTab = (typeof TABS)[number];

function snippets(apiKey: string): Record<CodeTab, string> {
	return {
		cURL: `curl -X POST https://api.vichar.io/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
  "model": "auto",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ]
}'`,
		TypeScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${apiKey}",
  baseURL: "https://api.vichar.io/v1/"
});

const response = await client.chat.completions.create({
  model: "auto",
  messages: [{ role: "user", content: "Hello!" }],
});`,
		Python: `from openai import OpenAI

client = OpenAI(
    api_key="${apiKey}",
    base_url="https://api.vichar.io/v1/",
)

response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello!"}],
)`,
	};
}

function StepBadge({ done, n }: { done: boolean; n: number }) {
	return done ? (
		<span className="flex size-5 items-center justify-center rounded-full bg-success/15 text-success">
			<Check className="size-3" />
		</span>
	) : (
		<span className="flex size-5 items-center justify-center rounded-full border border-border text-[11px] font-medium tabular-nums text-muted-foreground">
			{n}
		</span>
	);
}

export function GetStartedChecklist({
	selectedProject,
	selectedOrganization,
	hasApiKey,
	isOrgAdmin,
}: {
	selectedProject: Project;
	selectedOrganization: Organization;
	hasApiKey: boolean;
	isOrgAdmin: boolean;
}) {
	const [tab, setTab] = useState<CodeTab>("cURL");
	const hasCredits = Number(selectedOrganization.credits ?? 0) > 0;
	const code = snippets("YOUR_API_KEY")[tab];

	return (
		<SquircleSurface>
			<div className="border-b border-border px-4 py-3.5">
				<h2 className="text-sm font-semibold">Get started</h2>
				<p className="mt-0.5 text-[13px] text-muted-foreground">
					Three steps to your first request.
				</p>
			</div>

			<div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 items-center gap-3">
					<StepBadge done={hasApiKey} n={1} />
					<div className="min-w-0">
						<p className="text-sm font-medium">Create an API key</p>
						<p className="truncate text-[13px] text-muted-foreground">
							{hasApiKey
								? "Key created for this project."
								: "Scoped to this project."}
						</p>
					</div>
				</div>
				{!hasApiKey && (
					<CreateApiKeyDialog selectedProject={selectedProject}>
						<Button size="sm">
							<Key className="mr-1.5 size-3.5" />
							Create API key
						</Button>
					</CreateApiKeyDialog>
				)}
			</div>

			<div className="border-t border-border px-4 py-3.5">
				<div className="flex items-center gap-3">
					<StepBadge done={false} n={2} />
					<div>
						<p className="text-sm font-medium">Make your first request</p>
						<p className="text-[13px] text-muted-foreground">
							OpenAI-compatible — just change the base URL.
						</p>
					</div>
				</div>
				<div className="mt-3">
					<div
						className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5"
						role="tablist"
					>
						{TABS.map((t) => (
							<button
								key={t}
								type="button"
								role="tab"
								aria-selected={tab === t}
								onClick={() => setTab(t)}
								className={cn(
									"rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
									tab === t
										? "bg-card text-foreground shadow-xs"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{t}
							</button>
						))}
					</div>
					<div className="relative mt-2 rounded-lg border border-border bg-muted/40">
						<button
							type="button"
							aria-label="Copy code"
							onClick={() => {
								void navigator.clipboard.writeText(code);
								toast({ title: "Copied to clipboard" });
							}}
							className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<Copy className="size-3.5" />
						</button>
						<pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed">
							{code}
						</pre>
					</div>
				</div>
			</div>

			<div className="flex flex-col gap-2 border-t border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 items-center gap-3">
					<StepBadge done={hasCredits} n={3} />
					<div className="min-w-0">
						<p className="text-sm font-medium">Add credits</p>
						<p className="truncate text-[13px] text-muted-foreground">
							{hasCredits
								? "Your workspace has credits."
								: "Prepaid credits never expire."}
						</p>
					</div>
				</div>
				{!hasCredits && isOrgAdmin && (
					<TopUpCreditsDialog>
						<Button size="sm" variant="outline">
							<Wallet className="mr-1.5 size-3.5" />
							Add credits
						</Button>
					</TopUpCreditsDialog>
				)}
			</div>
		</SquircleSurface>
	);
}
