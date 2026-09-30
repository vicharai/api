"use client";

import { ChartColumn, ChartLine } from "lucide-react";
import { createContext, use, useState } from "react";

import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

export type ChartStyle = "line" | "bar";
const ChartStyleContext = createContext<{
	style: ChartStyle;
	setStyle: (style: ChartStyle) => void;
}>({ style: "line", setStyle: () => undefined });

export function ChartStyleProvider({
	initialStyle,
	children,
}: {
	initialStyle: ChartStyle;
	children: ReactNode;
}) {
	const [style, setValue] = useState(initialStyle);
	const setStyle = (value: ChartStyle) => {
		setValue(value);
		document.cookie = `analytics_chart_style=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
	};
	return (
		<ChartStyleContext value={{ style, setStyle }}>
			{children}
		</ChartStyleContext>
	);
}

export function useChartStyle() {
	return use(ChartStyleContext);
}

export function ChartStyleSelector() {
	const { style, setStyle } = useChartStyle();
	return (
		<div
			role="group"
			aria-label="Chart style"
			className="inline-flex items-center rounded-lg border border-border bg-panel p-0.5"
		>
			{(["line", "bar"] as const).map((value) => (
				<button
					key={value}
					type="button"
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
						style === value
							? "bg-card text-foreground shadow-xs"
							: "text-muted-foreground hover:text-foreground",
					)}
					aria-pressed={style === value}
					onClick={() => setStyle(value)}
				>
					{value === "line" ? (
						<ChartLine className="size-3.5" />
					) : (
						<ChartColumn className="size-3.5" />
					)}
					{value === "line" ? "Line" : "Bar"}
				</button>
			))}
		</div>
	);
}
