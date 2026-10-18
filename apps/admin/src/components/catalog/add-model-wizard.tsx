"use client";

import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Segmented, SimpleSelect, Tone } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { cn } from "@/lib/utils";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Textarea,
} from "@llmgateway/shared/components";

import { providerOptions } from "./mapping-editor";
import {
	CAPABILITIES,
	MappingFields,
	draftErrors,
	draftToInput,
	emptyDraft,
	type MappingDraft,
} from "./mapping-form";

const STEPS = ["Details", "Mappings", "Review"] as const;
const MODEL_ID = /^[a-z0-9][a-z0-9._-]*$/;

interface Details {
	id: string;
	name: string;
	family: string;
	description: string;
	output: "text" | "embedding";
	aliases: string;
}

const EMPTY: Details = {
	id: "",
	name: "",
	family: "",
	description: "",
	output: "text",
	aliases: "",
};

function detailErrors(d: Details) {
	const errors: Partial<Record<keyof Details, string>> = {};
	if (!MODEL_ID.test(d.id)) {
		errors.id = "Lowercase letters, digits, dot, dash or underscore";
	}
	if (!d.name.trim()) {
		errors.name = "Required";
	}
	if (!d.family.trim()) {
		errors.family = "Required";
	}
	return errors;
}

function aliasList(value: string) {
	return value
		.split(",")
		.map((a) => a.trim())
		.filter(Boolean);
}

export function AddModelWizard({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated?: (modelId: string) => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const providers = api.useQuery("get", "/admin/catalog/providers", undefined, {
		enabled: open,
	});
	const [step, setStep] = useState(0);
	const [details, setDetails] = useState(EMPTY);
	const [mappings, setMappings] = useState<MappingDraft[]>([emptyDraft()]);
	const [active, setActive] = useState(0);

	const create = api.useMutation("post", "/admin/catalog/models", {
		onSuccess: (res) => {
			toast.success(`Model ${res.model.id} created`);
			void invalidate("/admin/catalog", "/admin/models");
			reset();
			onOpenChange(false);
			onCreated?.(res.model.id);
		},
	});

	function reset() {
		setStep(0);
		setDetails(EMPTY);
		setMappings([emptyDraft()]);
		setActive(0);
	}

	const dErrors = detailErrors(details);
	const mappingsValid =
		mappings.length > 0 &&
		mappings.every((m) => Object.keys(draftErrors(m)).length === 0);
	const canNext =
		step === 0 ? Object.keys(dErrors).length === 0 : mappingsValid;
	const providerName = (id: string) =>
		providers.data?.providers.find((p) => p.id === id)?.name ?? id;
	const setDetail = (patch: Partial<Details>) =>
		setDetails((d) => ({ ...d, ...patch }));

	function submit() {
		create.mutate({
			body: {
				id: details.id,
				name: details.name.trim(),
				family: details.family.trim(),
				description: details.description.trim() || undefined,
				output: details.output,
				aliases: aliasList(details.aliases),
				mappings: mappings.map((m) => ({
					providerId: m.providerId,
					...draftToInput(m),
				})),
			},
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => !create.isPending && onOpenChange(next)}
		>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Add model</DialogTitle>
					<DialogDescription>
						Managed models are served by the gateway without a deploy. Text and
						embedding models only.
					</DialogDescription>
				</DialogHeader>
				<ol className="flex items-center gap-2 text-sm">
					{STEPS.map((label, i) => (
						<li key={label} className="flex items-center gap-2">
							<span
								className={cn(
									"flex size-6 items-center justify-center rounded-full border text-xs",
									i === step &&
										"border-primary bg-primary text-primary-foreground",
									i < step && "border-primary text-primary",
								)}
							>
								{i + 1}
							</span>
							<span
								className={cn(
									i === step ? "font-medium" : "text-muted-foreground",
								)}
							>
								{label}
							</span>
							{i < STEPS.length - 1 ? (
								<span className="mx-1 h-px w-6 bg-border" />
							) : null}
						</li>
					))}
				</ol>

				{step === 0 ? (
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor="model-id">Model id</Label>
							<Input
								id="model-id"
								className="font-mono"
								placeholder="e.g. acme-chat-1"
								value={details.id}
								onChange={(e) => setDetail({ id: e.target.value.trim() })}
							/>
							{details.id && dErrors.id ? (
								<p className="text-xs text-destructive">{dErrors.id}</p>
							) : (
								<p className="text-xs text-muted-foreground">
									What customers send as <code>model</code>.
								</p>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="model-name">Display name</Label>
							<Input
								id="model-name"
								value={details.name}
								onChange={(e) => setDetail({ name: e.target.value })}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="model-family">Family</Label>
							<Input
								id="model-family"
								placeholder="e.g. acme"
								value={details.family}
								onChange={(e) => setDetail({ family: e.target.value })}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Output</Label>
							<div>
								<Segmented
									ariaLabel="Output"
									value={details.output}
									onChange={(output) => setDetail({ output })}
									options={[
										{ value: "text", label: "Text" },
										{ value: "embedding", label: "Embedding" },
									]}
								/>
							</div>
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="model-aliases">Aliases (comma-separated)</Label>
							<Input
								id="model-aliases"
								className="font-mono"
								value={details.aliases}
								onChange={(e) => setDetail({ aliases: e.target.value })}
							/>
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="model-desc">Description</Label>
							<Textarea
								id="model-desc"
								rows={2}
								value={details.description}
								onChange={(e) => setDetail({ description: e.target.value })}
							/>
						</div>
					</div>
				) : null}

				{step === 1 ? (
					<div className="space-y-3">
						<div className="flex flex-wrap items-center gap-2">
							{mappings.map((m, i) => (
								<Button
									key={i}
									size="sm"
									variant={i === active ? "secondary" : "ghost"}
									onClick={() => setActive(i)}
								>
									{m.providerId
										? providerName(m.providerId)
										: `Mapping ${i + 1}`}
									{Object.keys(draftErrors(m)).length > 0 ? (
										<span className="size-1.5 rounded-full bg-destructive" />
									) : null}
								</Button>
							))}
							<Button
								size="sm"
								variant="outline"
								onClick={() => {
									setMappings((list) => [...list, emptyDraft()]);
									setActive(mappings.length);
								}}
							>
								<Plus /> Add provider
							</Button>
							{mappings.length > 1 ? (
								<Button
									size="sm"
									variant="ghost"
									className="ml-auto text-destructive"
									onClick={() => {
										setMappings((list) => list.filter((_, i) => i !== active));
										setActive(0);
									}}
								>
									<Trash2 /> Remove this mapping
								</Button>
							) : null}
						</div>
						{mappings[active] ? (
							<MappingFields
								key={active}
								draft={mappings[active]}
								onChange={(next) =>
									setMappings((list) =>
										list.map((m, i) => (i === active ? next : m)),
									)
								}
								providerPicker={
									<SimpleSelect
										className="w-full"
										ariaLabel="Provider"
										placeholder={
											providers.isLoading ? "Loading…" : "Pick a provider"
										}
										value={mappings[active].providerId}
										onChange={(providerId) =>
											setMappings((list) =>
												list.map((m, i) =>
													i === active ? { ...m, providerId } : m,
												),
											)
										}
										options={providerOptions(
											providers.data?.providers,
											mappings
												.filter((_, i) => i !== active)
												.map((m) => m.providerId),
										)}
									/>
								}
							/>
						) : null}
					</div>
				) : null}

				{step === 2 ? (
					<div className="space-y-3 text-sm">
						<dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
							<div>
								<dt className="text-xs text-muted-foreground">Model id</dt>
								<dd className="font-mono">{details.id}</dd>
							</div>
							<div>
								<dt className="text-xs text-muted-foreground">Name</dt>
								<dd>{details.name}</dd>
							</div>
							<div>
								<dt className="text-xs text-muted-foreground">
									Family · output
								</dt>
								<dd>
									{details.family} · {details.output}
								</dd>
							</div>
							{aliasList(details.aliases).length > 0 ? (
								<div className="col-span-full">
									<dt className="text-xs text-muted-foreground">Aliases</dt>
									<dd className="font-mono">
										{aliasList(details.aliases).join(", ")}
									</dd>
								</div>
							) : null}
						</dl>
						<div className="divide-y rounded-md border">
							{mappings.map((m) => {
								const input = draftToInput(m);
								return (
									<div key={m.providerId} className="space-y-1 p-3">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-medium">
												{providerName(m.providerId)}
											</span>
											<span className="font-mono text-xs text-muted-foreground">
												{m.externalId}
											</span>
										</div>
										<div className="text-xs text-muted-foreground tabular-nums">
											${m.prices.inputPrice} in · ${m.prices.outputPrice} out
											per 1M (stored {input.inputPrice} / {input.outputPrice}
											per token)
											{m.contextSize ? ` · ${m.contextSize} ctx` : ""}
										</div>
										<div className="flex flex-wrap gap-1">
											{CAPABILITIES.filter(([key]) => m.caps[key]).map(
												([key, label]) => (
													<Tone key={key} tone="muted">
														{label}
													</Tone>
												),
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				) : null}

				<DialogFooter className="gap-2 sm:justify-between">
					<Button
						variant="outline"
						disabled={step === 0 || create.isPending}
						onClick={() => setStep((s) => s - 1)}
					>
						<ArrowLeft /> Back
					</Button>
					{step < STEPS.length - 1 ? (
						<Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
							Next <ArrowRight />
						</Button>
					) : (
						<Button disabled={create.isPending} onClick={submit}>
							{create.isPending ? <Loader2 className="animate-spin" /> : null}
							Create model
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
