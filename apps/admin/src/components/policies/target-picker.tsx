"use client";

import { useApi } from "@/lib/fetch-client";

import { Label, SearchableSelect } from "@llmgateway/shared/components";

const ANY = "__any__";

/** Provider + model pickers backed by the catalogue options endpoint. */
export function TargetPicker({
	provider,
	model,
	onChange,
}: {
	provider: string | null;
	model: string | null;
	onChange: (next: { provider: string | null; model: string | null }) => void;
}) {
	const api = useApi();
	const options = api.useQuery("get", "/admin/rate-limits/options");
	const providers = options.data?.providers ?? [];
	const mappings = options.data?.mappings ?? [];
	const models = [
		...new Map(
			mappings
				.filter((m) => !provider || m.providerId === provider)
				.map((m) => [m.modelId, m.modelName]),
		).entries(),
	].sort((a, b) => a[0].localeCompare(b[0]));

	return (
		<div className="grid grid-cols-2 gap-3">
			<div className="space-y-1.5">
				<Label>Provider</Label>
				<SearchableSelect
					value={provider ?? ANY}
					onValueChange={(v) =>
						onChange({ provider: v === ANY ? null : v, model: null })
					}
					options={[
						{ value: ANY, label: "Any provider" },
						...providers.map((p) => ({
							value: p.id,
							label: p.name,
							keywords: p.id,
						})),
					]}
				/>
			</div>
			<div className="space-y-1.5">
				<Label>Model</Label>
				<SearchableSelect
					value={model ?? ANY}
					onValueChange={(v) =>
						onChange({ provider, model: v === ANY ? null : v })
					}
					options={[
						{ value: ANY, label: "Any model" },
						...models.map(([id, name]) => ({
							value: id,
							label: id,
							keywords: name,
						})),
					]}
				/>
			</div>
		</div>
	);
}

export function targetLabel(provider: string | null, model: string | null) {
	if (!provider && !model) {
		return "Everything";
	}
	return [provider ?? "any provider", model ?? "any model"].join(" / ");
}
