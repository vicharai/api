"use client";

import { Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/lib/components/button";
import { toast } from "@/lib/components/use-toast";
import { cn } from "@/lib/utils";

export function QuickStartSection({
	apiKey,
	onCopy,
}: {
	apiKey?: string;
	onCopy?: () => void;
}) {
	const [activeTab, setActiveTab] = useState<
		"curl" | "typescript" | "python" | "ai-sdk"
	>("curl");

	const keyPlaceholder = apiKey ?? "YOUR_API_KEY";

	const curlExample = `curl -X POST https://api.vichar.io/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${keyPlaceholder}" \\
  -d '{
  "model": "auto",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ]
}'`;

	const tsExample = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${keyPlaceholder}",
  baseURL: "https://api.vichar.io/v1/"
});

const response = await client.chat.completions.create({
  model: "auto",
  messages: [{ role: "user", content: "Hello!" }],
});`;

	const pythonExample = `from openai import OpenAI

client = OpenAI(
    api_key="${keyPlaceholder}",
    base_url="https://api.vichar.io/v1/",
)

response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello!"}],
)`;

	const aiSdkExample = `import { createLLMGateway } from "@llmgateway/ai-sdk-provider";
import { generateText } from "ai";

const llmgateway = createLLMGateway({
  apiKey: "${keyPlaceholder}",
});

const { text } = await generateText({
  model: llmgateway("auto"),
  prompt: "Hello!",
});`;

	const code =
		activeTab === "curl"
			? curlExample
			: activeTab === "typescript"
				? tsExample
				: activeTab === "python"
					? pythonExample
					: aiSdkExample;

	function copyCode() {
		void navigator.clipboard.writeText(code);
		onCopy?.();
		toast({
			title: "Copied to clipboard",
			description: "Code snippet copied to clipboard",
		});
	}

	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card">
			<div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
				<div className="flex gap-0.5">
					{(
						[
							["curl", "cURL"],
							["typescript", "TypeScript"],
							["python", "Python"],
							["ai-sdk", "AI SDK"],
						] as const
					).map(([id, label]) => (
						<button
							key={id}
							type="button"
							onClick={() => setActiveTab(id)}
							className={cn(
								"rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
								activeTab === id
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{label}
						</button>
					))}
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={copyCode}
					type="button"
					className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
				>
					<Copy className="h-3.5 w-3.5" />
					Copy
				</Button>
			</div>
			<pre className="overflow-x-auto bg-muted/30 p-4 font-mono text-[12.5px] leading-relaxed">
				{code}
			</pre>
		</div>
	);
}
