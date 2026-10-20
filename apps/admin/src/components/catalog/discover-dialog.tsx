"use client";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { SearchInput, Tone } from "@/components/ui/controls";
import { ErrorState, LoadingRows } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import {
	PLAIN_DECIMAL,
	perMillionToPerToken,
	perTokenToPerMillion,
} from "@/lib/decimal";
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
} from "@llmgateway/shared/components";
import {
	formatCompactNumber,
	formatNumber,
} from "@llmgateway/shared/number-format";

import type { CatalogProvider, DiscoveredModel } from "@/lib/api/admin-types";

const MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const PERCENT = /^-?\d+(\.\d+)?$/;
const CHECKBOX = "size-4 cursor-pointer align-middle accent-primary";

interface Draft {
	selected: boolean;
	modelId: string;
	name: string;
	input: string;
	output: string;
	cached: string;
}

function defaultDraft(model: DiscoveredModel): Draft {
	return {
		selected: false,
		modelId: model.suggestedModelId,
		name: model.displayName ?? model.suggestedModelId,
		input: perTokenToPerMillion(model.inputPrice),
		output: perTokenToPerMillion(model.outputPrice),
		cached: perTokenToPerMillion(model.cachedInputPrice),
	};
}

function draftError(draft: Draft): string | null {
	if (!MODEL_ID.test(draft.modelId)) {
		return "Catalog id: letters, digits, dot, dash, underscore";
	}
	if (!PLAIN_DECIMAL.test(draft.input) || !PLAIN_DECIMAL.test(draft.output)) {
		return "Input and output $/1M are required";
	}
	if (draft.cached && !PLAIN_DECIMAL.test(draft.cached)) {
		return "Cached $/1M must be a decimal";
	}
	return null;
}

/**
 * Lists what a custom provider's upstream serves and imports the picked
 * models: new catalog ids become managed models, existing ids gain a mapping.
 */
export function DiscoverModelsDialog({
	provider,
	onClose,
}: {
	provider: Pick<CatalogProvider, "id" | "name">;
	onClose: () => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const discovery = api.useQuery(
		"post",
		"/admin/catalog/providers/{id}/discover",
		{ params: { path: { id: provider.id } } },
		{ retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
	);
	const catalog = api.useQuery("get", "/admin/catalog/models");
	const [edits, setEdits] = useState<Map<string, Draft>>(() => new Map());
	const [query, setQuery] = useState("");
	const [markup, setMarkup] = useState("0");
	const importModels = api.useMutation(
		"post",
		"/admin/catalog/providers/{id}/import",
		{
			onSuccess: (res) => {
				const title = `Imported ${formatNumber(res.mapped.length)} model(s), ${formatNumber(res.created.length)} new`;
				if (res.skipped.length > 0) {
					toast.warning(
						`${title}; skipped ${formatNumber(res.skipped.length)}`,
						{
							description: res.skipped
								.map((skip) => `${skip.externalId} (${skip.reason})`)
								.join(", "),
						},
					);
				} else {
					toast.success(title);
				}
				void invalidate("/admin/catalog", "/admin/models", "/admin/audit-logs");
				onClose();
			},
		},
	);

	const discoveryError: unknown = discovery.error;
	const models = discovery.data?.models ?? [];
	const catalogIds = useMemo(
		() => new Set((catalog.data?.models ?? []).map((model) => model.id)),
		[catalog.data],
	);
	const draftOf = (model: DiscoveredModel) =>
		edits.get(model.externalId) ?? defaultDraft(model);
	const update = (model: DiscoveredModel, patch: Partial<Draft>) =>
		setEdits((prev) =>
			new Map(prev).set(model.externalId, { ...draftOf(model), ...patch }),
		);
	const search = query.trim().toLowerCase();
	const visible = models.filter(
		(model) =>
			!search ||
			model.externalId.toLowerCase().includes(search) ||
			(model.displayName ?? "").toLowerCase().includes(search),
	);
	const selectable = visible.filter((model) => !model.existing);
	const selected = models.filter(
		(model) => !model.existing && draftOf(model).selected,
	);
	const ids = selected.map((model) => draftOf(model).modelId);
	const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
	const errors = selected
		.map((model) => draftError(draftOf(model)))
		.filter((error): error is string => error !== null);
	const markupValid =
		PERCENT.test(markup.trim()) &&
		Number(markup) >= -100 &&
		Number(markup) <= 1000;
	const problem =
		errors[0] ??
		(duplicate ? `Catalog id ${duplicate} is picked twice` : null) ??
		(markupValid ? null : "Markup must be between -100 and 1000");
	const allVisibleSelected =
		selectable.length > 0 &&
		selectable.every((model) => draftOf(model).selected);

	function setVisibleSelected(checked: boolean) {
		setEdits((prev) => {
			const next = new Map(prev);
			for (const model of selectable) {
				next.set(model.externalId, {
					...(prev.get(model.externalId) ?? defaultDraft(model)),
					selected: checked,
				});
			}
			return next;
		});
	}

	function submit() {
		const perToken = (value: string) => perMillionToPerToken(value) ?? "0";
		importModels.mutate({
			params: { path: { id: provider.id } },
			body: {
				items: selected.map((model) => {
					const draft = draftOf(model);
					const name = draft.name.trim();
					return {
						externalId: model.externalId,
						modelId: draft.modelId.trim(),
						name: name && !catalogIds.has(draft.modelId) ? name : undefined,
						inputPrice: perToken(draft.input),
						outputPrice: perToken(draft.output),
						cachedInputPrice: draft.cached ? perToken(draft.cached) : undefined,
						contextSize: model.contextSize ?? undefined,
						maxOutput: model.maxOutput ?? undefined,
					};
				}),
				defaults: { markupPercent: Number(markup) },
			},
		});
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-6xl">
				<DialogHeader>
					<DialogTitle>Discover models · {provider.name}</DialogTitle>
					<DialogDescription>
						Pick upstream models to import. A new catalog id creates a managed
						model; an existing id adds this provider to it. Prices are $ per 1M
						tokens, prefilled when the upstream publishes them.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-wrap items-end gap-3">
					<SearchInput
						value={query}
						onChange={setQuery}
						placeholder="Filter upstream models"
					/>
					<div className="space-y-1">
						<Label htmlFor="discover-markup" className="text-xs">
							Markup %
						</Label>
						<Input
							id="discover-markup"
							className="h-8 w-24"
							inputMode="decimal"
							value={markup}
							onChange={(e) => setMarkup(e.target.value)}
						/>
					</div>
					<Button
						size="sm"
						variant="outline"
						className="ml-auto"
						disabled={discovery.isFetching}
						onClick={() => void discovery.refetch()}
					>
						<RefreshCw className={cn(discovery.isFetching && "animate-spin")} />
						Refresh
					</Button>
				</div>
				{discoveryError ? (
					<ErrorState error={discoveryError} />
				) : discovery.isLoading ? (
					<LoadingRows rows={4} />
				) : (
					<div className="max-h-[55vh] overflow-auto rounded-md border">
						<table className="w-full text-sm">
							<thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
								<tr>
									<th className="w-8 p-2">
										<input
											type="checkbox"
											className={CHECKBOX}
											aria-label="Select all new models"
											checked={allVisibleSelected}
											disabled={selectable.length === 0}
											onChange={(e) => setVisibleSelected(e.target.checked)}
										/>
									</th>
									<th className="p-2">Upstream model</th>
									<th className="p-2">Catalog id</th>
									<th className="p-2">Name</th>
									<th className="p-2">In $/1M</th>
									<th className="p-2">Out $/1M</th>
									<th className="p-2">Cached $/1M</th>
									<th className="p-2">Context</th>
								</tr>
							</thead>
							<tbody>
								{visible.map((model) => {
									const draft = draftOf(model);
									const error = draft.selected ? draftError(draft) : null;
									const known = catalogIds.has(draft.modelId);
									return (
										<tr
											key={model.externalId}
											className={cn(
												"border-t align-top",
												model.existing && "opacity-60",
											)}
										>
											<td className="p-2">
												<input
													type="checkbox"
													className={CHECKBOX}
													aria-label={`Import ${model.externalId}`}
													checked={draft.selected && !model.existing}
													disabled={Boolean(model.existing)}
													onChange={(e) =>
														update(model, { selected: e.target.checked })
													}
												/>
											</td>
											<td className="max-w-64 p-2">
												<div className="font-mono text-xs break-all">
													{model.externalId}
												</div>
												{model.existing ? (
													<Tone tone="muted" className="mt-1">
														mapped to {model.existing.modelId}
													</Tone>
												) : model.displayName ? (
													<div className="text-xs text-muted-foreground">
														{model.displayName}
													</div>
												) : null}
											</td>
											<td className="p-2">
												<Input
													className="h-8 w-48 font-mono text-xs"
													aria-label="Catalog id"
													value={draft.modelId}
													disabled={Boolean(model.existing)}
													onChange={(e) =>
														update(model, {
															modelId: e.target.value,
															selected: true,
														})
													}
												/>
												{model.existing ? null : (
													<Tone
														tone={known ? "info" : "muted"}
														className="mt-1"
													>
														{known ? "adds provider" : "new model"}
													</Tone>
												)}
												{error ? (
													<div className="mt-1 text-xs text-destructive">
														{error}
													</div>
												) : null}
											</td>
											<td className="p-2">
												<Input
													className="h-8 w-44"
													aria-label="Name"
													value={draft.name}
													disabled={Boolean(model.existing) || known}
													onChange={(e) =>
														update(model, { name: e.target.value })
													}
												/>
											</td>
											{(["input", "output", "cached"] as const).map((key) => (
												<td key={key} className="p-2">
													<Input
														className="h-8 w-20 tabular-nums"
														inputMode="decimal"
														aria-label={`${key} price per 1M`}
														value={draft[key]}
														disabled={Boolean(model.existing)}
														onChange={(e) => {
															const patch: Partial<Draft> = { selected: true };
															patch[key] = e.target.value;
															update(model, patch);
														}}
													/>
												</td>
											))}
											<td className="p-2 text-xs tabular-nums">
												{model.contextSize
													? formatCompactNumber(model.contextSize)
													: "—"}
											</td>
										</tr>
									);
								})}
								{visible.length === 0 ? (
									<tr>
										<td
											colSpan={8}
											className="p-6 text-center text-muted-foreground"
										>
											{models.length === 0
												? "The upstream lists no models."
												: "No upstream models match."}
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				)}
				<DialogFooter className="items-center gap-2">
					<span className="mr-auto text-xs text-muted-foreground">
						{formatNumber(models.length)} upstream ·{" "}
						{formatNumber(models.filter((m) => m.existing).length)} already
						mapped
						{markupValid && Number(markup) !== 0
							? ` · prices ${Number(markup) > 0 ? "+" : ""}${markup}% on import`
							: ""}
					</span>
					{problem && selected.length > 0 ? (
						<span className="text-xs text-destructive">{problem}</span>
					) : null}
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						disabled={
							selected.length === 0 ||
							problem !== null ||
							importModels.isPending
						}
						onClick={submit}
					>
						{importModels.isPending ? (
							<Loader2 className="animate-spin" />
						) : (
							<Sparkles />
						)}
						Import {formatNumber(selected.length)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
