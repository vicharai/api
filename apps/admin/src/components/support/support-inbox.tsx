"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PageHeader, Section } from "@/components/ui/page";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@llmgateway/shared/components";

import { ChatConversations } from "./chat-conversations";
import {
	ContactSubmissions,
	ProviderListingRequests,
} from "./contact-submissions";
import { SendEmailForm } from "./send-email-dialog";

import type { Route } from "next";

const TABS = ["conversations", "contact", "listings", "email"] as const;
type Tab = (typeof TABS)[number];

export function SupportInbox() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const tab = (TABS.find((t) => t === params.get("tab")) ??
		"conversations") as Tab;

	return (
		<>
			<PageHeader
				title="Support"
				description="Customer conversations, contact form submissions, provider listing requests and one-off emails."
			/>
			<Tabs
				value={tab}
				onValueChange={(v) =>
					router.replace(`${pathname}?tab=${v}` as Route, { scroll: false })
				}
			>
				<TabsList className="h-auto max-w-full flex-wrap justify-start">
					<TabsTrigger value="conversations">Conversations</TabsTrigger>
					<TabsTrigger value="contact">Contact form</TabsTrigger>
					<TabsTrigger value="listings">Provider requests</TabsTrigger>
					<TabsTrigger value="email">Send email</TabsTrigger>
				</TabsList>
				<TabsContent value="conversations" className="mt-4">
					<ChatConversations />
				</TabsContent>
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
