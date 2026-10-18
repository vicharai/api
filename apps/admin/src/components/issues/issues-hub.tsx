"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/ui/page";

import {
	Button,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@llmgateway/shared/components";

import { ContentViolations } from "./content-violations";
import { LimitHits } from "./limit-hits";
import { PaymentFailures } from "./payment-failures";
import { UnstableMappings } from "./unstable-mappings";

import type { Route } from "next";

const TABS = ["mappings", "payments", "limits", "content"] as const;
type Tab = (typeof TABS)[number];

export function IssuesHub() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const tab = (TABS.find((t) => t === params.get("tab")) ?? "mappings") as Tab;

	return (
		<>
			<PageHeader
				title="Issues"
				description="Problems customers are hitting right now: failing providers, declined payments, limits and content filter blocks."
				actions={
					<Button asChild variant="outline" size="sm">
						<Link href="/users/flagged">Flagged accounts</Link>
					</Button>
				}
			/>
			<Tabs
				value={tab}
				onValueChange={(v) =>
					router.replace(`${pathname}?tab=${v}` as Route, { scroll: false })
				}
			>
				<TabsList>
					<TabsTrigger value="mappings">Unstable mappings</TabsTrigger>
					<TabsTrigger value="payments">Payment failures</TabsTrigger>
					<TabsTrigger value="limits">Limit hits</TabsTrigger>
					<TabsTrigger value="content">Content filter</TabsTrigger>
				</TabsList>
				<TabsContent value="mappings" className="mt-4">
					<UnstableMappings />
				</TabsContent>
				<TabsContent value="payments" className="mt-4">
					<PaymentFailures />
				</TabsContent>
				<TabsContent value="limits" className="mt-4">
					<LimitHits />
				</TabsContent>
				<TabsContent value="content" className="mt-4">
					<ContentViolations />
				</TabsContent>
			</Tabs>
		</>
	);
}
