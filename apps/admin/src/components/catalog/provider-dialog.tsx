"use client";

import { ArrowLeft, CheckCircle2, Loader2, Plug, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useProviderTemplates } from "@/components/catalog/use-provider-templates";
import { SimpleSelect, Tone } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { cn, formatMs } from "@/lib/utils";

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

import type {
	CatalogProvider,
	CatalogProviderTemplate,
} from "@/lib/api/admin-types";

const SLUG = /^[a-z0-9][a-z0-9-]{1,47}$/;
const RESERVED = new Set(["custom", "auto", "dynamic"]);

const AUTH_LABELS: Record<CatalogProviderTemplate["auth"], string> = {
	bearer: "Bearer token",
	"x-api-key": "x-api-key header",
	"api-key-header": "api-key header",
	"query-key": "?key= query",
	"service-account": "Service account",
};

/** Result of a connectivity test, shown inline under the form. */
function TestResult({
	result,
}: {
	result: {
		ok: boolean;
		latencyMs: number | null;
		models: string[] | null;
		error: string | null;
	} | null;
}) {
	if (!result) {
		return null;
	}
	return result.ok ? (
		<div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/10 p-2 text-sm">
			<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
			<div>
				Reachable
				{result.latencyMs !== null ? ` in ${formatMs(result.latencyMs)}` : ""}
				{result.models?.length ? (
					<div className="text-xs text-muted-foreground">
						{result.models.length} models, e.g.{" "}
						{result.models.slice(0, 5).join(", ")}
					</div>
				) : null}
			</div>
		</div>
	) : (
		<div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">
			<XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
			<span className="line-clamp-3 break-all">
				{result.error ?? "Test failed"}
			</span>
		</div>
	);
}

/** Cards for picking the API style a new provider speaks. */
function TemplatePicker({
	templates,
	onPick,
}: {
	templates: CatalogProviderTemplate[];
	onPick: (template: CatalogProviderTemplate) => void;
}) {
	return (
		<div className="grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
			{templates.map((template) => (
				<button
					key={template.id}
					type="button"
					onClick={() => onPick(template)}
					className="flex flex-col items-start gap-1.5 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<span className="font-medium">{template.label}</span>
					<span className="text-xs text-muted-foreground">
						{template.description}
					</span>
					<Tone tone="muted" className="mt-auto">
						{AUTH_LABELS[template.auth]}
					</Tone>
				</button>
			))}
		</div>
	);
}

function initialOptions(
	template: CatalogProviderTemplate | undefined,
	current: Record<string, string> | undefined,
): Record<string, string> {
	if (!template) {
		return { ...current };
	}
	const options: Record<string, string> = {};
	for (const field of template.optionFields) {
		const value = current?.[field.key] ?? field.defaultValue;
		if (value) {
			options[field.key] = value;
		}
	}
	return options;
}

export function ProviderDialog({
	provider: initial,
	existing,
	onClose,
}: {
	provider?: CatalogProvider;
	existing: string[];
	onClose: () => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const { templates, byId, isLoading } = useProviderTemplates();
	const [created, setCreated] = useState<CatalogProvider | null>(null);
	const provider = initial ?? created ?? undefined;
	const [templateId, setTemplateId] = useState<string | null>(
		provider?.template ?? null,
	);
	const template = templateId ? byId.get(templateId) : undefined;
	const [form, setForm] = useState({
		id: provider?.id ?? "",
		name: provider?.name ?? "",
		baseUrl: provider?.baseUrl ?? "",
		apiKey: "",
		description: provider?.description ?? "",
	});
	const [options, setOptions] = useState<Record<string, string>>(() =>
		initialOptions(template, provider?.options),
	);
	const done = (message: string) => () => {
		toast.success(message);
		void invalidate("/admin/catalog", "/admin/provider-credentials");
		onClose();
	};
	const test = api.useMutation("post", "/admin/catalog/providers/{id}/test");
	const create = api.useMutation("post", "/admin/catalog/providers", {
		onSuccess: (res) => {
			toast.success("Provider added. Testing the connection…");
			void invalidate("/admin/catalog", "/admin/provider-credentials");
			setCreated(res.provider);
			setForm((f) => ({ ...f, apiKey: "" }));
			test.mutate({ params: { path: { id: res.provider.id } } });
		},
	});
	const update = api.useMutation("patch", "/admin/catalog/providers/{id}", {
		onSuccess: done("Provider updated"),
	});
	const pending = create.isPending || update.isPending;

	function pickTemplate(next: CatalogProviderTemplate) {
		setTemplateId(next.id);
		setOptions(
			initialOptions(
				next,
				next.id === provider?.template ? provider.options : undefined,
			),
		);
	}

	const picking = !provider && !template;
	const openaiCompatible = template?.id === "openai-compatible";
	const trimmedUrl = form.baseUrl.trim().replace(/\/+$/, "");
	const baseUrl = openaiCompatible
		? trimmedUrl.replace(/\/v1$/, "")
		: trimmedUrl;
	const baseUrlOptional = Boolean(
		template?.defaultBaseUrl ?? template?.baseUrlFromOptions,
	);
	const idError = provider
		? null
		: !SLUG.test(form.id)
			? "2–48 chars: lowercase letters, digits and dashes"
			: RESERVED.has(form.id) || existing.includes(form.id)
				? "This id is already taken"
				: null;
	const urlError = !baseUrl
		? baseUrlOptional
			? null
			: "Required"
		: /^https:\/\/[^\s/]+\S*$/.test(baseUrl)
			? null
			: "Must be an https URL";
	const optionErrors = Object.fromEntries(
		(template?.optionFields ?? []).flatMap((field) => {
			const value = options[field.key]?.trim() ?? "";
			if (!value) {
				return field.required ? [[field.key, "Required"]] : [];
			}
			return field.pattern && !new RegExp(field.pattern).test(value)
				? [[field.key, "Not a valid value"]]
				: [];
		}),
	);
	const keyError =
		!provider && form.apiKey.trim().length < 8 ? "Required" : null;
	const valid =
		Boolean(template) &&
		!idError &&
		!urlError &&
		!keyError &&
		Object.keys(optionErrors).length === 0 &&
		form.name.trim() !== "";

	function submit() {
		if (!template) {
			return;
		}
		const cleanOptions = Object.fromEntries(
			Object.entries(options)
				.map(([key, value]) => [key, value.trim()] as const)
				.filter(([, value]) => value !== ""),
		);
		if (provider) {
			update.mutate({
				params: { path: { id: provider.id } },
				body: {
					name: form.name.trim(),
					template: template.id,
					baseUrl:
						baseUrl && baseUrl !== provider.baseUrl ? baseUrl : undefined,
					options: cleanOptions,
					apiKey: form.apiKey.trim() || undefined,
					description: form.description.trim() || null,
				},
			});
		} else {
			create.mutate({
				body: {
					id: form.id,
					name: form.name.trim(),
					template: template.id,
					baseUrl: baseUrl || undefined,
					options: cleanOptions,
					apiKey: form.apiKey.trim(),
					description: form.description.trim() || undefined,
				},
			});
		}
	}

	return (
		<Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
			<DialogContent className={cn(picking ? "sm:max-w-2xl" : "sm:max-w-lg")}>
				<DialogHeader>
					<DialogTitle>
						{created
							? `${created.name} added`
							: provider
								? `Edit ${provider.name}`
								: "Add provider"}
					</DialogTitle>
					<DialogDescription>
						{picking
							? "Pick the API style the provider speaks. The gateway translates every request into it."
							: "The key is stored as a platform credential; map models to the provider from the Models tab."}
					</DialogDescription>
				</DialogHeader>
				{picking ? (
					isLoading ? (
						<div className="flex justify-center p-6">
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
						</div>
					) : (
						<TemplatePicker templates={templates} onPick={pickTemplate} />
					)
				) : (
					<form
						className="space-y-3"
						onSubmit={(e) => {
							e.preventDefault();
							if (valid) {
								submit();
							}
						}}
					>
						<div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
							<span className="text-muted-foreground">API style</span>
							{provider ? (
								<SimpleSelect
									className="ml-auto h-8"
									ariaLabel="API style"
									value={templateId ?? "openai-compatible"}
									onChange={(id) => {
										const next = byId.get(id);
										if (next) {
											pickTemplate(next);
										}
									}}
									options={templates.map((t) => ({
										value: t.id,
										label: t.label,
									}))}
								/>
							) : (
								<>
									<span className="font-medium">{template?.label}</span>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										className="ml-auto"
										onClick={() => setTemplateId(null)}
									>
										<ArrowLeft /> Change
									</Button>
								</>
							)}
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label htmlFor="prov-id">Id</Label>
								<Input
									id="prov-id"
									className="font-mono"
									disabled={Boolean(provider)}
									placeholder="e.g. acme-ai"
									value={form.id}
									onChange={(e) =>
										setForm((f) => ({
											...f,
											id: e.target.value.toLowerCase(),
										}))
									}
								/>
								{form.id && idError ? (
									<p className="text-xs text-destructive">{idError}</p>
								) : null}
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="prov-name">Name</Label>
								<Input
									id="prov-name"
									value={form.name}
									onChange={(e) =>
										setForm((f) => ({ ...f, name: e.target.value }))
									}
								/>
							</div>
						</div>
						{template?.optionFields.length ? (
							<div className="grid gap-3 sm:grid-cols-2">
								{template.optionFields.map((field) => (
									<div key={field.key} className="space-y-1.5">
										<Label htmlFor={`prov-opt-${field.key}`}>
											{field.label}
											{field.required ? "" : " (optional)"}
										</Label>
										{field.options ? (
											<SimpleSelect
												className="w-full"
												ariaLabel={field.label}
												value={options[field.key] ?? field.defaultValue ?? ""}
												onChange={(value) =>
													setOptions((o) => ({ ...o, [field.key]: value }))
												}
												options={field.options}
											/>
										) : (
											<Input
												id={`prov-opt-${field.key}`}
												className="font-mono"
												placeholder={field.placeholder}
												value={options[field.key] ?? ""}
												onChange={(e) =>
													setOptions((o) => ({
														...o,
														[field.key]: e.target.value,
													}))
												}
											/>
										)}
										{options[field.key] && optionErrors[field.key] ? (
											<p className="text-xs text-destructive">
												{optionErrors[field.key]}
											</p>
										) : field.description ? (
											<p className="text-xs text-muted-foreground">
												{field.description}
											</p>
										) : null}
									</div>
								))}
							</div>
						) : null}
						<div className="space-y-1.5">
							<Label htmlFor="prov-url">
								Base URL{baseUrlOptional ? " (optional)" : ""}
							</Label>
							<Input
								id="prov-url"
								className="font-mono"
								placeholder={
									template?.defaultBaseUrl ?? "https://api.example.com"
								}
								value={form.baseUrl}
								onChange={(e) =>
									setForm((f) => ({ ...f, baseUrl: e.target.value }))
								}
							/>
							{form.baseUrl && urlError ? (
								<p className="text-xs text-destructive">{urlError}</p>
							) : (
								<p className="text-xs text-muted-foreground">
									{template?.baseUrlHint}
									{baseUrl && baseUrl !== form.baseUrl.trim()
										? ` Saved as ${baseUrl}.`
										: ""}
								</p>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="prov-key">
								{template?.apiKeyLabel ?? "API key"}
							</Label>
							{template?.auth === "service-account" ||
							options.tokenType === "oauth" ? (
								<Textarea
									id="prov-key"
									rows={3}
									className="font-mono text-xs"
									autoComplete="off"
									placeholder={
										provider
											? "Leave empty to keep the current credential"
											: template?.apiKeyPlaceholder
									}
									value={form.apiKey}
									onChange={(e) =>
										setForm((f) => ({ ...f, apiKey: e.target.value }))
									}
								/>
							) : (
								<Input
									id="prov-key"
									type="password"
									autoComplete="off"
									placeholder={
										provider
											? "Leave empty to keep the current key"
											: template?.apiKeyPlaceholder
									}
									value={form.apiKey}
									onChange={(e) =>
										setForm((f) => ({ ...f, apiKey: e.target.value }))
									}
								/>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="prov-desc">Description (optional)</Label>
							<Textarea
								id="prov-desc"
								rows={2}
								value={form.description}
								onChange={(e) =>
									setForm((f) => ({ ...f, description: e.target.value }))
								}
							/>
						</div>
						{provider ? <TestResult result={test.data ?? null} /> : null}
						<DialogFooter className="gap-2">
							{provider ? (
								<Button
									type="button"
									variant="outline"
									className="mr-auto"
									disabled={test.isPending}
									onClick={() =>
										test.mutate({ params: { path: { id: provider.id } } })
									}
								>
									{test.isPending ? (
										<Loader2 className="animate-spin" />
									) : (
										<Plug />
									)}
									Test connection
								</Button>
							) : null}
							<Button
								type="button"
								variant="outline"
								disabled={pending}
								onClick={onClose}
							>
								{created ? "Done" : "Cancel"}
							</Button>
							<Button type="submit" disabled={!valid || pending}>
								{pending ? <Loader2 className="animate-spin" /> : null}
								{provider ? "Save" : "Add provider"}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
