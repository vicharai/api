"use client";

import {
	Archive,
	ArchiveRestore,
	Loader2,
	Send,
	ThumbsDown,
	ThumbsUp,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
	SearchInput,
	SimpleSelect,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import {
	EmptyState,
	LoadingRows,
	QueryState,
	StatCard,
} from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { cn, formatDateTime } from "@/lib/utils";

import {
	Button,
	Card,
	Checkbox,
	Textarea,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { Route } from "next";

export function ChatInbox() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim());
	const [archived, setArchived] = useState<"false" | "true">("false");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [checked, setChecked] = useState<string[]>([]);

	const list = api.useQuery("get", "/admin/chat-support-logs", {
		params: { query: { limit: 100, archived, search: search || undefined } },
	});
	const reads = api.useQuery("get", "/admin/chat-support-logs/read-statuses");
	const stats = api.useQuery("get", "/admin/chat-support-logs/stats");
	const bulkDelete = api.useMutation(
		"post",
		"/admin/chat-support-logs/bulk-delete",
		{
			onSuccess: (res) => {
				toast.success(`Deleted ${res.deletedCount} conversation(s)`);
				setChecked([]);
				setSelectedId(null);
				void invalidate("/admin/chat-support-logs");
			},
		},
	);

	const readMap = reads.data?.readStatuses ?? {};

	return (
		<div className="space-y-4">
			{stats.data ? (
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
					<StatCard
						label="Average rating"
						value={
							stats.data.averageRating === null
								? "—"
								: stats.data.averageRating.toFixed(2)
						}
						hint={`${formatNumber(stats.data.totalRatings)} ratings`}
					/>
					<StatCard
						label="Resolved"
						value={formatNumber(stats.data.resolvedCount)}
					/>
					<StatCard label="Likes" value={formatNumber(stats.data.likes)} />
					<StatCard
						label="Dislikes"
						value={formatNumber(stats.data.dislikes)}
					/>
				</div>
			) : null}
			<Toolbar>
				<SearchInput
					value={query}
					onChange={setQuery}
					placeholder="Name, email, text"
				/>
				<SimpleSelect
					value={archived}
					onChange={(v) => {
						setArchived(v);
						setSelectedId(null);
					}}
					options={[
						{ value: "false", label: "Inbox" },
						{ value: "true", label: "Archived" },
					]}
				/>
				{checked.length > 0 ? (
					<ConfirmAction
						title={`Delete ${checked.length} conversation(s)`}
						description="Permanently deletes the selected conversations and their messages."
						confirmLabel="Delete"
						destructive
						onConfirm={() => bulkDelete.mutateAsync({ body: { ids: checked } })}
					>
						<Button
							size="sm"
							variant="destructive"
							disabled={!can("POST", "/admin/chat-support-logs/bulk-delete")}
						>
							<Trash2 /> Delete {checked.length}
						</Button>
					</ConfirmAction>
				) : null}
			</Toolbar>
			<div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				<Card className="max-h-[70vh] gap-0 overflow-y-auto p-0">
					{list.isLoading ? (
						<div className="p-3">
							<LoadingRows />
						</div>
					) : (list.data?.conversations.length ?? 0) === 0 ? (
						<EmptyState>No conversations.</EmptyState>
					) : (
						<ul className="divide-y">
							{list.data?.conversations.map((c) => {
								const unread = c.messageCount > (readMap[c.id] ?? 0);
								return (
									<li
										key={c.id}
										className={cn(
											"flex gap-3 p-3 hover:bg-accent",
											selectedId === c.id && "bg-accent",
										)}
									>
										<Checkbox
											className="mt-1"
											checked={checked.includes(c.id)}
											onCheckedChange={(v) =>
												setChecked((ids) =>
													v === true
														? [...ids, c.id]
														: ids.filter((id) => id !== c.id),
												)
											}
										/>
										<button
											type="button"
											className="min-w-0 flex-1 text-left"
											onClick={() => setSelectedId(c.id)}
										>
											<div className="flex items-center gap-2">
												{unread ? (
													<span className="size-2 shrink-0 rounded-full bg-brand" />
												) : null}
												<span
													className={cn(
														"truncate text-sm",
														unread && "font-semibold",
													)}
												>
													{c.name ?? c.email ?? "Anonymous"}
												</span>
												<span className="ml-auto shrink-0 text-xs text-muted-foreground">
													{formatDateTime(c.updatedAt)}
												</span>
											</div>
											<p className="truncate text-xs text-muted-foreground">
												{c.firstMessage ?? "—"}
											</p>
											<div className="mt-1 flex gap-1">
												<Tone tone="muted">{c.messageCount} msgs</Tone>
												{c.escalatedAt ? (
													<Tone tone="warn">escalated</Tone>
												) : null}
												{c.resolvedAt ? (
													<Tone tone="good">resolved</Tone>
												) : null}
												{c.rating !== null ? (
													<Tone tone="info">★ {c.rating}</Tone>
												) : null}
											</div>
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</Card>
				<Card className="min-h-[50vh] gap-0 p-0">
					{selectedId ? (
						<ChatThread
							key={selectedId}
							id={selectedId}
							onDeleted={() => setSelectedId(null)}
						/>
					) : (
						<EmptyState>Select a conversation.</EmptyState>
					)}
				</Card>
			</div>
		</div>
	);
}

function ChatThread({ id, onDeleted }: { id: string; onDeleted: () => void }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [reply, setReply] = useState("");
	const path = { id };
	const thread = api.useQuery("get", "/admin/chat-support-logs/{id}", {
		params: { path },
	});
	const markRead = api.useMutation(
		"post",
		"/admin/chat-support-logs/{id}/read",
		{
			onSuccess: () =>
				void invalidate("/admin/chat-support-logs/read-statuses"),
		},
	);
	const send = api.useMutation("post", "/admin/chat-support-logs/{id}/reply", {
		onSuccess: () => {
			toast.success("Reply sent");
			setReply("");
			void invalidate("/admin/chat-support-logs");
		},
	});
	const archive = api.useMutation(
		"patch",
		"/admin/chat-support-logs/{id}/archive",
		{
			onSuccess: () => {
				toast.success("Updated");
				void invalidate("/admin/chat-support-logs");
			},
		},
	);
	const remove = api.useMutation("delete", "/admin/chat-support-logs/{id}", {
		onSuccess: () => {
			toast.success("Conversation deleted");
			onDeleted();
			void invalidate("/admin/chat-support-logs");
		},
	});

	if (thread.isLoading) {
		return (
			<div className="p-4">
				<LoadingRows />
			</div>
		);
	}

	return (
		<QueryState query={thread}>
			{(c) => (
				<div className="flex h-full flex-col">
					<div className="flex flex-wrap items-start justify-between gap-2 border-b p-4">
						<div className="min-w-0">
							<div className="font-medium">{c.name ?? "Anonymous"}</div>
							<div className="text-xs text-muted-foreground">
								{c.email ?? "no email"}
								{c.organizationId ? (
									<>
										{" · "}
										<Link
											href={`/organizations/${c.organizationId}` as Route}
											className="hover:underline"
										>
											{c.organizationName ?? c.organizationId}
										</Link>
									</>
								) : null}
								{c.ipAddress ? ` · ${c.ipAddress}` : ""}
							</div>
						</div>
						<div className="flex gap-1">
							<Button
								size="sm"
								variant="outline"
								disabled={
									markRead.isPending ||
									!can("POST", `/admin/chat-support-logs/${id}/read`)
								}
								onClick={() =>
									markRead.mutate({
										params: { path },
										body: { messageCount: c.messageCount },
									})
								}
							>
								Mark read
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={
									!can("PATCH", `/admin/chat-support-logs/${id}/archive`)
								}
								onClick={() =>
									archive.mutate({
										params: { path },
										body: { archived: !c.archivedAt },
									})
								}
							>
								{c.archivedAt ? <ArchiveRestore /> : <Archive />}
								{c.archivedAt ? "Restore" : "Archive"}
							</Button>
							<ConfirmAction
								title="Delete conversation"
								confirmLabel="Delete"
								destructive
								onConfirm={() => remove.mutateAsync({ params: { path } })}
							>
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label="Delete"
									disabled={!can("DELETE", `/admin/chat-support-logs/${id}`)}
								>
									<Trash2 />
								</Button>
							</ConfirmAction>
						</div>
					</div>
					<div className="flex-1 space-y-3 overflow-y-auto p-4">
						{c.messages.map((m) => (
							<div
								key={m.id}
								className={cn(
									"max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
									m.role === "user"
										? "bg-muted"
										: "ml-auto bg-brand-soft text-foreground",
								)}
							>
								<div className="mb-1 flex items-center gap-2 text-[10px] tracking-wide text-muted-foreground uppercase">
									{m.role} · {formatDateTime(m.createdAt)}
									{m.reaction === "like" ? (
										<ThumbsUp className="size-3" />
									) : null}
									{m.reaction === "dislike" ? (
										<ThumbsDown className="size-3" />
									) : null}
								</div>
								{m.content}
							</div>
						))}
					</div>
					<form
						className="space-y-2 border-t p-4"
						onSubmit={(e) => {
							e.preventDefault();
							send.mutate({ params: { path }, body: { content: reply } });
						}}
					>
						<Textarea
							rows={3}
							placeholder={
								c.email
									? "Reply. Delivered in the chat and by email."
									: "Reply. The visitor left no email, so it shows in the chat only."
							}
							value={reply}
							onChange={(e) => setReply(e.target.value)}
						/>
						<div className="flex justify-end">
							<Button
								type="submit"
								size="sm"
								disabled={
									!reply.trim() ||
									send.isPending ||
									!can("POST", `/admin/chat-support-logs/${id}/reply`)
								}
							>
								{send.isPending ? (
									<Loader2 className="animate-spin" />
								) : (
									<Send />
								)}
								Send reply
							</Button>
						</div>
					</form>
				</div>
			)}
		</QueryState>
	);
}
