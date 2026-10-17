/**
 * What Vichar keeps for one request: billing metadata is stored, prompt and
 * response content is not (retention level "none" by default).
 */

const STORED: Array<[string, string]> = [
	["id", "req_7Hf2c9a1"],
	["model", "vichar-sonnet-5.5"],
	["tokens.input", "1,842"],
	["tokens.output", "412"],
	["cost", "$0.0078"],
	["latency", "490 ms"],
	["status", "200"],
];

const REDACTED = ["messages", "response"];

export function PrivacyRecord() {
	return (
		<div
			aria-hidden="true"
			className="overflow-hidden rounded-xl border border-border bg-card"
		>
			<div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
				<span className="text-[13px] font-semibold text-foreground">
					Request record
				</span>
				<span className="rounded-md border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
					retention: none
				</span>
			</div>

			<dl className="px-5 py-3 font-mono text-[12px]">
				{STORED.map(([k, v]) => (
					<div
						key={k}
						className="grid grid-cols-[120px_1fr] items-center py-[5px]"
					>
						<dt className="text-muted-foreground">{k}</dt>
						<dd className="text-foreground tabular-nums">{v}</dd>
					</div>
				))}
				<div className="my-2 h-px bg-border" />
				{REDACTED.map((k) => (
					<div
						key={k}
						className="grid grid-cols-[120px_1fr] items-center py-[5px]"
					>
						<dt className="text-muted-foreground">{k}</dt>
						<dd className="flex items-center gap-3">
							<span className="trace-hatch h-3.5 flex-1 rounded-[3px] border border-foreground/10" />
							<span className="shrink-0 text-[11px] text-muted-foreground">
								not stored
							</span>
						</dd>
					</div>
				))}
			</dl>

			<div className="flex items-center justify-between gap-3 border-t border-border bg-secondary/30 px-5 py-2.5 text-[11px] text-muted-foreground">
				<span>Kept for billing and analytics</span>
				<span className="font-mono">0 bytes of content</span>
			</div>
		</div>
	);
}
