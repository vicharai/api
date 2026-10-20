"use client";

import { Tone } from "@/components/ui/controls";

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@llmgateway/shared/components";

export interface FraudSignalView {
	key: string;
	label: string;
	points: number;
	detail: string;
}

export function scoreTone(score: number): "bad" | "warn" | "info" | "muted" {
	if (score >= 70) {
		return "bad";
	}
	if (score >= 40) {
		return "warn";
	}
	return score > 0 ? "info" : "muted";
}

/** Risk score badge; hovering lists the signals behind it. */
export function ScoreChip({
	score,
	signals,
}: {
	score: number;
	signals: FraudSignalView[];
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="cursor-help">
					<Tone tone={scoreTone(score)} className="tabular-nums">
						{score}
					</Tone>
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-sm">
				<SignalList signals={signals} />
			</TooltipContent>
		</Tooltip>
	);
}

export function SignalList({ signals }: { signals: FraudSignalView[] }) {
	if (signals.length === 0) {
		return <span>No risk signals.</span>;
	}
	return (
		<ul className="space-y-0.5 text-xs">
			{signals.map((s, i) => (
				<li key={`${s.key}-${i}`} className="flex justify-between gap-3">
					<span>
						<span className="font-medium">{s.label}</span>
						<span className="opacity-80"> · {s.detail}</span>
					</span>
					<span className="tabular-nums">+{s.points}</span>
				</li>
			))}
		</ul>
	);
}
