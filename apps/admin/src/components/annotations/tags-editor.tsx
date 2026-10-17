"use client";

import { Plus, Tag, X } from "lucide-react";
import { useId, useState } from "react";

import { useCan } from "@/components/shell/admin-session";
import { SimpleSelect } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import { Badge, Button, Input } from "@llmgateway/shared/components";

import type { AdminTargetType } from "@/lib/api/pending-paths-p2";

/** Lowercase, dash-separated, at most 40 characters. */
export function normalizeTag(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9:_-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

/** Datalist of every tag in use, for tag inputs. */
export function TagSuggestions({
	id,
	targetType,
	exclude = [],
}: {
	id: string;
	targetType?: AdminTargetType;
	exclude?: string[];
}) {
	const api = useApi();
	const all = api.useQuery("get", "/admin/tags/all", {
		params: { query: targetType ? { targetType } : {} },
	});
	return (
		<datalist id={id}>
			{all.data?.tags
				.filter((t) => !exclude.includes(t.tag))
				.map((t) => (
					<option key={t.tag} value={t.tag}>
						{`${t.tag} (${t.count})`}
					</option>
				))}
		</datalist>
	);
}

/** Tag filter select for list pages; `""` means every row. */
export function TagFilter({
	targetType,
	value,
	onChange,
}: {
	targetType: AdminTargetType;
	value: string;
	onChange: (tag: string) => void;
}) {
	const api = useApi();
	const all = api.useQuery("get", "/admin/tags/all", {
		params: { query: { targetType } },
	});
	const tags = all.data?.tags ?? [];
	if (tags.length === 0 && !value) {
		return null;
	}
	return (
		<SimpleSelect
			value={value || ALL_TAGS}
			onChange={(next) => onChange(next === ALL_TAGS ? "" : next)}
			ariaLabel="Tag"
			options={[
				{ value: ALL_TAGS, label: "All tags" },
				...tags.map((t) => ({
					value: t.tag,
					label: `#${t.tag} (${t.count})`,
				})),
				...(value && !tags.some((t) => t.tag === value)
					? [{ value, label: `#${value}` }]
					: []),
			]}
		/>
	);
}

const ALL_TAGS = "__all__";

/** Read-only tag chips for table rows. */
export function TagChips({ tags }: { tags: string[] | undefined }) {
	if (!tags?.length) {
		return null;
	}
	return (
		<span className="flex flex-wrap gap-1">
			{tags.map((tag) => (
				<Badge
					key={tag}
					variant="secondary"
					className="px-1.5 py-0 text-[10px]"
				>
					{tag}
				</Badge>
			))}
		</span>
	);
}

/** Staff tags on an organization or user; each change saves immediately. */
export function TagsEditor({
	targetType,
	targetId,
}: {
	targetType: AdminTargetType;
	targetId: string;
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const listId = useId();
	const [draft, setDraft] = useState("");
	const tags = api.useQuery("get", "/admin/tags", {
		params: { query: { targetType, targetId } },
	});
	const save = api.useMutation("put", "/admin/tags", {
		onSuccess: () => {
			void invalidate("/admin/tags", "/admin/organizations", "/admin/users");
		},
	});
	const current = tags.data?.tags ?? [];
	const editable = can("PUT", "/admin/tags");
	const candidate = normalizeTag(draft);

	function put(next: string[]) {
		save.mutate({ body: { targetType, targetId, tags: next } });
	}

	function add() {
		if (candidate && !current.includes(candidate)) {
			put([...current, candidate]);
		}
		setDraft("");
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<Tag className="size-4 text-muted-foreground" aria-hidden />
			{tags.isLoading ? (
				<span className="text-xs text-muted-foreground">Loading tags…</span>
			) : current.length === 0 && !editable ? (
				<span className="text-xs text-muted-foreground">No tags</span>
			) : null}
			{current.map((tag) => (
				<Badge key={tag} variant="secondary" className="gap-1 pr-1">
					{tag}
					{editable ? (
						<button
							type="button"
							aria-label={`Remove tag ${tag}`}
							disabled={save.isPending}
							className="rounded-sm p-0.5 hover:bg-background/60"
							onClick={() => put(current.filter((t) => t !== tag))}
						>
							<X className="size-3" />
						</button>
					) : null}
				</Badge>
			))}
			{editable ? (
				<form
					className="flex items-center gap-1"
					onSubmit={(e) => {
						e.preventDefault();
						add();
					}}
				>
					<Input
						value={draft}
						list={listId}
						placeholder="Add tag"
						aria-label="Add tag"
						className="h-7 w-32 text-xs"
						onChange={(e) => setDraft(e.target.value)}
					/>
					<TagSuggestions
						id={listId}
						targetType={targetType}
						exclude={current}
					/>
					<Button
						type="submit"
						size="icon-sm"
						variant="ghost"
						aria-label="Add tag"
						disabled={!candidate || save.isPending}
					>
						<Plus />
					</Button>
				</form>
			) : null}
		</div>
	);
}
