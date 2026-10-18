"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PageHeader, Section } from "@/components/ui/page";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@llmgateway/shared/components";

import { ChatInbox } from "./chat-inbox";
import {
	ContactSubmissions,
	ProviderListingRequests,
} from "./contact-submissions";
import { SendEmailForm } from "./send-email-dialog";

import type { Route } from "next";

const TABS = ["chats", "contact", "listings", "email"] as const;
type Tab = (typeof TABS)[number];

export function SupportInbox() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const tab = (TABS.find((t) => t === params.get("tab")) ?? "chats") as Tab;

	return (
		<>
			<PageHeader
				title="Support"
				description="Support chats, contact form submissions and provider listing requests."
			/>
			<Tabs
				value={tab}
				onValueChange={(v) =>
					router.replace(`${pathname}?tab=${v}` as Route, { scroll: false })
				}
			>
				<TabsList>
					<TabsTrigger value="chats">Chats</TabsTrigger>
					<TabsTrigger value="contact">Contact form</TabsTrigger>
					<TabsTrigger value="listings">Provider requests</TabsTrigger>
					<TabsTrigger value="email">Send email</TabsTrigger>
				</TabsList>
				<TabsContent value="chats" className="mt-4">
					<ChatInbox />
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
