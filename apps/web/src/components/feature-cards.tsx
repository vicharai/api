"use client";

import { Check, KeyRound, X } from "lucide-react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { ProviderLogo } from "@/components/provider-logo";

import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

const SWITCH = [
	{ id: "vichar-opus-5.5", logo: "anthropic" },
	{ id: "vichar-gpt-5.6", logo: "openai" },
	{ id: "vichar-gemini-3.1-pro", logo: "google-ai-studio" },
	{ id: "vichar-grok-4.7", logo: "xai" },
	{ id: "vichar-deepseek-v4-pro", logo: "deepseek" },
];

function Card({
	tone,
	title,
	body,
	children,
	className = "",
}: {
	tone: "blue" | "green" | "yellow" | "red";
	title: string;
	body: string;
	children: ReactNode;
	className?: string;
}) {
	const bg = {
		blue: "bg-g-blue-soft",
		green: "bg-g-green-soft",
		yellow: "bg-g-yellow-soft",
		red: "bg-g-red-soft",
	}[tone];
	return (
		<motion.div
			initial={{ opacity: 0, y: 24 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-80px" }}
			transition={{ duration: 0.6, ease: EASE }}
			className={`flex w-[86%] shrink-0 snap-center flex-col overflow-hidden rounded-[28px] sm:w-[62%] lg:w-auto ${bg} ${className}`}
		>
			<div className="px-7 pt-7 sm:px-9 sm:pt-9">
				<h3 className="text-[22px] font-medium tracking-tight text-foreground">
					{title}
				</h3>
				<p className="mt-2 max-w-md text-[15px] leading-relaxed text-body">
					{body}
				</p>
			</div>
			<div className="mt-auto px-7 pb-7 pt-8 sm:px-9 sm:pb-9">{children}</div>
		</motion.div>
	);
}

function Panel({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-2xl bg-card p-5 shadow-[0_1px_2px_rgb(60_64_67/0.15),0_1px_3px_1px_rgb(60_64_67/0.08)]">
			{children}
		</div>
	);
}

function useCycle(length: number, ms: number) {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref);
	const [i, setI] = useState(0);
	useEffect(() => {
		if (
			!inView ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}
		const id = window.setInterval(() => setI((v) => (v + 1) % length), ms);
		return () => window.clearInterval(id);
	}, [inView, length, ms]);
	return { ref, i };
}

function ModelSwitch() {
	const { ref, i } = useCycle(SWITCH.length, 1800);
	const active = SWITCH[i] ?? SWITCH[0];
	return (
		<div ref={ref}>
			<Panel>
				<div className="overflow-x-auto font-mono text-[12px] leading-7 [scrollbar-width:none] sm:text-[13px]">
					<p className="text-muted-foreground">
						client.chat.completions.<span className="text-g-blue">create</span>(
						{"{"}
					</p>
					<p className="flex flex-wrap items-center gap-x-1 pl-4">
						<span className="text-foreground">model:</span>
						<span className="relative inline-flex h-7 basis-full items-center overflow-hidden whitespace-nowrap pl-4 sm:basis-auto sm:min-w-[200px] sm:pl-0">
							<AnimatePresence mode="popLayout" initial={false}>
								<motion.span
									key={active?.id}
									initial={{ y: 18, opacity: 0 }}
									animate={{ y: 0, opacity: 1 }}
									exit={{ y: -18, opacity: 0 }}
									transition={{ duration: 0.35, ease: EASE }}
									className="text-g-green-deep"
								>
									"{active?.id}"
								</motion.span>
							</AnimatePresence>
						</span>
					</p>
					<p className="pl-4 text-foreground">
						messages<span className="text-muted-foreground">,</span>
					</p>
					<p className="text-muted-foreground">{"})"}</p>
				</div>
			</Panel>
			<div className="mt-4 flex flex-wrap gap-2">
				{SWITCH.map((m, n) => (
					<span
						key={m.id}
						className={`flex size-9 items-center justify-center rounded-full bg-card transition-all duration-300 sm:size-10 ${
							n === i
								? "scale-110 shadow-[0_0_0_2px_var(--g-blue)]"
								: "opacity-70"
						}`}
					>
						<ProviderLogo id={m.logo} className="size-4 text-foreground" />
					</span>
				))}
			</div>
		</div>
	);
}

function Failover() {
	return (
		<Panel>
			<div className="space-y-3 text-sm">
				<div className="flex items-center gap-3">
					<span className="flex size-7 items-center justify-center rounded-full bg-g-red-soft">
						<X className="size-3.5 text-g-red-deep" strokeWidth={2.5} />
					</span>
					<div className="flex-1">
						<div className="flex justify-between text-[13px]">
							<span>Route A</span>
							<span className="font-mono text-g-red-deep">timeout</span>
						</div>
						<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
							<motion.div
								className="h-full rounded-full bg-g-red"
								initial={{ width: 0 }}
								whileInView={{ width: "38%" }}
								viewport={{ once: true }}
								transition={{ duration: 0.9, ease: EASE }}
							/>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<span className="flex size-7 items-center justify-center rounded-full bg-g-green-soft">
						<Check className="size-3.5 text-g-green-deep" strokeWidth={2.5} />
					</span>
					<div className="flex-1">
						<div className="flex justify-between text-[13px]">
							<span>Route B</span>
							<span className="font-mono text-g-green-deep">200 OK</span>
						</div>
						<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
							<motion.div
								className="h-full rounded-full bg-g-green"
								initial={{ width: 0 }}
								whileInView={{ width: "100%" }}
								viewport={{ once: true }}
								transition={{ duration: 1.1, ease: EASE, delay: 0.9 }}
							/>
						</div>
					</div>
				</div>
				<p className="border-t border-border pt-3 text-xs text-muted-foreground">
					Retried automatically · failed attempt not billed
				</p>
			</div>
		</Panel>
	);
}

function SpendLimit() {
	return (
		<Panel>
			<div className="flex items-center gap-3">
				<span className="flex size-9 items-center justify-center rounded-full bg-g-yellow-soft">
					<KeyRound className="size-4 text-g-yellow-deep" />
				</span>
				<div className="min-w-0">
					<p className="truncate text-sm font-medium">production-backend</p>
					<p className="font-mono text-xs text-muted-foreground">
						vc_7fK…a91 · expires in 30d
					</p>
				</div>
			</div>
			<p className="mt-5 text-[28px] font-normal leading-none tracking-tight">
				$42.18{" "}
				<span className="text-sm text-muted-foreground">of $100 / month</span>
			</p>
			<div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
				<motion.div
					className="h-full rounded-full bg-g-yellow"
					initial={{ width: 0 }}
					whileInView={{ width: "42%" }}
					viewport={{ once: true }}
					transition={{ duration: 1.2, ease: EASE }}
				/>
			</div>
			<p className="mt-2 text-xs text-muted-foreground">
				The key pauses when it reaches its limit
			</p>
		</Panel>
	);
}

const BARS = [38, 52, 44, 68, 57, 82, 74, 61, 90, 72, 66, 84];

function Usage() {
	return (
		<Panel>
			<div className="flex items-baseline justify-between">
				<div>
					<p className="text-xs text-muted-foreground">Spend · last 12 days</p>
					<p className="mt-1 text-[28px] leading-none tracking-tight">
						$184.20
					</p>
				</div>
				<div className="flex gap-3 text-[11px] text-muted-foreground">
					<span className="flex items-center gap-1">
						<span className="size-2 rounded-full bg-g-blue" />
						Input
					</span>
					<span className="flex items-center gap-1">
						<span className="size-2 rounded-full bg-g-red" />
						Output
					</span>
				</div>
			</div>
			<div className="mt-5 flex h-28 items-end gap-1.5">
				{BARS.map((h, i) => (
					<div
						key={h}
						className="flex flex-1 flex-col justify-end gap-0.5"
						style={{ height: "100%" }}
					>
						<motion.div
							className="rounded-t-[3px] bg-g-red"
							initial={{ height: 0 }}
							whileInView={{ height: `${h * 0.35}%` }}
							viewport={{ once: true }}
							transition={{ duration: 0.7, ease: EASE, delay: i * 0.04 }}
						/>
						<motion.div
							className="rounded-b-[3px] bg-g-blue"
							initial={{ height: 0 }}
							whileInView={{ height: `${h * 0.65}%` }}
							viewport={{ once: true }}
							transition={{ duration: 0.7, ease: EASE, delay: i * 0.04 }}
						/>
					</div>
				))}
			</div>
		</Panel>
	);
}

export function FeatureCards() {
	return (
		<div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-12 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
			<Card
				tone="blue"
				title="One API for every model"
				body="Switch labs by changing one string. Same OpenAI-compatible request, same SDK, same balance."
				className="lg:col-span-7"
			>
				<ModelSwitch />
			</Card>
			<Card
				tone="green"
				title="Failover built in"
				body="If a route errors or times out, the request is retried on another route for the same model."
				className="lg:col-span-5"
			>
				<Failover />
			</Card>
			<Card
				tone="yellow"
				title="Spend limits per key"
				body="Cap each key with a monthly budget and an expiry, so a runaway job can never drain your balance."
				className="lg:col-span-5"
			>
				<SpendLimit />
			</Card>
			<Card
				tone="red"
				title="See every token and dollar"
				body="Usage, cost and latency per key, project, model and provider, updated as requests happen."
				className="lg:col-span-7"
			>
				<Usage />
			</Card>
		</div>
	);
}
