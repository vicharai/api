"use client";

import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ContentViolations } from "@/components/issues/content-violations";
import { useCan } from "@/components/shell/admin-session";
import { SimpleSelect } from "@/components/ui/controls";
import { PageHeader, QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import { Button, Input, Label, Switch } from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";

type Settings = ApiData<"/admin/settings/content-filter">;

export function SafetyPage() {
	const api = useApi();
	const settings = api.useQuery("get", "/admin/settings/content-filter");
	return (
		<>
			<PageHeader
				title="Safety"
				description="The platform content classifier and what it has caught."
			/>
			<div className="space-y-4">
				<QueryState query={settings}>
					{(s) => <ContentFilterForm key={JSON.stringify(s)} initial={s} />}
				</QueryState>
				<ContentViolations />
			</div>
		</>
	);
}

function ContentFilterForm({ initial }: { initial: Settings }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [form, setForm] = useState({
		enabled: initial.enabled,
		sampleRatePercent: String(initial.sampleRatePercent),
		enforce: initial.enforce,
		enforceEnterprise: initial.enforceEnterprise,
		classifier: initial.classifier,
		shadowClassifier: initial.shadowClassifier,
		providerIds: initial.providers.filter((p) => p.enabled).map((p) => p.id),
	});
	const save = api.useMutation("put", "/admin/settings/content-filter", {
		onSuccess: () => {
			toast.success("Content filter saved");
			void invalidate("/admin/settings/content-filter");
		},
	});
	const editable = can("PUT", "/admin/settings/content-filter");

	const toggles = [
		["enabled", "Classifier enabled", "Sample requests and classify them."],
		[
			"enforce",
			"Enforce",
			"Block violating requests instead of only logging them.",
		],
		[
			"enforceEnterprise",
			"Enforce for enterprise",
			"Also block for enterprise organizations.",
		],
	] as const;

	return (
		<Section
			title="Content filter"
			description="Applies to requests routed to the selected providers."
			actions={
				<Button
					size="sm"
					disabled={!editable || save.isPending}
					onClick={() =>
						save.mutate({
							body: {
								enabled: form.enabled,
								sampleRatePercent: Number(form.sampleRatePercent),
								enforce: form.enforce,
								enforceEnterprise: form.enforceEnterprise,
								classifier: form.classifier,
								shadowClassifier: form.shadowClassifier,
								providerIds: form.providerIds,
							},
						})
					}
				>
					{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
					Save
				</Button>
			}
		>
			<div className="grid gap-6 lg:grid-cols-2">
				<div className="space-y-4">
					{toggles.map(([key, label, hint]) => (
						<label key={key} className="flex items-start gap-3">
							<Switch
								disabled={!editable}
								checked={form[key]}
								onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
							/>
							<span>
								<span className="block text-sm font-medium">{label}</span>
								<span className="block text-xs text-muted-foreground">
									{hint}
								</span>
							</span>
						</label>
					))}
					<div className="grid grid-cols-3 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="cf-rate">Sample rate %</Label>
							<Input
								id="cf-rate"
								type="number"
								min={0}
								max={100}
								disabled={!editable}
								value={form.sampleRatePercent}
								onChange={(e) =>
									setForm((f) => ({ ...f, sampleRatePercent: e.target.value }))
								}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Classifier</Label>
							<SimpleSelect
								className="w-full"
								value={form.classifier}
								onChange={(classifier) =>
									setForm((f) => ({ ...f, classifier }))
								}
								options={[
									{ value: "openai", label: "OpenAI" },
									{ value: "jev", label: "Jev" },
								]}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Shadow</Label>
							<SimpleSelect
								className="w-full"
								value={form.shadowClassifier}
								onChange={(shadowClassifier) =>
									setForm((f) => ({ ...f, shadowClassifier }))
								}
								options={[
									{ value: "none", label: "None" },
									{ value: "openai", label: "OpenAI" },
									{ value: "jev", label: "Jev" },
								]}
							/>
						</div>
					</div>
				</div>
				<div className="space-y-2">
					<Label>Providers</Label>
					<div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-2">
						{initial.providers.map((p) => (
							<label key={p.id} className="flex items-center gap-2 text-sm">
								<Switch
									disabled={!editable}
									checked={form.providerIds.includes(p.id)}
									onCheckedChange={(v) =>
										setForm((f) => ({
											...f,
											providerIds: v
												? [...f.providerIds, p.id]
												: f.providerIds.filter((id) => id !== p.id),
										}))
									}
								/>
								{p.name}
							</label>
						))}
					</div>
				</div>
			</div>
		</Section>
	);
}
