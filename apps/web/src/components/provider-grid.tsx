import { ProviderLogo } from "@/components/provider-logo";

export const PROVIDERS = [
	{ id: "openai", name: "OpenAI" },
	{ id: "anthropic", name: "Anthropic" },
	{ id: "google-ai-studio", name: "Google" },
	{ id: "xai", name: "xAI" },
	{ id: "deepseek", name: "DeepSeek" },
	{ id: "moonshot", name: "Moonshot" },
	{ id: "alibaba", name: "Alibaba Qwen" },
	{ id: "zai", name: "Z.ai" },
	{ id: "minimax", name: "MiniMax" },
	{ id: "meta", name: "Meta" },
];

/** Bordered logo table of the labs whose models Vichar serves. */
export function ProviderGrid() {
	return (
		<ul className="grid grid-cols-2 overflow-hidden rounded-xl border border-border sm:grid-cols-5">
			{PROVIDERS.map((p) => (
				<li
					key={p.id}
					className="-mb-px -mr-px flex flex-col items-center justify-center gap-3 border-b border-r border-border bg-card px-4 py-7 transition-colors hover:bg-canvas"
				>
					<ProviderLogo id={p.id} className="size-7 text-foreground" />
					<span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
						{p.name}
					</span>
				</li>
			))}
		</ul>
	);
}
