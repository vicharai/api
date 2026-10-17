import { VicharMark } from "@/lib/icons/vichar-logo";

const LOGIN_ROWS: Array<[string, string]> = [
	["model", "auto → vichar-sonnet-5.5"],
	["latency", "310 ms"],
	["tokens", "1,284"],
	["cost", "$0.0042"],
];

/**
 * The left half of every auth screen: the marketing site's language —
 * neutral surface, hairline grid, the glass cloud, and one concrete product
 * artifact instead of decoration.
 */
export function AuthBrandPanel({ variant }: { variant: "login" | "signup" }) {
	return (
		<div className="relative hidden w-1/2 overflow-hidden border-r border-border bg-app-canvas lg:flex lg:flex-col">
			{/* faint hairline grid, faded toward the edges */}
			<div aria-hidden="true" className="auth-grid absolute inset-0" />
			{/* brand glow: trust blue top-left, teal bottom-right */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -left-32 -top-32 size-[480px] rounded-full bg-brand/15 blur-3xl"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -bottom-40 -right-24 size-[420px] rounded-full bg-brand-sky/12 blur-3xl"
			/>

			<div className="relative z-10 px-12 pt-10 xl:px-16">
				<div className="flex items-center gap-2.5">
					<span className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm">
						<VicharMark className="size-5" />
					</span>
					<span className="font-display text-lg font-bold tracking-tight text-foreground">
						Vichar
					</span>
				</div>
			</div>

			<div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-8 py-12">
				<p className="text-balance font-display text-[40px] font-semibold leading-[1.05] tracking-tight text-foreground xl:text-[44px]">
					{variant === "signup" ? (
						<>
							One API for{" "}
							<span className="text-brand-gradient">every model.</span>
						</>
					) : (
						<>
							Welcome <span className="text-brand-gradient">back.</span>
						</>
					)}
				</p>
				<p className="mt-3 max-w-[26rem] text-balance text-base text-muted-foreground">
					{variant === "signup"
						? "OpenAI-compatible. Prepaid credits, no subscription."
						: "Your keys, usage and balance, right where you left them."}
				</p>

				<div className="relative mt-8 self-center w-[240px] xl:w-[340px]">
					<img
						src="/hero/cloud-glass-light.webp"
						alt=""
						aria-hidden="true"
						width={1200}
						height={936}
						className="auth-cloud w-full mix-blend-multiply dark:hidden"
					/>
					<img
						src="/hero/cloud-glass-dark.webp"
						alt=""
						aria-hidden="true"
						width={1200}
						height={936}
						className="auth-cloud hidden w-full mix-blend-lighten dark:block"
					/>
				</div>

				<div className="relative z-10 -mt-6 w-full overflow-hidden rounded-xl border border-border bg-card/90 shadow-lg backdrop-blur-sm [@media(max-height:779px)]:hidden">
					{variant === "login" ? (
						<div className="font-mono text-xs">
							<div className="flex items-center justify-between px-4 py-2.5">
								<span className="text-foreground">
									POST /v1/chat/completions
								</span>
								<span className="flex items-center gap-1.5 text-muted-foreground">
									<span className="size-1.5 rounded-full bg-success ring-2 ring-success/20" />
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

			<div className="relative z-10 flex items-center justify-between px-12 pb-10 xl:px-16">
				<p className="font-mono text-xs text-muted-foreground">
					a thought, routed.
				</p>
			</div>
		</div>
	);
}
