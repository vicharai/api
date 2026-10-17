"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { cn } from "@/lib/utils";

import {
	Badge,
	Button,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { ReactNode } from "react";

export function SimpleSelect<V extends string>({
	value,
	onChange,
	options,
	className,
	placeholder,
	ariaLabel,
}: {
	value: V;
	onChange: (value: V) => void;
	options: readonly { value: V; label: ReactNode }[];
	className?: string;
	placeholder?: string;
	ariaLabel?: string;
}) {
	return (
		<Select value={value} onValueChange={(v) => onChange(v as V)}>
			<SelectTrigger
				className={cn("h-9 w-auto min-w-32", className)}
				aria-label={ariaLabel}
			>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function SearchInput({
	value,
	onChange,
	placeholder = "Search…",
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
}) {
	return (
		<div className={cn("relative w-full max-w-xs", className)}>
			<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				className="h-9 pl-8"
				value={value}
				placeholder={placeholder}
				onChange={(e) => onChange(e.target.value)}
			/>
		</div>
	);
}

export function Toolbar({ children }: { children: ReactNode }) {
	return (
		<div className="mb-3 flex flex-wrap items-center gap-2">{children}</div>
	);
}

export function Pager({
	offset,
	limit,
	total,
	onChange,
}: {
	offset: number;
	limit: number;
	total: number;
	onChange: (offset: number) => void;
}) {
	const from = total === 0 ? 0 : offset + 1;
	const to = Math.min(offset + limit, total);
	return (
		<div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
			<span>
				{formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
			</span>
			<div className="flex gap-1">
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Previous page"
					disabled={offset === 0}
					onClick={() => onChange(Math.max(0, offset - limit))}
				>
					<ChevronLeft />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Next page"
					disabled={offset + limit >= total}
					onClick={() => onChange(offset + limit)}
				>
					<ChevronRight />
				</Button>
			</div>
		</div>
	);
}

const TONES: Record<string, string> = {
	good: "border-transparent bg-success/15 text-success",
	bad: "border-transparent bg-destructive/15 text-destructive",
	warn: "border-transparent bg-warning/15 text-warning",
	info: "border-transparent bg-brand-soft text-brand",
	muted: "border-transparent bg-muted text-muted-foreground",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
	active: "good",
	verified: "good",
	unverified: "warn",
	approved: "good",
	passed: "good",
	completed: "good",
	won: "good",
	delivered: "good",
	paid: "good",
	succeeded: "good",
	inactive: "warn",
	flagged: "bad",
	deactivated: "bad",
	blocked: "bad",
	deleted: "bad",
	failed: "bad",
	lost: "bad",
	rejected: "bad",
	delivery_failed: "bad",
	critical: "bad",
	queued: "muted",
	running: "info",
	pending: "warn",
	canceled: "muted",
	warning: "warn",
	info: "info",
};

export function Tone({
	tone,
	children,
	className,
}: {
	tone: keyof typeof TONES;
	children: ReactNode;
	className?: string;
}) {
	return (
		<Badge variant="outline" className={cn(TONES[tone], className)}>
			{children}
		</Badge>
	);
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
	const value = status ?? "active";
	return (
		<Tone tone={STATUS_TONE[value] ?? "muted"} className="capitalize">
			{value.replace(/_/g, " ")}
		</Tone>
	);
}
