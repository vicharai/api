"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/lib/components/badge";
import { Button } from "@/lib/components/button";
import { Label } from "@/lib/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/lib/components/select";
import { useApi } from "@/lib/fetch-client";

import { MultiModelIdSelector } from "@llmgateway/shared/components";
import {
	assignSmartRoutingBands,
	SMART_ROUTING_MAX_MODELS,
	type SmartRoutingClassifier,
	type SmartRoutingConfig,
	type SmartRoutingDifficulty,
} from "@llmgateway/shared/smart-routing";

const CLASSIFIER_OPTIONS: Array<{
	value: SmartRoutingClassifier;
	label: string;
	description: string;
}> = [
	{
		value: "none",
		label: "None (cheapest eligible model)",
		description:
			"Pick the cheapest model in the list that can serve the request.",
	},
	{
		value: "jev",
		label: "Jev (TypeSafe)",
		description:
			"Rate each request's difficulty, then pick from the matching price band. Adds one short classifier round trip.",
	},
];

function formatAveragePrice(price: number | undefined): string {
	if (price === undefined) {
		return "Unpriced";
	}
	if (price === 0) {
		return "Free";
	}
	return `$${(price * 1_000_000).toFixed(2)}/1M`;
}

const BAND_LABELS: Record<SmartRoutingDifficulty, string> = {
	low: "Low",
	medium: "Medium",
	high: "High",
};

const PSEUDO_MODEL_IDS = new Set(["auto", "smart", "custom"]);

export interface SmartRoutingSettingsProps {
	value: SmartRoutingConfig | null;
	canManage: boolean;
	isSaving?: boolean;
	onSave: (config: SmartRoutingConfig) => void | Promise<void>;
}

export function SmartRoutingSettings({
	value,
	canManage,
	isSaving,
	onSave,
}: SmartRoutingSettingsProps) {
	const [classifier, setClassifier] = useState<SmartRoutingClassifier>(
		value?.classifier ?? "none",
	);
	const [modelIds, setModelIds] = useState<string[]>(value?.models ?? []);

	useEffect(() => {
		setClassifier(value?.classifier ?? "none");
		setModelIds(value?.models ?? []);
	}, [value]);

	// The picker only offers models the platform can actually serve —
	// `/internal/models?configuredOnly` scopes to connected providers and their
	// `allowed_models`, so unconfigured or internal ids never appear.
	const api = useApi();
	const { data: modelsData, isLoading: modelsLoading } = api.useQuery(
		"get",
		"/internal/models",
		{ params: { query: { configuredOnly: "true" } } },
		{ staleTime: 5 * 60 * 1000 },
	);

	const catalog = useMemo(() => {
		const now = Date.now();
		const entries = new Map<
			string,
			{ name: string; avgPrice: number | undefined }
		>();
		for (const model of modelsData?.models ?? []) {
			if (model.status !== "active" || PSEUDO_MODEL_IDS.has(model.id)) {
				continue;
			}
			if (model.output && !model.output.includes("text")) {
				continue;
			}
			const servable = model.servableProviderIds;
			const live = model.mappings.filter(
				(mapping) =>
					(servable === undefined || servable.includes(mapping.providerId)) &&
					!(
						mapping.deprecatedAt &&
						new Date(mapping.deprecatedAt).getTime() <= now
					) &&
					!(
						mapping.deactivatedAt &&
						new Date(mapping.deactivatedAt).getTime() <= now
					),
			);
			if (live.length === 0) {
				continue;
			}
			let avgPrice: number | undefined;
			for (const mapping of live) {
				if (mapping.inputPrice === null && mapping.outputPrice === null) {
					continue;
				}
				const price =
					(Number(mapping.inputPrice ?? 0) + Number(mapping.outputPrice ?? 0)) /
					2;
				if (avgPrice === undefined || price < avgPrice) {
					avgPrice = price;
				}
			}
			entries.set(model.id, { name: model.name ?? model.id, avgPrice });
		}
		return entries;
	}, [modelsData]);
	const selectableModelIds = useMemo(
		() => Array.from(catalog.keys()),
		[catalog],
	);

	// The preview applies the gateway's own ranking — blended average price,
	// then the three-band split — to the configured providers' prices. It is an
	// estimate: the gateway ranks the providers the project can actually use,
	// at whatever rates apply to it, so the real split can differ.
	const preview = useMemo(() => {
		const priced = modelIds
			.map((id) => {
				const entry = catalog.get(id);
				return { id, name: entry?.name ?? id, price: entry?.avgPrice };
			})
			.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
		const bands = assignSmartRoutingBands(priced.length);
		return priced.map((entry, index) => ({ ...entry, band: bands[index] }));
	}, [modelIds, catalog]);

	const tooManyModels = modelIds.length > SMART_ROUTING_MAX_MODELS;
	const unknownModels = modelIds.filter((id) => !catalog.has(id));

	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Label>Classifier</Label>
				<Select
					value={classifier}
					onValueChange={(next) =>
						setClassifier(next as SmartRoutingClassifier)
					}
					disabled={!canManage}
				>
					<SelectTrigger className="w-full max-w-sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{CLASSIFIER_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-muted-foreground text-sm">
					{
						CLASSIFIER_OPTIONS.find((option) => option.value === classifier)
							?.description
					}
				</p>
			</div>

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label>Eligible models</Label>
					<span className="text-muted-foreground text-xs">
						{modelIds.length} / {SMART_ROUTING_MAX_MODELS}
					</span>
				</div>
				<MultiModelIdSelector
					availableIds={selectableModelIds}
					value={modelIds}
					onChange={setModelIds}
					placeholder={
						modelsLoading
							? "Loading models..."
							: "Select models for smart routing..."
					}
				/>
				{tooManyModels ? (
					<p className="text-destructive text-xs">
						Select at most {SMART_ROUTING_MAX_MODELS} models.
					</p>
				) : null}
				{unknownModels.length > 0 ? (
					<p className="text-destructive text-xs">
						Unavailable models: {unknownModels.join(", ")} — not offered by any
						connected provider.
					</p>
				) : null}
			</div>

			{preview.length > 0 ? (
				<div className="space-y-2">
					<Label>Difficulty bands</Label>
					<div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
						{preview.map((entry) => (
							<div
								key={entry.id}
								className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
							>
								<div className="min-w-0">
									<div className="truncate font-medium">{entry.name}</div>
									<div className="text-muted-foreground truncate text-xs">
										{entry.id}
									</div>
								</div>
								<div className="flex shrink-0 items-center gap-3">
									<span className="text-muted-foreground text-xs">
										{formatAveragePrice(entry.price)} avg
									</span>
									<Badge variant="secondary">{BAND_LABELS[entry.band]}</Badge>
								</div>
							</div>
						))}
					</div>
					<p className="text-muted-foreground text-xs">
						Requests the classifier rates Low, Medium or High are served from
						the matching band. Without a classifier the cheapest eligible model
						always wins. Prices are the cheapest configured provider's rate for
						each model; the gateway ranks only the providers your project can
						use, at your rates, so the split can differ.
					</p>
				</div>
			) : null}

			<div className="flex justify-end">
				<Button
					disabled={
						!canManage ||
						isSaving ||
						modelIds.length === 0 ||
						tooManyModels ||
						unknownModels.length > 0
					}
					onClick={() => void onSave({ classifier, models: modelIds })}
				>
					{isSaving ? "Saving..." : "Save Settings"}
				</Button>
			</div>
		</div>
	);
}
