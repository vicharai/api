import { VicharMark } from "@/lib/icons/vichar-logo";

/**
 * The left half of every auth screen. A deep-blue brand field with a slowly
 * drifting thought-constellation — the same visual idea as the mark: points
 * of thought gathering into a cloud.
 */
export function AuthBrandPanel({ variant }: { variant: "login" | "signup" }) {
	return (
		<div className="relative hidden w-1/2 overflow-hidden bg-[#070b17] lg:flex lg:flex-col">
			<div className="absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full bg-brand/30 blur-[160px]" />
			{/* Thought constellation — slow drift and a gentle shimmer. */}
			<svg
				aria-hidden="true"
				className="auth-constellation absolute -right-24 -top-20 size-[560px] text-white/[0.13]"
				viewBox="0 0 400 400"
				fill="none"
			>
				<path
					d="M60 120 L180 70 L300 130 M180 70 L190 200 M300 130 L190 200 M60 120 L190 200 M60 120 L110 250 M190 200 L110 250 M190 200 L260 280"
					stroke="currentColor"
					strokeWidth="1"
				/>
				{[
					[60, 120],
					[180, 70],
					[300, 130],
					[190, 200],
					[110, 250],
					[260, 280],
				].map(([x, y], i) => (
					<circle
						key={i}
						cx={x}
						cy={y}
						r="3.5"
						fill="currentColor"
						className="auth-node"
						style={{ animationDelay: `${i * 0.9}s` }}
					/>
				))}
			</svg>
			<svg
				aria-hidden="true"
				className="auth-constellation auth-constellation--late absolute -bottom-28 -left-28 size-[420px] text-white/[0.09]"
				viewBox="0 0 400 400"
				fill="none"
			>
				<path
					d="M60 120 L180 70 L300 130 M180 70 L190 200 M300 130 L190 200 M60 120 L190 200 M60 120 L110 250 M190 200 L110 250 M190 200 L260 280"
					stroke="currentColor"
					strokeWidth="1"
				/>
				{[
					[60, 120],
					[180, 70],
					[300, 130],
					[190, 200],
					[110, 250],
					[260, 280],
				].map(([x, y], i) => (
					<circle
						key={i}
						cx={x}
						cy={y}
						r="3.5"
						fill="currentColor"
						className="auth-node"
						style={{ animationDelay: `${(i + 0.5) * 0.9}s` }}
					/>
				))}
			</svg>

			{/* Soft wash bottom-left for depth. */}
			<div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-sky/10 blur-[140px]" />

			<div className="relative z-10 px-12 pt-10 xl:px-16">
				<div className="flex items-center gap-2.5">
					<VicharMark className="size-8 text-white" />
					<span className="text-lg font-medium tracking-tight text-white">
						Vichar
					</span>
				</div>
			</div>

			<div className="relative z-10 flex flex-1 flex-col justify-center px-12 xl:px-16">
				{variant === "signup" ? (
					<>
						<p className="font-display text-4xl font-semibold leading-tight tracking-tight text-white xl:text-[44px]">
							One API for
							<br />
							every model.
						</p>
						<p className="mt-4 max-w-md text-lg text-white/60">
							Route requests across providers, keep an eye on spend, and change
							providers without changing code.
						</p>
					</>
				) : (
					<>
						<p className="font-display text-4xl font-semibold leading-tight tracking-tight text-white xl:text-[44px]">
							Welcome back.
						</p>
						<p className="mt-4 max-w-md text-lg text-white/60">
							Pick up where you left off. Your keys, routes and analytics are as
							you left them.
						</p>
					</>
				)}
			</div>

			<div className="relative z-10 px-12 pb-10 xl:px-16">
				<p className="text-xs tracking-wide text-white/40">
					vichar · a thought, routed.
				</p>
			</div>
		</div>
	);
}
