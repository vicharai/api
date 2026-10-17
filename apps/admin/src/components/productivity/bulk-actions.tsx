"use client";

import { Ban, Megaphone, Tag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
	normalizeTag,
	TagSuggestions,
} from "@/components/annotations/tags-editor";
import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useFetchClient } from "@/lib/fetch-client";
import { errorMessage } from "@/lib/utils";

import { Button, Input, Label, Progress } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { RowSelection } from "./bulk-selection";
import type { OrgRef, UserRef } from "./quick-action-dialogs";
import type { AdminTargetType } from "@/lib/api/pending-paths-p2";
import type { Route } from "next";

interface BulkProgress {
	done: number;
	failed: number;
	total: number;
}

/**
 * Runs `task` for each item one at a time, tracking progress. Failures are
 * counted and logged; the run continues.
 */
function useBulkRunner() {
	const [progress, setProgress] = useState<BulkProgress | null>(null);

	async function run<T>(
		items: T[],
		task: (item: T) => Promise<{ error?: unknown }>,
	): Promise<BulkProgress> {
		const state: BulkProgress = { done: 0, failed: 0, total: items.length };
		setProgress({ ...state });
		for (const item of items) {
			try {
				const { error } = await task(item);
				if (error) {
					state.failed++;
					console.error(errorMessage(error));
				}
			} catch (error) {
				state.failed++;
				console.error(error);
			}
			state.done++;
			setProgress({ ...state });
		}
		return state;
	}

	return { progress, run, reset: () => setProgress(null) };
}

function ProgressLine({ progress }: { progress: BulkProgress | null }) {
	if (!progress) {
		return null;
	}
	return (
		<div className="space-y-1">
			<Progress value={(progress.done / Math.max(progress.total, 1)) * 100} />
			<p className="text-xs text-muted-foreground">
				{formatNumber(progress.done)} / {formatNumber(progress.total)} done
				{progress.failed ? ` · ${formatNumber(progress.failed)} failed` : ""}
			</p>
		</div>
	);
}

function summarize(label: string, result: BulkProgress) {
	const ok = result.done - result.failed;
	if (result.failed) {
		toast.warning(
			`${label}: ${formatNumber(ok)} succeeded, ${formatNumber(result.failed)} failed (see console)`,
		);
	} else {
		toast.success(`${label}: ${formatNumber(ok)} done`);
	}
}

function BulkTagAction({
	targetType,
	ids,
}: {
	targetType: AdminTargetType;
	ids: string[];
}) {
	const client = useFetchClient();
	const can = useCan();
	const invalidate = useInvalidate();
	const listId = useId();
	const runner = useBulkRunner();
	const [draft, setDraft] = useState("");
	const [mode, setMode] = useState<"add" | "remove">("add");
	const tag = normalizeTag(draft);

	return (
		<ConfirmAction
			title={`Tag ${formatNumber(ids.length)} ${targetType === "organization" ? "organization(s)" : "user(s)"}`}
			description="Adds or removes one tag on every selected row."
			confirmLabel={mode === "add" ? "Add tag" : "Remove tag"}
			requireReason={false}
			confirmDisabled={!tag || runner.progress !== null}
			onOpenChange={(open) => {
				if (!open) {
					runner.reset();
				}
			}}
			extra={
				<div className="space-y-3">
					<div className="flex gap-2">
						<Button
							type="button"
							size="sm"
							variant={mode === "add" ? "default" : "outline"}
							onClick={() => setMode("add")}
						>
							Add
						</Button>
						<Button
							type="button"
							size="sm"
							variant={mode === "remove" ? "default" : "outline"}
							onClick={() => setMode("remove")}
						>
							Remove
						</Button>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={`${listId}-input`}>Tag</Label>
						<Input
							id={`${listId}-input`}
							list={listId}
							value={draft}
							placeholder="e.g. enterprise-trial"
							onChange={(e) => setDraft(e.target.value)}
						/>
						<TagSuggestions id={listId} targetType={targetType} />
					</div>
					<ProgressLine progress={runner.progress} />
				</div>
			}
			onConfirm={async () => {
				const result = await runner.run(ids, async (targetId) => {
					const { data, error } = await client.GET("/admin/tags", {
						params: { query: { targetType, targetId } },
					});
					if (!data) {
						return { error: error ?? "Failed to read tags" };
					}
					const existing = data.tags;
					const next =
						mode === "add"
							? [...new Set([...existing, tag])]
							: existing.filter((t) => t !== tag);
					if (next.length === existing.length && mode === "add") {
						return {};
					}
					return await client.PUT("/admin/tags", {
						body: { targetType, targetId, tags: next },
					});
				});
				summarize(
					mode === "add" ? `Tagged "${tag}"` : `Untagged "${tag}"`,
					result,
				);
				setDraft("");
				runner.reset();
				void invalidate("/admin/tags", "/admin/organizations", "/admin/users");
			}}
		>
			<Button size="sm" variant="outline" disabled={!can("PUT", "/admin/tags")}>
				<Tag /> Tag
			</Button>
		</ConfirmAction>
	);
}

function SelectionBar({
	count,
	noun,
	onClear,
	children,
}: {
	count: number;
	noun: string;
	onClear: () => void;
	children: ReactNode;
}) {
	if (count === 0) {
		return null;
	}
	return (
		<div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-background/95 p-2 shadow-sm backdrop-blur">
			<span className="px-1 text-sm font-medium">
				{formatNumber(count)} {noun} selected
			</span>
			<div className="flex flex-wrap items-center gap-2">{children}</div>
			<Button
				size="sm"
				variant="ghost"
				className="ml-auto"
				onClick={onClear}
				aria-label="Clear selection"
			>
				<X /> Clear
			</Button>
		</div>
	);
}

/** Bulk tag / announce / block toolbar for selected organizations. */
export function OrgBulkToolbar({
	selection,
}: {
	selection: RowSelection<OrgRef>;
}) {
	const client = useFetchClient();
	const can = useCan();
	const router = useRouter();
	const invalidate = useInvalidate();
	const runner = useBulkRunner();
	const selected = selection.selected;
	const blockable = selected.filter(
		(o) => o.status !== "inactive" && o.status !== "deleted",
	);

	return (
		<SelectionBar
			count={selected.length}
			noun="organization(s)"
			onClear={selection.clear}
		>
			<BulkTagAction
				targetType="organization"
				ids={selected.map((o) => o.id)}
			/>
			<Button
				size="sm"
				variant="outline"
				disabled={!can("POST", "/admin/announcements")}
				onClick={() =>
					router.push(
						`/announcements?orgs=${selected.map((o) => o.id).join(",")}` as Route,
					)
				}
			>
				<Megaphone /> Announce
			</Button>
			<ConfirmAction
				title={`Block ${formatNumber(blockable.length)} organization(s)`}
				description={`Each organization is blocked one at a time: members deactivated, subscriptions cancelled, sessions ended.${selected.length > blockable.length ? ` ${formatNumber(selected.length - blockable.length)} already blocked are skipped.` : ""}`}
				confirmLabel="Block"
				destructive
				confirmDisabled={blockable.length === 0 || runner.progress !== null}
				onOpenChange={(open) => {
					if (!open) {
						runner.reset();
					}
				}}
				extra={<ProgressLine progress={runner.progress} />}
				onConfirm={async (reason) => {
					const result = await runner.run(blockable, (org) =>
						client.POST("/admin/organizations/{orgId}/block", {
							params: { path: { orgId: org.id } },
							body: { reason },
						}),
					);
					summarize("Blocked organizations", result);
					runner.reset();
					selection.clear();
					void invalidate("/admin/organizations", "/admin/users");
				}}
			>
				<Button
					size="sm"
					variant="destructive"
					disabled={!can("POST", "/admin/organizations/_/block")}
				>
					<Ban /> Block
				</Button>
			</ConfirmAction>
		</SelectionBar>
	);
}

/** Bulk tag / block toolbar for selected users. */
export function UserBulkToolbar({
	selection,
}: {
	selection: RowSelection<UserRef>;
}) {
	const client = useFetchClient();
	const can = useCan();
	const invalidate = useInvalidate();
	const runner = useBulkRunner();
	const selected = selection.selected;

	return (
		<SelectionBar
			count={selected.length}
			noun="user(s)"
			onClear={selection.clear}
		>
			<BulkTagAction targetType="user" ids={selected.map((u) => u.id)} />
			<ConfirmAction
				title={`Block ${formatNumber(selected.length)} user(s)`}
				description="Each account is deactivated and signed out, one at a time. Staff accounts and your own are refused by the API and counted as failed."
				confirmLabel="Block"
				destructive
				confirmDisabled={runner.progress !== null}
				onOpenChange={(open) => {
					if (!open) {
						runner.reset();
					}
				}}
				extra={<ProgressLine progress={runner.progress} />}
				onConfirm={async (reason) => {
					const result = await runner.run(selected, (user) =>
						client.POST("/admin/users/{userId}/block", {
							params: { path: { userId: user.id } },
							body: { reason },
						}),
					);
					summarize("Blocked users", result);
					runner.reset();
					selection.clear();
					void invalidate("/admin/users", "/admin/flagged-accounts");
				}}
			>
				<Button
					size="sm"
					variant="destructive"
					disabled={!can("POST", "/admin/users/_/block")}
				>
					<Ban /> Block
				</Button>
			</ConfirmAction>
		</SelectionBar>
	);
}
