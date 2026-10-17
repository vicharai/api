"use client";

import { CopyIdButton } from "@/components/ui/copy-id-button";
import { RecordRecentlyViewed } from "@/hooks/use-recently-viewed";

import { PinnedNotes } from "./notes-panel";
import { TagsEditor } from "./tags-editor";

import type { AdminTargetType } from "@/lib/api/pending-paths-p2";

/**
 * Header strip for org and user detail pages: copyable ID, staff tags and
 * pinned notes. Also records the visit for the palette's "recently viewed".
 */
export function DetailAnnotations({
	targetType,
	targetId,
	label,
}: {
	targetType: AdminTargetType;
	targetId: string;
	label: string;
}) {
	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				<CopyIdButton
					value={targetId}
					label={targetType === "organization" ? "Organization ID" : "User ID"}
					showValue
					className="-ml-2 text-muted-foreground"
				/>
				<TagsEditor targetType={targetType} targetId={targetId} />
			</div>
			<PinnedNotes targetType={targetType} targetId={targetId} />
			<RecordRecentlyViewed type={targetType} id={targetId} label={label} />
		</div>
	);
}
