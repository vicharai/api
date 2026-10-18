"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PageHeader, Section } from "@/components/ui/page";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@llmgateway/shared/components";

import {
	ContactSubmissions,
	ProviderListingRequests,
} from "./contact-submissions";
import { SendEmailForm } from "./send-email-dialog";

import type { Route } from "next";

const TABS = ["contact", "listings", "email"] as const;
type Tab = (typeof TABS)[number];

export function SupportInbox() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const tab = (TABS.find((t) => t === params.get("tab")) ?? "contact") as Tab;

	return (
		<>
			<PageHeader
				title="Support"
				description="Contact form submissions, provider listing requests and one-off emails."
			/>
			<Tabs
				value={tab}
				onValueChange={(v) =>
					router.replace(`${pathname}?tab=${v}` as Route, { scroll: false })
				}
			>
				<TabsList>
					<TabsTrigger value="contact">Contact form</TabsTrigger>
					<TabsTrigger value="listings">Provider requests</TabsTrigger>
					<TabsTrigger value="email">Send email</TabsTrigger>
				</TabsList>
				<TabsContent value="contact" className="mt-4">
					<ContactSubmissions />
				</TabsContent>
				<TabsContent value="listings" className="mt-4">
					<ProviderListingRequests />
				</TabsContent>
				<TabsContent value="email" className="mt-4">
					<Section
						title="Send email"
						description="One-off email from the support address. Recorded in the audit log."
						className="max-w-2xl"
					>
						<SendEmailForm />
					</Section>
				</TabsContent>
			</Tabs>
		</>
	);
}
