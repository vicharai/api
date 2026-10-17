"use client";

import { Building2, X } from "lucide-react";
import { useState } from "react";

import { SimpleSelect } from "@/components/ui/controls";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useApi } from "@/lib/fetch-client";

import {
	Badge,
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	DialogSafePopover,
	PopoverContent,
	PopoverTrigger,
	Button,
} from "@llmgateway/shared/components";

import type {
	AnnouncementSegment,
	SegmentType,
} from "@/lib/api/pending-paths-p2";

export interface SegmentDraft {
	type: SegmentType;
	plan: string;
	kind: string;
	tag: string;
	organizations: { id: string; name: string }[];
}

export const EMPTY_SEGMENT: SegmentDraft = {
	type: "all",
	plan: "pro",
	kind: "default",
	tag: "",
	organizations: [],
};

/** The API segment for a draft, or null while it is incomplete. */
export function toSegment(draft: SegmentDraft): AnnouncementSegment | null {
	switch (draft.type) {
		case "all":
			return { type: "all" };
		case "plan":
			return { type: "plan", value: draft.plan };
		case "kind":
			return { type: "kind", value: draft.kind };
		case "tag":
			return draft.tag ? { type: "tag", value: draft.tag } : null;
		case "organizations":
			return draft.organizations.length > 0
				? { type: "organizations", value: draft.organizations.map((o) => o.id) }
				: null;
	}
}

export function describeSegment(segment: AnnouncementSegment): string {
	const value = Array.isArray(segment.value)
		? `${segment.value.length} organization(s)`
		: segment.value;
	return segment.type === "all" ? "All users" : `${segment.type}: ${value}`;
}

export function SegmentPicker({
	value,
	onChange,
}: {
	value: SegmentDraft;
	onChange: (value: SegmentDraft) => void;
}) {
	const api = useApi();
	const tags = api.useQuery(
		"get",
		"/admin/tags/all",
		{ params: { query: { targetType: "organization" } } },
		{ enabled: value.type === "tag" },
	);

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-2">
				<SimpleSelect
					value={value.type}
					onChange={(type) => onChange({ ...value, type })}
					ariaLabel="Audience"
					options={[
						{ value: "all", label: "All users" },
						{ value: "plan", label: "By plan" },
						{ value: "kind", label: "By org kind" },
						{ value: "tag", label: "By org tag" },
						{ value: "organizations", label: "Specific organizations" },
					]}
				/>
				{value.type === "plan" ? (
					<SimpleSelect
						value={value.plan}
						onChange={(plan) => onChange({ ...value, plan })}
						ariaLabel="Plan"
						options={[
							{ value: "free", label: "Free" },
							{ value: "pro", label: "Pro" },
							{ value: "enterprise", label: "Enterprise" },
						]}
					/>
				) : null}
				{value.type === "kind" ? (
					<SimpleSelect
						value={value.kind}
						onChange={(kind) => onChange({ ...value, kind })}
						ariaLabel="Kind"
						options={[
							{ value: "default", label: "Default" },
							{ value: "devpass", label: "DevPass" },
							{ value: "chat", label: "Chat" },
						]}
					/>
				) : null}
				{value.type === "tag" ? (
					<SimpleSelect
						value={value.tag}
						onChange={(tag) => onChange({ ...value, tag })}
						ariaLabel="Tag"
						placeholder={tags.isLoading ? "Loading…" : "Pick a tag"}
						options={(tags.data?.tags ?? []).map((t) => ({
							value: t.tag,
							label: `${t.tag} (${t.count})`,
						}))}
					/>
				) : null}
				{value.type === "organizations" ? (
					<OrgPicker
						exclude={value.organizations.map((o) => o.id)}
						onPick={(org) =>
							onChange({
								...value,
								organizations: [...value.organizations, org],
							})
						}
					/>
				) : null}
			</div>
			{value.type === "organizations" ? (
				<div className="flex flex-wrap gap-1.5">
					{value.organizations.length === 0 ? (
						<span className="text-sm text-muted-foreground">
							No organizations picked.
						</span>
					) : (
						value.organizations.map((org) => (
							<Badge key={org.id} variant="secondary" className="gap-1 pr-1">
								{org.name}
								<button
									type="button"
									aria-label={`Remove ${org.name}`}
									className="rounded-sm p-0.5 hover:bg-background/60"
									onClick={() =>
										onChange({
											...value,
											organizations: value.organizations.filter(
												(o) => o.id !== org.id,
											),
										})
									}
								>
									<X className="size-3" />
								</button>
							</Badge>
						))
					)}
				</div>
			) : null}
		</div>
	);
}

function OrgPicker({
	exclude,
	onPick,
}: {
	exclude: string[];
	onPick: (org: { id: string; name: string }) => void;
}) {
	const api = useApi();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim(), 250);
	const orgs = api.useQuery(
		"get",
		"/admin/organizations",
		{ params: { query: { search, limit: 10 } } },
		{ enabled: open && search.length >= 2 },
	);

	return (
		<DialogSafePopover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className="h-9">
					<Building2 /> Add organization
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-0" align="start">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search organizations…"
						value={query}
						onValueChange={setQuery}
					/>
					<CommandList>
						<CommandEmpty>
							{search.length < 2
								? "Type at least 2 characters."
								: "No matches."}
						</CommandEmpty>
						{orgs.data?.organizations.length ? (
							<CommandGroup>
								{orgs.data.organizations
									.filter((o) => !exclude.includes(o.id))
									.map((o) => (
										<CommandItem
											key={o.id}
											value={o.id}
											onSelect={() => {
												onPick({ id: o.id, name: o.name });
												setQuery("");
											}}
										>
											<span className="truncate">{o.name}</span>
											<span className="truncate text-xs text-muted-foreground">
												{o.billingEmail}
											</span>
										</CommandItem>
									))}
							</CommandGroup>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</DialogSafePopover>
	);
}
