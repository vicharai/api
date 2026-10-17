"use client";

import { Loader2, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tone } from "@/components/ui/controls";
import { QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { cn, formatDateTime } from "@/lib/utils";

import { Button, Checkbox, Textarea } from "@llmgateway/shared/components";

import type { AdminNote, AdminTargetType } from "@/lib/api/pending-paths-p2";

/** Internal staff notes on an organization or user. Never shown to customers. */
export function NotesPanel({
	targetType,
	targetId,
	className,
}: {
	targetType: AdminTargetType;
	targetId: string;
	className?: string;
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [body, setBody] = useState("");
	const [pinned, setPinned] = useState(false);
	const notes = api.useQuery("get", "/admin/notes", {
		params: { query: { targetType, targetId } },
	});
	const create = api.useMutation("post", "/admin/notes", {
		onSuccess: () => {
			setBody("");
			setPinned(false);
			void invalidate("/admin/notes");
		},
	});
	const canWrite = can("POST", "/admin/notes");

	return (
		<Section
			title="Staff notes"
			description="Internal only. Pinned notes stay on top."
			className={className}
		>
			<div className="space-y-4">
				{canWrite ? (
					<div className="space-y-2">
						<Textarea
							rows={2}
							value={body}
							placeholder="Add a note for the team…"
							onChange={(e) => setBody(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									if (body.trim()) {
										create.mutate({
											body: { targetType, targetId, body: body.trim(), pinned },
										});
									}
								}
							}}
						/>
						<div className="flex items-center justify-between gap-2">
							<label className="flex items-center gap-2 text-sm text-muted-foreground">
								<Checkbox
									checked={pinned}
									onCheckedChange={(v) => setPinned(v === true)}
								/>
								Pin
							</label>
							<Button
								size="sm"
								disabled={!body.trim() || create.isPending}
								onClick={() =>
									create.mutate({
										body: { targetType, targetId, body: body.trim(), pinned },
									})
								}
							>
								{create.isPending ? <Loader2 className="animate-spin" /> : null}
								Add note
							</Button>
						</div>
					</div>
				) : null}
				<QueryState query={notes} rows={2}>
					{(data) =>
						data.notes.length === 0 ? (
							<p className="text-sm text-muted-foreground">No notes yet.</p>
						) : (
							<ul className="space-y-2">
								{[...data.notes]
									.sort(
										(a, b) =>
											Number(b.pinned) - Number(a.pinned) ||
											b.createdAt.localeCompare(a.createdAt),
									)
									.map((note) => (
										<NoteItem key={note.id} note={note} />
									))}
							</ul>
						)
					}
				</QueryState>
			</div>
		</Section>
	);
}

/** Pinned notes as a compact banner for a detail page header. */
export function PinnedNotes({
	targetType,
	targetId,
}: {
	targetType: AdminTargetType;
	targetId: string;
}) {
	const api = useApi();
	const notes = api.useQuery("get", "/admin/notes", {
		params: { query: { targetType, targetId } },
	});
	const pinned = notes.data?.notes.filter((n) => n.pinned) ?? [];
	if (pinned.length === 0) {
		return null;
	}
	return (
		<ul className="space-y-1 rounded-md border border-warning/50 bg-warning/5 p-2 text-sm">
			{pinned.map((note) => (
				<li key={note.id} className="flex gap-2">
					<Pin className="mt-0.5 size-3.5 shrink-0 text-warning" />
					<span className="min-w-0 break-words whitespace-pre-wrap">
						{note.body}
						<span className="ml-2 text-xs text-muted-foreground">
							— {note.authorEmail ?? "unknown"}
						</span>
					</span>
				</li>
			))}
		</ul>
	);
}

function NoteItem({ note }: { note: AdminNote }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(note.body);
	const update = api.useMutation("patch", "/admin/notes/{id}", {
		onSuccess: () => {
			setEditing(false);
			void invalidate("/admin/notes");
		},
	});
	const remove = api.useMutation("delete", "/admin/notes/{id}", {
		onSuccess: () => {
			toast.success("Note deleted");
			void invalidate("/admin/notes");
		},
	});
	const path = { id: note.id };
	const canEdit = can("PATCH", `/admin/notes/${note.id}`);

	return (
		<li
			className={cn(
				"space-y-1.5 rounded-md border p-3 text-sm",
				note.pinned && "border-warning/50 bg-warning/5",
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					{note.pinned ? <Tone tone="warn">pinned</Tone> : null}
					<span>{note.authorEmail ?? "unknown"}</span>
					<span>· {formatDateTime(note.createdAt)}</span>
					{note.updatedAt !== note.createdAt ? <span>(edited)</span> : null}
				</div>
				{canEdit ? (
					<div className="flex shrink-0 gap-0.5">
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label={note.pinned ? "Unpin" : "Pin"}
							disabled={update.isPending}
							onClick={() =>
								update.mutate({
									params: { path },
									body: { pinned: !note.pinned },
								})
							}
						>
							{note.pinned ? <PinOff /> : <Pin />}
						</Button>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Edit"
							onClick={() => {
								setDraft(note.body);
								setEditing((v) => !v);
							}}
						>
							<Pencil />
						</Button>
						<ConfirmAction
							title="Delete note"
							description="The note is removed for every staff member."
							confirmLabel="Delete"
							destructive
							requireReason={false}
							onConfirm={() => remove.mutateAsync({ params: { path } })}
						>
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label="Delete"
								disabled={!can("DELETE", `/admin/notes/${note.id}`)}
							>
								<Trash2 />
							</Button>
						</ConfirmAction>
					</div>
				) : null}
			</div>
			{editing ? (
				<div className="space-y-2">
					<Textarea
						rows={3}
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
					/>
					<div className="flex justify-end gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setEditing(false)}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							disabled={!draft.trim() || update.isPending}
							onClick={() =>
								update.mutate({
									params: { path },
									body: { body: draft.trim() },
								})
							}
						>
							Save
						</Button>
					</div>
				</div>
			) : (
				<p className="whitespace-pre-wrap break-words">{note.body}</p>
			)}
		</li>
	);
}
