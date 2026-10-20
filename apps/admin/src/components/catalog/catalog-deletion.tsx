"use client";

import { MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SelectionBar } from "@/components/productivity/bulk-actions";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect, Tone } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDate } from "@/lib/utils";

import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	Input,
	Label,
	Textarea,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

export type CatalogScope = "model" | "provider";
export type DeletionAction = "delete" | "restore";
export type DeletedView = "active" | "deleted" | "all";

/** What a delete/restore dialog acts on. */
export interface DeletionTarget {
	id: string;
	name: string;
	deleted: boolean;
}

export interface DeletionDialogState {
	action: DeletionAction;
	targets: DeletionTarget[];
	bulk: boolean;
}

interface DeletionInfo {
	deleted: boolean;
	deletedAt: string | null;
	deletedByEmail: string | null;
	deletionReason: string | null;
}

const CONFIRM_WORD = "DELETE";

export const DELETED_VIEW_QUERY = {
	active: "exclude",
	deleted: "only",
	all: "include",
} as const satisfies Record<DeletedView, "exclude" | "only" | "include">;

export function toDeletedView(value: string): DeletedView {
	return value === "deleted" || value === "all" ? value : "active";
}

export function DeletedViewSelect({
	value,
	onChange,
}: {
	value: DeletedView;
	onChange: (value: DeletedView) => void;
}) {
	return (
		<SimpleSelect
			ariaLabel="Deleted"
			value={value}
			onChange={onChange}
			options={[
				{ value: "active", label: "Active" },
				{ value: "deleted", label: "Deleted" },
				{ value: "all", label: "All" },
			]}
		/>
	);
}

export function DeletedBadge({ info }: { info: DeletionInfo }) {
	if (!info.deleted) {
		return null;
	}
	const details = [
		info.deletedAt ? formatDate(info.deletedAt) : null,
		info.deletedByEmail,
		info.deletionReason,
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<Tone tone="bad" className="cursor-help">
			<span title={details || undefined}>Deleted</span>
		</Tone>
	);
}

/** Row menu with Delete or Restore; keeps clicks off the row handler. */
export function DeletionRowMenu({
	target,
	onSelect,
}: {
	target: DeletionTarget;
	onSelect: (action: DeletionAction) => void;
}) {
	return (
		<div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label={`Actions for ${target.id}`}
					>
						<MoreHorizontal />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{target.deleted ? (
						<DropdownMenuItem onSelect={() => onSelect("restore")}>
							<RotateCcw className="mr-2 size-4" /> Restore
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => onSelect("delete")}
						>
							<Trash2 className="mr-2 size-4" /> Delete
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

/** Delete / Restore buttons for the current selection. */
export function DeletionSelectionBar({
	selected,
	noun,
	onClear,
	onAction,
}: {
	selected: DeletionTarget[];
	noun: string;
	onClear: () => void;
	onAction: (state: DeletionDialogState) => void;
}) {
	const active = selected.filter((target) => !target.deleted);
	const deleted = selected.filter((target) => target.deleted);
	return (
		<SelectionBar count={selected.length} noun={noun} onClear={onClear}>
			{active.length > 0 ? (
				<Button
					size="sm"
					variant="destructive"
					onClick={() =>
						onAction({ action: "delete", targets: active, bulk: true })
					}
				>
					<Trash2 /> Delete {formatNumber(active.length)}
				</Button>
			) : null}
			{deleted.length > 0 ? (
				<Button
					size="sm"
					variant="outline"
					onClick={() =>
						onAction({ action: "restore", targets: deleted, bulk: true })
					}
				>
					<RotateCcw /> Restore {formatNumber(deleted.length)}
				</Button>
			) : null}
		</SelectionBar>
	);
}

interface Outcome {
	changed: string[];
	skipped: { id: string; reason: string }[];
}

/** Delete or restore models/providers: single endpoints for one, bulk for many. */
function useDeletionRunner(scope: CatalogScope) {
	const api = useApi();
	const deleteModel = api.useMutation(
		"delete",
		"/admin/catalog/models/{modelId}",
	);
	const restoreModel = api.useMutation(
		"post",
		"/admin/catalog/models/{modelId}/restore",
	);
	const bulkDeleteModels = api.useMutation(
		"post",
		"/admin/catalog/models/bulk-delete",
	);
	const bulkRestoreModels = api.useMutation(
		"post",
		"/admin/catalog/models/bulk-restore",
	);
	const deleteProvider = api.useMutation(
		"delete",
		"/admin/catalog/providers/{id}",
	);
	const restoreProvider = api.useMutation(
		"post",
		"/admin/catalog/providers/{id}/restore",
	);
	const bulkDeleteProviders = api.useMutation(
		"post",
		"/admin/catalog/providers/bulk-delete",
	);
	const bulkRestoreProviders = api.useMutation(
		"post",
		"/admin/catalog/providers/bulk-restore",
	);

	return async (
		action: DeletionAction,
		ids: string[],
		reason: string | undefined,
		bulk: boolean,
	): Promise<Outcome> => {
		const [id] = ids;
		if (!bulk && id) {
			if (scope === "model") {
				await (action === "delete"
					? deleteModel.mutateAsync({
							params: { path: { modelId: id } },
							body: { reason },
						})
					: restoreModel.mutateAsync({ params: { path: { modelId: id } } }));
			} else {
				await (action === "delete"
					? deleteProvider.mutateAsync({
							params: { path: { id } },
							body: { reason },
						})
					: restoreProvider.mutateAsync({ params: { path: { id } } }));
			}
			return { changed: [id], skipped: [] };
		}
		if (action === "delete") {
			const res = await (
				scope === "model" ? bulkDeleteModels : bulkDeleteProviders
			).mutateAsync({ body: { ids, reason } });
			return { changed: res.deleted, skipped: res.skipped };
		}
		const res = await (
			scope === "model" ? bulkRestoreModels : bulkRestoreProviders
		).mutateAsync({ body: { ids } });
		return { changed: res.restored, skipped: res.skipped };
	};
}

function summarize(
	action: DeletionAction,
	noun: string,
	outcome: Outcome,
): void {
	const verb = action === "delete" ? "Deleted" : "Restored";
	const title = `${verb} ${formatNumber(outcome.changed.length)} ${noun}`;
	if (outcome.skipped.length === 0) {
		toast.success(title);
		return;
	}
	toast.warning(`${title}, skipped ${formatNumber(outcome.skipped.length)}`, {
		description: outcome.skipped
			.map((skip) => `${skip.id} (${skip.reason})`)
			.join(", "),
	});
}

/**
 * Confirms a delete or restore. Bulk deletes ask the admin to type DELETE;
 * the optional reason is stored with the deletion.
 */
export function CatalogDeletionDialog({
	scope,
	action,
	targets,
	bulk,
	open,
	onOpenChange,
	onDone,
}: {
	scope: CatalogScope;
	action: DeletionAction;
	targets: DeletionTarget[];
	bulk: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDone?: () => void;
}) {
	const invalidate = useInvalidate();
	const run = useDeletionRunner(scope);
	const [reason, setReason] = useState("");
	const [typed, setTyped] = useState("");
	const plural = scope === "model" ? "model(s)" : "provider(s)";
	const subject = bulk
		? `${formatNumber(targets.length)} ${plural}`
		: (targets[0]?.name ?? scope);
	const deleting = action === "delete";

	return (
		<ConfirmAction
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					setReason("");
					setTyped("");
				}
				onOpenChange(next);
			}}
			title={`${deleting ? "Delete" : "Restore"} ${subject}`}
			description={
				deleting
					? scope === "model"
						? "The gateway treats a deleted model as unknown: requests fail and it leaves /v1/models. Its definition and history are kept, so you can restore it any time."
						: "The gateway stops routing to a deleted provider and drops it from /v1/models; models served only by it become unavailable. Restore it any time."
					: `Brings the ${plural} back into routing and listings.`
			}
			destructive={deleting}
			requireReason={false}
			confirmLabel={deleting ? "Delete" : "Restore"}
			confirmDisabled={
				targets.length === 0 || (deleting && bulk && typed !== CONFIRM_WORD)
			}
			extra={
				<div className="space-y-3">
					{bulk ? (
						<p className="max-h-24 overflow-y-auto font-mono text-xs break-all text-muted-foreground">
							{targets.map((target) => target.id).join(", ")}
						</p>
					) : null}
					{deleting ? (
						<div className="space-y-1.5">
							<Label htmlFor="catalog-delete-reason">Reason (optional)</Label>
							<Textarea
								id="catalog-delete-reason"
								rows={2}
								maxLength={500}
								value={reason}
								onChange={(e) => setReason(e.target.value)}
							/>
						</div>
					) : null}
					{deleting && bulk ? (
						<div className="space-y-1.5">
							<Label htmlFor="catalog-delete-confirm">
								Type {CONFIRM_WORD} to confirm
							</Label>
							<Input
								id="catalog-delete-confirm"
								autoComplete="off"
								value={typed}
								onChange={(e) => setTyped(e.target.value)}
							/>
						</div>
					) : null}
				</div>
			}
			onConfirm={async () => {
				const outcome = await run(
					action,
					targets.map((target) => target.id),
					reason.trim() || undefined,
					bulk,
				);
				summarize(action, plural, outcome);
				setReason("");
				setTyped("");
				void invalidate("/admin/catalog", "/admin/audit-logs");
				onDone?.();
			}}
		/>
	);
}
