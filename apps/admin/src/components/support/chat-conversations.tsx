"use client";

import {
	Archive,
	ArchiveRestore,
	CheckCircle2,
	Loader2,
	RotateCcw,
	Send,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import {
	Pager,
	SearchInput,
	SimpleSelect,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { KeyValue, QueryState } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { cn, formatDateTime } from "@/lib/utils";

import {
	Button,
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	Textarea,
} from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Conversation =
	ApiData<"/admin/chat-support-logs">["conversations"][number];
type Detail = ApiData<"/admin/chat-support-logs/{id}">;

const PAGE = 50;

function ConversationStatus({
	resolvedAt,
	lastMessageRole,
}: {
	resolvedAt: string | null;
	lastMessageRole: string | null;
}) {
	if (resolvedAt) {
		return <Tone tone="muted">Resolved</Tone>;
	}
	if (lastMessageRole === "admin") {
		return <Tone tone="info">Answered</Tone>;
	}
	return <Tone tone="warn">Needs reply</Tone>;
}

export function ChatConversations() {
	const api = useApi();
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim());
	const [archived, setArchived] = useState<"false" | "true">("false");
	const [offset, setOffset] = useState(0);
	const [openId, setOpenId] = useState<string | null>(null);
	const list = api.useQuery("get", "/admin/chat-support-logs", {
		params: {
			query: { limit: PAGE, offset, search: search || undefined, archived },
		},
	});
	const reads = api.useQuery("get", "/admin/chat-support-logs/read-statuses");
	const readStatuses = reads.data?.readStatuses ?? {};
	const isUnread = (c: Conversation) =>
		(readStatuses[c.id] ?? 0) < c.messageCount;

	const columns: ColumnDef<Conversation>[] = [
		{
			accessorKey: "updatedAt",
			header: "Updated",
			cell: ({ row }) => (
				<span className="whitespace-nowrap">
					{formatDateTime(row.original.lastMessageAt ?? row.original.updatedAt)}
				</span>
			),
		},
		{
			accessorKey: "name",
			header: "From",
			cell: ({ row }) => (
				<div className="flex items-start gap-2">
					<span
						aria-label={isUnread(row.original) ? "Unread" : undefined}
						className={cn(
							"mt-1.5 size-2 shrink-0 rounded-full",
							isUnread(row.original) ? "bg-primary" : "bg-transparent",
						)}
					/>
					<div className="min-w-0 space-y-0.5">
						<div
							className={cn(
								"truncate",
								isUnread(row.original) && "font-semibold",
							)}
						>
							{row.original.name ?? "Visitor"}
						</div>
						<div className="truncate text-xs text-muted-foreground">
							{row.original.email ?? "—"}
						</div>
					</div>
				</div>
			),
		},
		{
			id: "subject",
			header: "Conversation",
			cell: ({ row }) => (
				<div className="max-w-md min-w-0 space-y-0.5">
					{row.original.subject ? (
						<div className="truncate font-medium">{row.original.subject}</div>
					) : null}
					<div className="truncate text-xs text-muted-foreground">
						{row.original.firstMessage ?? "—"}
					</div>
				</div>
			),
		},
		{
			accessorKey: "messageCount",
			header: "Messages",
			cell: ({ row }) => (
				<span className="tabular-nums">{row.original.messageCount}</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => (
				<ConversationStatus
					resolvedAt={row.original.resolvedAt}
					lastMessageRole={row.original.lastMessageRole}
				/>
			),
		},
	];

	return (
		<>
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(v) => {
						setQuery(v);
						setOffset(0);
					}}
					placeholder="Search messages"
				/>
				<SimpleSelect
					value={archived}
					onChange={(v) => {
						setArchived(v);
						setOffset(0);
					}}
					options={[
						{ value: "false", label: "Inbox" },
						{ value: "true", label: "Archived" },
					]}
				/>
			</Toolbar>
			<QueryState query={list}>
				{(data) => (
					<>
						<DataTable
							columns={columns}
							data={data.conversations}
							getRowId={(c) => c.id}
							onRowClick={(c) => setOpenId(c.id)}
							empty="No conversations."
						/>
						<Pager
							offset={offset}
							limit={PAGE}
							total={data.total}
							onChange={setOffset}
						/>
					</>
				)}
			</QueryState>
			<Sheet open={openId !== null} onOpenChange={(v) => !v && setOpenId(null)}>
				<SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
					{openId ? (
						<ConversationThread
							key={openId}
							id={openId}
							onClose={() => setOpenId(null)}
						/>
					) : null}
				</SheetContent>
			</Sheet>
		</>
	);
}

function ConversationThread({
	id,
	onClose,
}: {
	id: string;
	onClose: () => void;
}) {
	const api = useApi();
	const detail = api.useQuery("get", "/admin/chat-support-logs/{id}", {
		params: { path: { id } },
	});

	return (
		<>
			<SheetHeader className="border-b">
				<SheetTitle className="truncate pr-8">
					{detail.data?.name ?? detail.data?.email ?? "Conversation"}
				</SheetTitle>
			</SheetHeader>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<QueryState query={detail}>
					{(data) => <ThreadBody data={data} onClose={onClose} />}
				</QueryState>
			</div>
		</>
	);
}

function ThreadBody({ data, onClose }: { data: Detail; onClose: () => void }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [reply, setReply] = useState("");
	const path = { id: data.id };
	const canRead = can("POST", `/admin/chat-support-logs/${data.id}/read`);
	const refresh = () => invalidate("/admin/chat-support-logs");

	const markRead = api.useMutation(
		"post",
		"/admin/chat-support-logs/{id}/read",
		{
			onSuccess: () => invalidate("/admin/chat-support-logs/read-statuses"),
		},
	);
	const { mutate: markReadMutate } = markRead;
	useEffect(() => {
		if (canRead) {
			markReadMutate({
				params: { path: { id: data.id } },
				body: { messageCount: data.messageCount },
			});
		}
	}, [canRead, data.id, data.messageCount, markReadMutate]);

	const send = api.useMutation("post", "/admin/chat-support-logs/{id}/reply", {
		onSuccess: (result) => {
			setReply("");
			if (result.success) {
				toast.success("Reply sent");
			} else {
				toast.warning(`Reply saved. ${result.message}`);
			}
			void refresh();
		},
	});
	const resolve = api.useMutation(
		"patch",
		"/admin/chat-support-logs/{id}/resolve",
		{
			onSuccess: () => {
				toast.success("Updated");
				void refresh();
			},
		},
	);
	const archive = api.useMutation(
		"patch",
		"/admin/chat-support-logs/{id}/archive",
		{
			onSuccess: () => {
				toast.success("Updated");
				onClose();
				void refresh();
			},
		},
	);

	return (
		<div className="space-y-5 p-4">
			<div className="flex flex-wrap items-center gap-2">
				<ConversationStatus
					resolvedAt={data.resolvedAt}
					lastMessageRole={data.messages.at(-1)?.role ?? null}
				/>
				{data.archivedAt ? <Tone tone="muted">Archived</Tone> : null}
			</div>
			<KeyValue
				items={[
					{ label: "Email", value: data.email ?? "—" },
					{
						label: "Organization",
						value: data.organizationId ? (
							<Link
								href={`/organizations/${data.organizationId}` as Route}
								className="font-medium hover:underline"
							>
								{data.organizationName ?? data.organizationId}
							</Link>
						) : (
							"—"
						),
					},
					{ label: "Started", value: formatDateTime(data.createdAt) },
					{
						label: "Resolved",
						value: data.resolvedAt ? formatDateTime(data.resolvedAt) : "—",
					},
					{ label: "IP", value: data.ipAddress ?? "—" },
					{ label: "Messages", value: data.messageCount },
				]}
			/>
			<ol className="space-y-3" aria-label="Messages">
				{data.messages.map((m) => {
					const staff = m.role === "admin";
					return (
						<li
							key={m.id}
							className={cn(
								"flex flex-col",
								staff ? "items-end" : "items-start",
							)}
						>
							<div
								className={cn(
									"max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
									staff
										? "bg-primary text-primary-foreground"
										: "bg-muted text-foreground",
								)}
							>
								{m.content}
							</div>
							<span className="mt-1 text-xs text-muted-foreground">
								{staff
									? "Support"
									: m.role === "assistant"
										? "Assistant"
										: "Customer"}{" "}
								· {formatDateTime(m.createdAt)}
							</span>
						</li>
					);
				})}
			</ol>
			<div className="space-y-2 border-t pt-4">
				<Textarea
					rows={5}
					value={reply}
					onChange={(e) => setReply(e.target.value)}
					placeholder="Reply to the customer. They are notified in the dashboard and by email."
					aria-label="Reply"
					disabled={!can("POST", `/admin/chat-support-logs/${data.id}/reply`)}
				/>
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						disabled={
							!reply.trim() ||
							send.isPending ||
							!can("POST", `/admin/chat-support-logs/${data.id}/reply`)
						}
						onClick={() =>
							send.mutate({ params: { path }, body: { content: reply.trim() } })
						}
					>
						{send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
						Send reply
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={
							resolve.isPending ||
							!can("PATCH", `/admin/chat-support-logs/${data.id}/resolve`)
						}
						onClick={() =>
							resolve.mutate({
								params: { path },
								body: { resolved: !data.resolvedAt },
							})
						}
					>
						{data.resolvedAt ? <RotateCcw /> : <CheckCircle2 />}
						{data.resolvedAt ? "Reopen" : "Mark resolved"}
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={
							archive.isPending ||
							!can("PATCH", `/admin/chat-support-logs/${data.id}/archive`)
						}
						onClick={() =>
							archive.mutate({
								params: { path },
								body: { archived: !data.archivedAt },
							})
						}
					>
						{data.archivedAt ? <ArchiveRestore /> : <Archive />}
						{data.archivedAt ? "Restore" : "Archive"}
					</Button>
				</div>
			</div>
		</div>
	);
}
