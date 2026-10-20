"use client";

import { Ban, Megaphone, PauseCircle, Tag, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
	normalizeTag,
	TagSuggestions,
} from "@/components/annotations/tags-editor";
import {
	daysFromNow,
	futureIso,
	UntilPicker,
} from "@/components/manage/account-controls";
import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useFetchClient } from "@/lib/fetch-client";
import { errorMessage } from "@/lib/utils";

import {
	Button,
	Checkbox,
	Input,
	Label,
	Progress,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { RowSelection } from "./bulk-selection";
import type { OrgRef, UserRef } from "./quick-action-dialogs";
import type { AdminTargetType } from "@/lib/api/admin-types";
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

interface BulkDeleteResult {
	deleted: string[];
	skipped: { id: string; reason: string }[];
}

function reportBulkDelete(noun: string, result: BulkDeleteResult) {
	if (result.skipped.length) {
		console.warn(`Skipped ${noun}`, result.skipped);
		toast.warning(
			`Deleted ${formatNumber(result.deleted.length)} ${noun}, skipped ${formatNumber(result.skipped.length)}: ${result.skipped
				.slice(0, 3)
				.map((s) => s.reason)
				.join("; ")}${result.skipped.length > 3 ? "…" : ""}`,
		);
	} else {
		toast.success(`Deleted ${formatNumber(result.deleted.length)} ${noun}`);
	}
}

/** Typed `DELETE` confirm shared by the bulk delete dialogs. */
function useTypedDelete() {
	const [typed, setTyped] = useState("");
	return {
		ok: typed.trim() === "DELETE",
		reset: () => setTyped(""),
		field: (
			<div className="space-y-1.5">
				<Label htmlFor="bulk-delete-confirm">
					Type <span className="font-mono">DELETE</span> to confirm
				</Label>
				<Input
					id="bulk-delete-confirm"
					autoComplete="off"
					value={typed}
					onChange={(e) => setTyped(e.target.value)}
				/>
			</div>
		),
	};
}

function BulkSuspendAction({
	noun,
	count,
	disabled,
	onSuspend,
}: {
	noun: string;
	count: number;
	disabled: boolean;
	onSuspend: (
		until: string,
		reason: string,
		runner: ReturnType<typeof useBulkRunner>,
	) => Promise<void>;
}) {
	const runner = useBulkRunner();
	const [until, setUntil] = useState(() => daysFromNow(7));
	const iso = futureIso(until);
	return (
		<ConfirmAction
			title={`Suspend ${formatNumber(count)} ${noun}`}
			description="Each one is suspended until the chosen time, one at a time. Refusals (staff, your own account, deleted orgs) count as failed."
			confirmLabel="Suspend"
			destructive
			confirmDisabled={!iso || runner.progress !== null}
			onOpenChange={(open) => {
				if (!open) {
					runner.reset();
				}
			}}
			extra={
				<div className="space-y-3">
					<UntilPicker
						id="bulk-suspend-until"
						value={until}
						onChange={setUntil}
					/>
					<ProgressLine progress={runner.progress} />
				</div>
			}
			onConfirm={async (reason) => {
				if (iso) {
					await onSuspend(iso, reason, runner);
				}
				runner.reset();
			}}
		>
			<Button size="sm" variant="outline" disabled={disabled}>
				<PauseCircle /> Suspend
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
	const orgDelete = useTypedDelete();
	const [forfeit, setForfeit] = useState(false);
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
			<BulkSuspendAction
				noun="organization(s)"
				count={selected.length}
				disabled={!can("POST", "/admin/organizations/_/suspend")}
				onSuspend={async (until, reason, suspendRunner) => {
					const result = await suspendRunner.run(selected, (org) =>
						client.POST("/admin/organizations/{orgId}/suspend", {
							params: { path: { orgId: org.id } },
							body: { until, reason },
						}),
					);
					summarize("Suspended organizations", result);
					selection.clear();
					void invalidate("/admin/organizations");
				}}
			/>
			<ConfirmAction
				title={`Delete ${formatNumber(selected.length)} organization(s)`}
				description="Soft delete: subscriptions cancelled, API keys revoked, members keep their accounts. Organizations you belong to, already deleted ones and (unless forfeited) ones with a balance are skipped."
				confirmLabel="Delete"
				destructive
				confirmDisabled={!orgDelete.ok}
				onOpenChange={(open) => {
					if (!open) {
						orgDelete.reset();
						setForfeit(false);
					}
				}}
				extra={
					<div className="space-y-3">
						<label className="flex items-start gap-2 text-sm">
							<Checkbox
								className="mt-0.5"
								checked={forfeit}
								onCheckedChange={(v) => setForfeit(v === true)}
							/>
							<span>
								Forfeit positive balances (recorded as balance adjustments)
							</span>
						</label>
						{orgDelete.field}
					</div>
				}
				onConfirm={async (reason) => {
					const { data, error } = await client.POST(
						"/admin/organizations/bulk-delete",
						{
							body: {
								ids: selected.map((o) => o.id),
								reason,
								forfeitBalance: forfeit,
							},
						},
					);
					if (!data) {
						toast.error(errorMessage(error));
						throw new Error(errorMessage(error));
					}
					reportBulkDelete("organization(s)", data);
					selection.clear();
					void invalidate("/admin/organizations", "/admin/users");
				}}
			>
				<Button
					size="sm"
					variant="destructive"
					disabled={
						selected.length > 200 ||
						!can("POST", "/admin/organizations/bulk-delete")
					}
				>
					<Trash2 /> Delete
				</Button>
			</ConfirmAction>
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
	const userDelete = useTypedDelete();

	return (
		<SelectionBar
			count={selected.length}
			noun="user(s)"
			onClear={selection.clear}
		>
			<BulkTagAction targetType="user" ids={selected.map((u) => u.id)} />
			<BulkSuspendAction
				noun="user(s)"
				count={selected.length}
				disabled={!can("POST", "/admin/users/_/suspend")}
				onSuspend={async (until, reason, suspendRunner) => {
					const result = await suspendRunner.run(selected, (user) =>
						client.POST("/admin/users/{userId}/suspend", {
							params: { path: { userId: user.id } },
							body: { until, reason },
						}),
					);
					summarize("Suspended users", result);
					selection.clear();
					void invalidate("/admin/users");
				}}
			/>
			<ConfirmAction
				title={`Delete ${formatNumber(selected.length)} user(s)`}
				description="Permanently deletes each account and the organizations they solely own. Staff accounts and your own are skipped. This cannot be undone."
				confirmLabel="Delete"
				destructive
				confirmDisabled={!userDelete.ok}
				onOpenChange={(open) => {
					if (!open) {
						userDelete.reset();
					}
				}}
				extra={userDelete.field}
				onConfirm={async (reason) => {
					const { data, error } = await client.POST(
						"/admin/users/bulk-delete",
						{
							body: { ids: selected.map((u) => u.id), reason },
						},
					);
					if (!data) {
						toast.error(errorMessage(error));
						throw new Error(errorMessage(error));
					}
					reportBulkDelete("user(s)", data);
					selection.clear();
					void invalidate("/admin/users", "/admin/organizations");
				}}
			>
				<Button
					size="sm"
					variant="destructive"
					disabled={
						selected.length > 200 || !can("POST", "/admin/users/bulk-delete")
					}
				>
					<Trash2 /> Delete
				</Button>
			</ConfirmAction>
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
