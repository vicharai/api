import { AlertCircle, Inbox } from "lucide-react";

import { cn, errorMessage } from "@/lib/utils";

import {
	Alert,
	AlertDescription,
	AlertTitle,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Skeleton,
} from "@llmgateway/shared/components";

import type { ReactNode } from "react";

export function PageHeader({
	title,
	description,
	actions,
	children,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="mb-6 space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<h1 className="truncate text-2xl font-semibold tracking-tight">
						{title}
					</h1>
					{description ? (
						<p className="text-sm text-muted-foreground">{description}</p>
					) : null}
				</div>
				{actions ? (
					<div className="flex flex-wrap items-center gap-2">{actions}</div>
				) : null}
			</div>
			{children}
		</div>
	);
}

export function Section({
	title,
	description,
	actions,
	children,
	className,
	contentClassName,
}: {
	title?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
	contentClassName?: string;
}) {
	return (
		<Card className={cn("gap-4", className)}>
			{title || actions ? (
				<CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
					<div className="space-y-1">
						{title ? (
							<CardTitle className="text-base">{title}</CardTitle>
						) : null}
						{description ? (
							<CardDescription>{description}</CardDescription>
						) : null}
					</div>
					{actions ? (
						<div className="flex flex-wrap items-center gap-2">{actions}</div>
					) : null}
				</CardHeader>
			) : null}
			<CardContent className={contentClassName}>{children}</CardContent>
		</Card>
	);
}

export function StatCard({
	label,
	value,
	hint,
	tone,
}: {
	label: ReactNode;
	value: ReactNode;
	hint?: ReactNode;
	tone?: "default" | "good" | "bad" | "warn";
}) {
	return (
		<Card className="gap-1 py-4">
			<CardContent className="space-y-1 px-4">
				<p className="text-xs font-medium text-muted-foreground">{label}</p>
				<p
					className={cn(
						"text-2xl font-semibold tabular-nums",
						tone === "good" && "text-success",
						tone === "bad" && "text-destructive",
						tone === "warn" && "text-warning",
					)}
				>
					{value}
				</p>
				{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
			</CardContent>
		</Card>
	);
}

export function StatGrid({ children }: { children: ReactNode }) {
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
			{children}
		</div>
	);
}

export function ErrorState({ error }: { error: unknown }) {
	return (
		<Alert variant="destructive">
			<AlertCircle className="size-4" />
			<AlertTitle>Failed to load</AlertTitle>
			<AlertDescription>{errorMessage(error)}</AlertDescription>
		</Alert>
	);
}

export function EmptyState({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
			<Inbox className="size-6" />
			{children}
		</div>
	);
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
	return (
		<div className="space-y-2">
			{Array.from({ length: rows }).map((_, i) => (
				<Skeleton key={i} className="h-9 w-full" />
			))}
		</div>
	);
}

/** Loading / error / content switch for a TanStack query. */
export function QueryState<T>({
	query,
	children,
	rows,
}: {
	query: { data: T | undefined; error: unknown; isLoading: boolean };
	children: (data: T) => ReactNode;
	rows?: number;
}) {
	if (query.isLoading) {
		return <LoadingRows rows={rows} />;
	}
	if (query.error) {
		return <ErrorState error={query.error} />;
	}
	if (query.data === undefined) {
		return null;
	}
	return <>{children(query.data)}</>;
}

export function KeyValue({
	items,
}: {
	items: { label: ReactNode; value: ReactNode }[];
}) {
	return (
		<dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
			{items.map((item, i) => (
				<div key={i} className="min-w-0 space-y-0.5">
					<dt className="text-xs text-muted-foreground">{item.label}</dt>
					<dd className="truncate">{item.value ?? "—"}</dd>
				</div>
			))}
		</dl>
	);
}

export function JsonBlock({ value }: { value: unknown }) {
	return (
		<pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">
			{typeof value === "string" ? value : JSON.stringify(value, null, 2)}
		</pre>
	);
}
