"use client";

import { usePathname, useRouter } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/lib/components/tabs";

import type { Route } from "next";
import type { ReactNode } from "react";

// URL-addressable billing tabs: the transactions panel is a server-fetched
// route segment, so switching tabs navigates rather than toggling state.
export function BillingTabs({
	tab,
	children,
}: {
	tab: "billing" | "transactions" | "details";
	children: ReactNode;
}) {
	const router = useRouter();
	const pathname = usePathname();

	return (
		<Tabs
			value={tab}
			onValueChange={(value) => {
				router.replace(
					(value === "billing"
						? pathname
						: `${pathname}?tab=${value}`) as Route,
				);
			}}
			className="gap-5"
		>
			<TabsList variant="line">
				<TabsTrigger value="billing">Overview</TabsTrigger>
				<TabsTrigger value="transactions">Transactions</TabsTrigger>
				<TabsTrigger value="details">Billing details</TabsTrigger>
			</TabsList>
			{children}
		</Tabs>
	);
}
