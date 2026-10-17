import { VicharMark } from "@/lib/icons/vichar-logo";

const LOGIN_ROWS: Array<[string, string]> = [
	["model", "auto → vichar-sonnet-5.5"],
	["latency", "310 ms"],
	["tokens", "1,284"],
	["cost", "$0.0042"],
];

/** The left half of every auth screen: brand, one line, one product artifact. */
export function AuthBrandPanel({ variant }: { variant: "login" | "signup" }) {
	return (
		<div className="hidden w-1/2 border-r border-border bg-app-canvas lg:flex lg:flex-col">
			<div className="px-12 pt-10 xl:px-16">
				<div className="flex items-center gap-2.5">
					<span className="flex size-8 items-center justify-center rounded-md bg-brand text-white">
						<VicharMark className="size-4.5" />
					</span>
					<span className="text-base font-semibold text-foreground">
						Vichar
					</span>
				</div>
			</div>

			<div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-8 py-12">
				<p className="text-balance text-[32px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
					{variant === "signup" ? "One API for every model." : "Welcome back."}
				</p>
				<p className="mt-3 max-w-[26rem] text-balance text-base text-muted-foreground">
					{variant === "signup"
						? "OpenAI-compatible. Prepaid credits, no subscription."
						: "Your keys, usage and balance, right where you left them."}
				</p>

				<div className="mt-10 w-full overflow-hidden rounded-[10px] border border-border bg-card shadow-xs [@media(max-height:599px)]:hidden">
					{variant === "login" ? (
						<div className="font-mono text-xs">
							<div className="flex items-center justify-between px-4 py-2.5">
								<span className="text-foreground">
									POST /v1/chat/completions
								</span>
								<span className="flex items-center gap-1.5 text-muted-foreground">
									<span className="size-1.5 rounded-full bg-success" />
									200
								</span>
							</div>
							{LOGIN_ROWS.map(([k, v]) => (
								<div
									key={k}
									className="flex items-center justify-between border-t border-border px-4 py-2"
								>
									<span className="text-muted-foreground">{k}</span>
									<span className="text-foreground">{v}</span>
								</div>
							))}
						</div>
					) : (
						<div>
							<p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
								Switch in two lines
							</p>
							<div className="px-4 py-3 font-mono text-xs leading-6">
								<p>
									<span className="text-foreground">base_url </span>
									<span className="text-muted-foreground">= </span>
									<span className="text-brand">
										&quot;https://api.vichar.io/v1&quot;
									</span>
								</p>
								<p>
									<span className="text-foreground">api_key&nbsp;&nbsp;</span>
									<span className="text-muted-foreground">= </span>
									<span className="text-brand">&quot;vc_…&quot;</span>
								</p>
							</div>
						</div>
					)}
				</div>
			</div>

			<div className="flex items-center justify-between px-12 pb-10 xl:px-16">
				<p className="font-mono text-xs text-muted-foreground">
					a thought, routed.
				</p>
			</div>
		</div>
	);
}
