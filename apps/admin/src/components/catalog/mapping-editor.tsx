"use client";

import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SimpleSelect } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import {
	Button,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@llmgateway/shared/components";

import {
	MappingFields,
	draftErrors,
	draftFromMapping,
	draftToInput,
	emptyDraft,
} from "./mapping-form";

import type {
	CatalogMapping,
	CatalogModel,
	CatalogProvider,
} from "@/lib/api/admin-types";

export type MappingEditMode = "edit" | "override" | "add";

const TITLES: Record<MappingEditMode, string> = {
	edit: "Edit mapping",
	override: "Override price",
	add: "Add provider mapping",
};

/** Active providers for pickers, custom ones labelled. */
export function providerOptions(
	providers: CatalogProvider[] | undefined,
	exclude: string[] = [],
) {
	return (providers ?? [])
		.filter((p) => p.status === "active" && !exclude.includes(p.id))
		.map((p) => ({
			value: p.id,
			label: p.kind === "custom" ? `${p.name} (custom)` : p.name,
		}));
}

/**
 * Drawer that writes one (model, provider) mapping. On a built-in mapping
 * the save creates a DB override that wins over the static price.
 */
export function MappingEditorSheet({
	model,
	mapping,
	mode,
	onClose,
}: {
	model: CatalogModel;
	mapping?: CatalogMapping;
	mode: MappingEditMode;
	onClose: () => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const providers = api.useQuery("get", "/admin/catalog/providers", undefined, {
		enabled: mode === "add",
	});
	const [draft, setDraft] = useState(() =>
		mapping ? draftFromMapping(mapping) : emptyDraft(),
	);
	const save = api.useMutation(
		"put",
		"/admin/catalog/models/{modelId}/mappings/{providerId}",
		{
			onSuccess: () => {
				toast.success(
					mode === "override" ? "Price override saved" : "Mapping saved",
				);
				void invalidate("/admin/catalog", "/admin/audit-logs");
				onClose();
			},
		},
	);
	const valid = Object.keys(draftErrors(draft)).length === 0;
	const options = providerOptions(
		providers.data?.providers,
		model.mappings.map((m) => m.providerId),
	);

	return (
		<Sheet open onOpenChange={(open) => !open && !save.isPending && onClose()}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
				<SheetHeader>
					<SheetTitle>{TITLES[mode]}</SheetTitle>
					<SheetDescription>
						<span className="font-mono">{model.id}</span>
						{draft.providerId ? (
							<>
								{" on "}
								<span className="font-mono">{draft.providerId}</span>
							</>
						) : null}
						{mode === "override"
							? ". Saves a managed copy of this built-in mapping; the gateway bills at these prices from the next cache refresh."
							: null}
					</SheetDescription>
				</SheetHeader>
				<form
					id="mapping-form"
					className="px-4"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid) {
							save.mutate({
								params: {
									path: { modelId: model.id, providerId: draft.providerId },
								},
								body: draftToInput(draft),
							});
						}
					}}
				>
					<MappingFields
						draft={draft}
						onChange={setDraft}
						pricesOnly={mode === "override"}
						providerPicker={
							mode === "add" ? (
								<SimpleSelect
									className="w-full"
									ariaLabel="Provider"
									placeholder={
										providers.isLoading ? "Loading…" : "Pick a provider"
									}
									value={draft.providerId}
									onChange={(providerId) =>
										setDraft((d) => ({ ...d, providerId }))
									}
									options={options}
								/>
							) : undefined
						}
					/>
				</form>
				<SheetFooter className="flex-row justify-end gap-2">
					<Button variant="outline" onClick={onClose} disabled={save.isPending}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="mapping-form"
						disabled={!valid || save.isPending}
					>
						{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
						{mode === "override" ? "Save override" : "Save mapping"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
