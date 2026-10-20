"use client";

import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
	ArrowLeft,
	BookOpen,
	CheckCircle2,
	LifeBuoy,
	Loader2,
	Mail,
	MessageSquarePlus,
	Send,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { getApiErrorMessage } from "@/lib/api-error";
import { Button } from "@/lib/components/button";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import { EmptyState, PageHeader } from "@/lib/components/page-layout";
import { SquircleSurface } from "@/lib/components/squircle";
import { Textarea } from "@/lib/components/textarea";
import { useAppConfig } from "@/lib/config";
import { useDashboardContext } from "@/lib/dashboard-context";
import { useApi } from "@/lib/fetch-client";
import { cn } from "@/lib/utils";

import type { paths } from "@/lib/api/v1";
import type { Route } from "next";

type Detail =
	paths["/support/conversations/{id}"]["get"]["responses"][200]["content"]["application/json"];
type Summary =
	paths["/support/conversations"]["get"]["responses"][200]["content"]["application/json"]["conversations"][number];
type Status = Summary["status"];

const SUBJECT_MAX = 140;
const MESSAGE_MAX = 5000;

const STATUS: Record<Status, { label: string; className: string }> = {
	open: {
		label: "Waiting for support",
		className: "bg-warning-soft text-warning",
	},
	answered: {
		label: "Support replied",
		className: "bg-brand-soft text-brand-strong",
	},
	resolved: {
		label: "Resolved",
		className: "bg-muted text-muted-foreground",
	},
};

function StatusChip({ status }: { status: Status }) {
	const { label, className } = STATUS[status];
	return (
		<span
			className={cn(
				"inline-flex h-6 shrink-0 items-center self-start rounded-full px-2.5 text-xs font-medium",
				className,
			)}
		>
			{label}
		</span>
	);
}

function useSupportView() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const go = (next: { conversation?: string; compose?: boolean }) => {
		const query = new URLSearchParams();
		if (next.conversation) {
			query.set("conversation", next.conversation);
		}
		if (next.compose) {
			query.set("new", "1");
		}
		const suffix = query.size ? `?${query.toString()}` : "";
		router.push(`${pathname}${suffix}` as Route, { scroll: false });
	};
	return {
		selectedId: params.get("conversation"),
		composing: params.get("new") === "1",
		presetSubject: params.get("subject") ?? "",
		go,
	};
}

function useRefreshSupport() {
	const api = useApi();
	const queryClient = useQueryClient();
	return (detail: Detail) => {
		queryClient.setQueryData(
			api.queryOptions("get", "/support/conversations/{id}", {
				params: { path: { id: detail.id } },
			}).queryKey,
			detail,
		);
		void queryClient.invalidateQueries({
			queryKey: api.queryOptions("get", "/support/conversations").queryKey,
		});
	};
}

export function SupportCenter() {
	const api = useApi();
	const { selectedId, composing, presetSubject, go } = useSupportView();
	const list = api.useQuery("get", "/support/conversations");
	const conversations = list.data?.conversations ?? [];
	const empty = list.isSuccess && conversations.length === 0;
	const showForm = !selectedId && (composing || empty);
	const paneOpen = Boolean(selectedId) || showForm;

	return (
		<div className="space-y-5">
			<PageHeader
				title="Help & support"
				description="Ask our team anything about your account, billing or the API. Replies show up here and in your notifications."
				actions={
					<Button
						onClick={() => go({ compose: true })}
						className={cn(!selectedId && (showForm ? "hidden" : "lg:hidden"))}
					>
						<MessageSquarePlus />
						New conversation
					</Button>
				}
			/>
			<div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
				<div className={cn("min-w-0 space-y-5", paneOpen && "max-lg:hidden")}>
					<ConversationList
						conversations={conversations}
						isLoading={list.isLoading}
						error={list.error}
						selectedId={selectedId}
						onSelect={(id) => go({ conversation: id })}
					/>
					<OtherChannels />
				</div>
				<div className={cn("min-w-0", !paneOpen && "max-lg:hidden")}>
					{selectedId ? (
						<ConversationThread
							key={selectedId}
							id={selectedId}
							onBack={() => go({})}
						/>
					) : (
						<NewConversationForm
							key={presetSubject}
							presetSubject={presetSubject}
							showBack={!empty}
							onBack={() => go({})}
							onCreated={(id) => go({ conversation: id })}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

function ConversationList({
	conversations,
	isLoading,
	error,
	selectedId,
	onSelect,
}: {
	conversations: Summary[];
	isLoading: boolean;
	error: unknown;
	selectedId: string | null;
	onSelect: (id: string) => void;
}) {
	return (
		<section aria-labelledby="support-conversations" className="min-w-0">
			<h2
				id="support-conversations"
				className="mb-3 text-base font-medium text-heading"
			>
				Your conversations
			</h2>
			<SquircleSurface className="overflow-hidden">
				{isLoading ? (
					<div className="space-y-3 p-4">
						{[0, 1, 2].map((i) => (
							<div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
						))}
					</div>
				) : error ? (
					<p className="p-5 text-sm text-destructive">
						{getApiErrorMessage(error, "Could not load your conversations.")}
					</p>
				) : conversations.length === 0 ? (
					<EmptyState
						icon={<LifeBuoy />}
						title="No conversations yet"
						hint="Start one and our team will get back to you."
						className="py-10"
					/>
				) : (
					<ul className="divide-y divide-divider">
						{conversations.map((c) => (
							<li key={c.id}>
								<button
									type="button"
									onClick={() => onSelect(c.id)}
									aria-current={c.id === selectedId ? "true" : undefined}
									className={cn(
										"flex w-full min-w-0 flex-col gap-1.5 px-4 py-3.5 text-left transition-colors hover:bg-accent focus-ring",
										c.id === selectedId && "bg-brand-softer",
									)}
								>
									<span className="flex min-w-0 items-center justify-between gap-3">
										<span className="truncate text-sm font-medium text-heading">
											{c.subject ?? c.lastMessage?.preview ?? "Conversation"}
										</span>
										<span className="shrink-0 text-xs text-muted-foreground">
											{formatDistanceToNow(new Date(c.updatedAt), {
												addSuffix: true,
											})}
										</span>
									</span>
									{c.lastMessage ? (
										<span className="line-clamp-2 text-sm text-muted-foreground">
											{c.lastMessage.role === "admin" ? "Support: " : "You: "}
											{c.lastMessage.preview}
										</span>
									) : null}
									<StatusChip status={c.status} />
								</button>
							</li>
						))}
					</ul>
				)}
			</SquircleSurface>
		</section>
	);
}

function OtherChannels() {
	const api = useApi();
	const config = useAppConfig();
	const publicConfig = api.useQuery(
		"get",
		"/v1/config",
		{},
		{ staleTime: 5 * 60 * 1000 },
	);
	const supportEmail = publicConfig.data?.company.supportEmail;
	return (
		<SquircleSurface className="gap-1 p-2">
			<a
				href={config.docsUrl}
				target="_blank"
				rel="noreferrer"
				className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-accent focus-ring"
			>
				<BookOpen className="size-[18px] shrink-0 text-muted-foreground" />
				<span className="min-w-0">
					<span className="block font-medium text-heading">Documentation</span>
					<span className="block text-muted-foreground">
						Guides and the API reference
					</span>
				</span>
			</a>
			{supportEmail ? (
				<a
					href={`mailto:${supportEmail}`}
					className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-accent focus-ring"
				>
					<Mail className="size-[18px] shrink-0 text-muted-foreground" />
					<span className="min-w-0">
						<span className="block font-medium text-heading">Email us</span>
						<span className="block truncate text-muted-foreground">
							{supportEmail}
						</span>
					</span>
				</a>
			) : null}
		</SquircleSurface>
	);
}

function BackButton({ onClick }: { onClick: () => void }) {
	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={onClick}
			aria-label="Back to conversations"
			className="-ml-2 lg:hidden"
		>
			<ArrowLeft className="size-5" />
		</Button>
	);
}

function NewConversationForm({
	presetSubject,
	showBack,
	onBack,
	onCreated,
}: {
	presetSubject: string;
	showBack: boolean;
	onBack: () => void;
	onCreated: (id: string) => void;
}) {
	const api = useApi();
	const refresh = useRefreshSupport();
	const { selectedOrganization } = useDashboardContext();
	const [subject, setSubject] = useState(presetSubject.slice(0, SUBJECT_MAX));
	const [message, setMessage] = useState("");
	const create = api.useMutation("post", "/support/conversations", {
		onSuccess: (detail) => {
			refresh(detail);
			toast.success("Message sent. We'll reply here.");
			onCreated(detail.id);
		},
		onError: (error) =>
			toast.error(getApiErrorMessage(error, "Could not send your message.")),
	});

	return (
		<SquircleSurface>
			<form
				className="space-y-4 p-4 sm:p-5"
				onSubmit={(e) => {
					e.preventDefault();
					create.mutate({
						body: {
							subject: subject.trim() || undefined,
							message: message.trim(),
							organizationId: selectedOrganization?.id,
						},
					});
				}}
			>
				<div className="flex items-center gap-2">
					{showBack ? <BackButton onClick={onBack} /> : null}
					<h2 className="text-base font-medium text-heading">
						New conversation
					</h2>
				</div>
				<div className="space-y-2">
					<Label htmlFor="support-subject">Subject</Label>
					<Input
						id="support-subject"
						value={subject}
						maxLength={SUBJECT_MAX}
						onChange={(e) => setSubject(e.target.value.replace(/\n/g, " "))}
						placeholder="What do you need help with?"
						autoComplete="off"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="support-message">Message</Label>
					<Textarea
						id="support-message"
						value={message}
						maxLength={MESSAGE_MAX}
						onChange={(e) => setMessage(e.target.value)}
						rows={7}
						required
						placeholder="Describe the issue. Include request IDs, model names or error messages if you have them."
						className="min-h-40 max-sm:text-base"
					/>
					<p className="text-xs text-muted-foreground">
						{selectedOrganization
							? `Sent from the ${selectedOrganization.name} workspace. `
							: null}
						{message.length > MESSAGE_MAX - 500
							? `${MESSAGE_MAX - message.length} characters left.`
							: null}
					</p>
				</div>
				<div className="flex justify-end">
					<Button
						type="submit"
						disabled={!message.trim() || create.isPending}
						className="max-sm:w-full"
					>
						{create.isPending ? <Loader2 className="animate-spin" /> : <Send />}
						Send message
					</Button>
				</div>
			</form>
		</SquircleSurface>
	);
}

function ConversationThread({
	id,
	onBack,
}: {
	id: string;
	onBack: () => void;
}) {
	const api = useApi();
	const detail = api.useQuery("get", "/support/conversations/{id}", {
		params: { path: { id } },
	});

	if (detail.isLoading) {
		return (
			<SquircleSurface className="space-y-3 p-5">
				<div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
				<div className="h-20 animate-pulse rounded-xl bg-muted" />
				<div className="h-20 animate-pulse rounded-xl bg-muted" />
			</SquircleSurface>
		);
	}
	if (!detail.data) {
		return (
			<SquircleSurface className="p-5">
				<div className="flex items-center gap-2">
					<BackButton onClick={onBack} />
					<p className="text-sm text-destructive">
						{getApiErrorMessage(detail.error, "Conversation not found.")}
					</p>
				</div>
			</SquircleSurface>
		);
	}
	return <Thread data={detail.data} onBack={onBack} />;
}

function Thread({ data, onBack }: { data: Detail; onBack: () => void }) {
	const api = useApi();
	const refresh = useRefreshSupport();
	const [reply, setReply] = useState("");
	const path = { id: data.id };
	const send = api.useMutation("post", "/support/conversations/{id}/messages", {
		onSuccess: (next) => {
			setReply("");
			refresh(next);
		},
		onError: (error) =>
			toast.error(getApiErrorMessage(error, "Could not send your reply.")),
	});
	const resolve = api.useMutation(
		"post",
		"/support/conversations/{id}/resolve",
		{
			onSuccess: (next) => {
				refresh(next);
				toast.success("Marked as resolved");
			},
			onError: (error) =>
				toast.error(getApiErrorMessage(error, "Could not update.")),
		},
	);

	return (
		<SquircleSurface>
			<div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-divider p-4 sm:p-5">
				<BackButton onClick={onBack} />
				<div className="min-w-0 flex-1">
					<h2 className="break-words text-base font-medium text-heading">
						{data.subject ?? "Support conversation"}
					</h2>
					<div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<StatusChip status={data.status} />
						<span>Started {format(new Date(data.createdAt), "PP")}</span>
					</div>
				</div>
				{data.status !== "resolved" ? (
					<Button
						variant="outline"
						size="sm"
						disabled={resolve.isPending}
						onClick={() => resolve.mutate({ params: { path } })}
					>
						<CheckCircle2 />
						Mark resolved
					</Button>
				) : null}
			</div>
			<ol className="space-y-4 p-4 sm:p-5" aria-label="Messages">
				{data.messages.map((m) => {
					const mine = m.role === "user";
					return (
						<li
							key={m.id}
							className={cn(
								"flex flex-col",
								mine ? "items-end" : "items-start",
							)}
						>
							<span className="mb-1 text-xs text-muted-foreground">
								{mine
									? "You"
									: m.role === "admin"
										? "Vichar support"
										: "Assistant"}{" "}
								· {format(new Date(m.createdAt), "PP p")}
							</span>
							<div
								className={cn(
									"max-w-[min(85%,36rem)] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-6",
									mine
										? "rounded-br-md bg-primary text-primary-foreground"
										: "rounded-bl-md bg-muted text-foreground",
								)}
							>
								{m.content}
							</div>
						</li>
					);
				})}
			</ol>
			<form
				className="space-y-3 border-t border-divider p-4 sm:p-5"
				onSubmit={(e) => {
					e.preventDefault();
					send.mutate({ params: { path }, body: { message: reply.trim() } });
				}}
			>
				{data.status === "resolved" ? (
					<p className="text-sm text-muted-foreground">
						This conversation is resolved. Replying reopens it.
					</p>
				) : null}
				<Label htmlFor="support-reply" className="sr-only">
					Reply
				</Label>
				<Textarea
					id="support-reply"
					value={reply}
					maxLength={MESSAGE_MAX}
					onChange={(e) => setReply(e.target.value)}
					rows={3}
					placeholder="Write a reply"
					className="min-h-24 max-sm:text-base"
				/>
				<div className="flex justify-end">
					<Button
						type="submit"
						disabled={!reply.trim() || send.isPending}
						className="max-sm:w-full"
					>
						{send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
						Send reply
					</Button>
				</div>
			</form>
		</SquircleSurface>
	);
}
