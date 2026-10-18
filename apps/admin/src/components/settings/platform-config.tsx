"use client";

import { Loader2, Plus, RotateCcw, Save, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tone } from "@/components/ui/controls";
import { Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { cn, errorMessage } from "@/lib/utils";

import {
	Alert,
	AlertDescription,
	Badge,
	Button,
	Input,
	Label,
	Switch,
	Textarea,
} from "@llmgateway/shared/components";

import type { PlatformConfigEntry } from "@/lib/api/admin-types";

/** Raw editor value per field type. */
type Draft = string | boolean | string[];

function toDraft(entry: PlatformConfigEntry, value: unknown): Draft {
	switch (entry.type) {
		case "boolean":
			return value === true;
		case "stringList":
			return Array.isArray(value) ? value.map(String) : [];
		case "json":
			return JSON.stringify(value ?? null, null, 2);
		default:
			return value === null || value === undefined ? "" : String(value);
	}
}

function same(a: Draft, b: Draft) {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** Parses a draft back to the API value, or returns an error message. */
function parse(
	entry: PlatformConfigEntry,
	draft: Draft,
): { value: unknown } | { error: string } {
	switch (entry.type) {
		case "boolean":
			return { value: draft === true };
		case "stringList":
			return { value: draft };
		case "json":
			try {
				return { value: JSON.parse(String(draft)) as unknown };
			} catch {
				return { error: "Invalid JSON" };
			}
		case "number": {
			const text = String(draft).trim();
			const n = Number(text);
			if (text === "" || !Number.isFinite(n)) {
				return { error: "Enter a number" };
			}
			if (entry.min !== null && n < entry.min) {
				return { error: `At least ${entry.min}` };
			}
			if (entry.max !== null && n > entry.max) {
				return { error: `At most ${entry.max}` };
			}
			return { value: n };
		}
		default:
			return { value: String(draft) };
	}
}

const SOURCE_TONE = { db: "info", env: "warn", default: "muted" } as const;
const SOURCE_LABEL = { db: "admin", env: "env", default: "default" } as const;

function describeDefault(entry: PlatformConfigEntry) {
	const value = entry.default;
	if (Array.isArray(value)) {
		return value.length ? value.join(", ") : "empty";
	}
	if (value !== null && typeof value === "object") {
		return "JSON";
	}
	return value === "" || value === null || value === undefined
		? "empty"
		: String(value);
}

/** One registry category as a form with dirty tracking and a single save. */
export function ConfigCategoryForm({
	label,
	entries,
}: {
	label: string;
	entries: PlatformConfigEntry[];
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const initial = Object.fromEntries(
		entries.map((e) => [e.key, toDraft(e, e.value)]),
	);
	const [drafts, setDrafts] = useState<Record<string, Draft>>(initial);
	const [serverError, setServerError] = useState<string | null>(null);
	const editable = can("PUT", "/admin/settings/config");

	const save = api.useMutation("put", "/admin/settings/config", {
		onSuccess: () => {
			toast.success(`${label} saved`);
			setServerError(null);
			void invalidate("/admin/settings/config");
		},
		onError: (error) => setServerError(errorMessage(error)),
	});
	const reset = api.useMutation("delete", "/admin/settings/config/{key}", {
		onSuccess: () => {
			toast.success("Reset to default");
			void invalidate("/admin/settings/config");
		},
	});

	const dirtyKeys = entries
		.filter((e) => !same(drafts[e.key], initial[e.key]))
		.map((e) => e.key);
	const parsed = Object.fromEntries(
		entries.map((e) => [e.key, parse(e, drafts[e.key])]),
	);
	const invalid = dirtyKeys.some((key) => "error" in parsed[key]);

	function submit() {
		const values: Record<string, unknown> = {};
		for (const key of dirtyKeys) {
			const result = parsed[key];
			if ("value" in result) {
				values[key] = result.value;
			}
		}
		save.mutate({ body: { values } });
	}

	return (
		<Section
			title={label}
			description="Values resolve from the admin panel first, then the environment, then the built-in default."
			actions={
				<>
					{dirtyKeys.length > 0 ? (
						<>
							<span className="text-xs text-muted-foreground">
								{dirtyKeys.length} unsaved change
								{dirtyKeys.length > 1 ? "s" : ""}
							</span>
							<Button
								size="sm"
								variant="ghost"
								disabled={save.isPending}
								onClick={() => {
									setDrafts(initial);
									setServerError(null);
								}}
							>
								Discard
							</Button>
						</>
					) : null}
					<Button
						size="sm"
						disabled={
							!editable || dirtyKeys.length === 0 || invalid || save.isPending
						}
						onClick={submit}
					>
						{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
						Save
					</Button>
				</>
			}
		>
			<div className="space-y-5">
				{serverError ? (
					<Alert variant="destructive">
						<AlertDescription>{serverError}</AlertDescription>
					</Alert>
				) : null}
				{entries.map((entry) => {
					const result = parsed[entry.key];
					const dirty = dirtyKeys.includes(entry.key);
					const error =
						dirty && "error" in result
							? result.error
							: serverError?.includes(entry.key)
								? "Rejected by the server"
								: null;
					return (
						<div
							key={entry.key}
							className={cn(
								"grid gap-2 border-b pb-4 last:border-0 last:pb-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]",
							)}
						>
							<div className="space-y-1">
								<div className="flex flex-wrap items-center gap-1.5">
									<Label htmlFor={`cfg-${entry.key}`}>{entry.label}</Label>
									<Tone tone={SOURCE_TONE[entry.source]}>
										{SOURCE_LABEL[entry.source]}
									</Tone>
									{dirty ? <Tone tone="warn">edited</Tone> : null}
								</div>
								<p className="text-xs text-muted-foreground">
									{entry.description}
								</p>
								<p className="font-mono text-[11px] text-muted-foreground">
									{entry.key}
									{entry.env ? ` · env ${entry.env}` : ""} · default{" "}
									{describeDefault(entry)}
								</p>
							</div>
							<div className="space-y-1.5">
								<FieldInput
									entry={entry}
									value={drafts[entry.key]}
									disabled={!editable}
									invalid={Boolean(error)}
									onChange={(value) =>
										setDrafts((d) => ({ ...d, [entry.key]: value }))
									}
								/>
								{error ? (
									<p className="text-xs text-destructive">{error}</p>
								) : null}
								{entry.source === "db" ? (
									<ConfirmAction
										title={`Reset ${entry.label}`}
										description={`Removes the admin value; ${entry.env ? `${entry.env} or ` : ""}the default (${describeDefault(entry)}) applies again.`}
										confirmLabel="Reset"
										requireReason={false}
										onConfirm={() =>
											reset.mutateAsync({
												params: { path: { key: entry.key } },
											})
										}
									>
										<Button
											size="sm"
											variant="ghost"
											className="h-7 px-2 text-xs"
											disabled={
												!can("DELETE", `/admin/settings/config/${entry.key}`)
											}
										>
											<RotateCcw className="size-3" /> Reset to default
										</Button>
									</ConfirmAction>
								) : null}
							</div>
						</div>
					);
				})}
			</div>
		</Section>
	);
}

function FieldInput({
	entry,
	value,
	onChange,
	disabled,
	invalid,
}: {
	entry: PlatformConfigEntry;
	value: Draft;
	onChange: (value: Draft) => void;
	disabled: boolean;
	invalid: boolean;
}) {
	const id = `cfg-${entry.key}`;
	switch (entry.type) {
		case "boolean":
			return (
				<Switch
					id={id}
					disabled={disabled}
					checked={value === true}
					onCheckedChange={onChange}
				/>
			);
		case "stringList":
			return (
				<ListEditor
					id={id}
					values={Array.isArray(value) ? value : []}
					onChange={onChange}
					disabled={disabled}
				/>
			);
		case "json":
			return (
				<Textarea
					id={id}
					rows={6}
					className="font-mono text-xs"
					disabled={disabled}
					aria-invalid={invalid}
					value={String(value)}
					onChange={(e) => onChange(e.target.value)}
				/>
			);
		case "number":
			return (
				<div className="flex items-center gap-2">
					<Input
						id={id}
						type="number"
						className="max-w-48"
						min={entry.min ?? undefined}
						max={entry.max ?? undefined}
						step="any"
						disabled={disabled}
						aria-invalid={invalid}
						value={String(value)}
						onChange={(e) => onChange(e.target.value)}
					/>
					{entry.unit ? (
						<span className="text-sm text-muted-foreground">{entry.unit}</span>
					) : null}
					{entry.min !== null || entry.max !== null ? (
						<span className="text-xs text-muted-foreground">
							{entry.min ?? "−∞"} – {entry.max ?? "∞"}
						</span>
					) : null}
				</div>
			);
		default:
			return (
				<Input
					id={id}
					disabled={disabled}
					aria-invalid={invalid}
					value={String(value)}
					onChange={(e) => onChange(e.target.value)}
				/>
			);
	}
}

function ListEditor({
	id,
	values,
	onChange,
	disabled,
}: {
	id: string;
	values: string[];
	onChange: (values: string[]) => void;
	disabled: boolean;
}) {
	const [draft, setDraft] = useState("");
	const next = draft.trim();

	function add() {
		const items = next
			.split(",")
			.map((v) => v.trim())
			.filter((v) => v && !values.includes(v));
		if (items.length) {
			onChange([...values, ...items]);
		}
		setDraft("");
	}

	return (
		<div className="space-y-2">
			<div className="flex gap-2">
				<Input
					id={id}
					value={draft}
					disabled={disabled}
					placeholder="Add a value (comma-separated for several)"
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							add();
						}
					}}
				/>
				<Button
					type="button"
					variant="outline"
					disabled={disabled || !next}
					onClick={add}
				>
					<Plus /> Add
				</Button>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{values.length === 0 ? (
					<span className="text-sm text-muted-foreground">Empty.</span>
				) : (
					values.map((v) => (
						<Badge key={v} variant="secondary" className="gap-1 pr-1 font-mono">
							{v}
							<button
								type="button"
								aria-label={`Remove ${v}`}
								disabled={disabled}
								className="rounded-sm p-0.5 hover:bg-background/60"
								onClick={() => onChange(values.filter((x) => x !== v))}
							>
								<X className="size-3" />
							</button>
						</Badge>
					))
				)}
			</div>
		</div>
	);
}
