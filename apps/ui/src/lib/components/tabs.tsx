"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { cn } from "@/lib/utils";

const TabsVariantContext = React.createContext<"default" | "line">("default");

function Tabs({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col gap-2", className)}
			{...props}
		/>
	);
}

function TabsList({
	className,
	variant = "default",
	...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
	variant?: "default" | "line";
}) {
	return (
		<TabsVariantContext value={variant}>
			<TabsPrimitive.List
				data-slot="tabs-list"
				className={cn(
					variant === "line"
						? "inline-flex w-fit items-end gap-5 border-b border-border text-muted-foreground"
						: "bg-muted text-muted-foreground inline-flex h-9 max-sm:h-10! w-fit items-center justify-center rounded-full p-[3px]",
					className,
				)}
				{...props}
			/>
		</TabsVariantContext>
	);
}

function TabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	const variant = React.use(TabsVariantContext);
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"cursor-pointer focus-visible:outline-ring focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				variant === "line"
					? "relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent min-h-10 pb-2.5 pt-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-brand data-[state=active]:text-brand"
					: "text-foreground dark:text-muted-foreground data-[state=active]:bg-background dark:data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 data-[state=active]:shadow-sm inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-2 py-1 text-sm font-medium transition-[color,box-shadow] focus-visible:ring-[3px]",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("flex-1 outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
