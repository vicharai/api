"use client";

import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ChipPicker } from "@/components/ui/chip-picker";
import { QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { cn } from "@/lib/utils";

import { Button, Label, Textarea } from "@llmgateway/shared/components";

import type { ProviderAccess } from "@/lib/api/admin-types";

const MODES: {
	value: ProviderAccess["mode"];
	title: string;
	body: string;
}[] = [
	{
		value: "none",
		title: "No restriction",
		body: "Routing uses every provider the org would normally get.",
	},
	{
		value: "allow",
		title: "Allow list",
		body: "Only the listed providers, models and mappings can serve requests.",
	},
	{
		value: "deny",
		title: "Deny list",
		body: "The listed providers, models and mappings are never used.",
	},
];

export function OrgProviderAccessTab({ orgId }: { orgId: string }) {
	const api = useApi();
	const access = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/provider-access",
		{ params: { path: { orgId } } },
	);
	return (
		<QueryState query={access}>
			{(data) => (
				<ProviderAccessForm
					key={JSON.stringify(data)}
					orgId={orgId}
					initial={data}
				/>
			)}
		</QueryState>
	);
}

function ProviderAccessForm({
	orgId,
	initial,
}: {
	orgId: string;
	initial: ProviderAccess;
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [form, setForm] = useState<ProviderAccess>(initial);
	const options = api.useQuery("get", "/admin/rate-limits/options");
	const save = api.useMutation(
		"put",
		"/admin/organizations/{orgId}/provider-access",
		{
			onSuccess: () => {
				toast.success("Provider access saved");
				void invalidate("/admin/organizations");
			},
		},
	);

	const providers = (options.data?.providers ?? []).map((p) => ({
		value: p.id,
		label: p.name,
		keywords: p.id,
	}));
	const models = [
		...new Set((options.data?.mappings ?? []).map((m) => m.modelId)),
	]
		.sort()
		.map((id) => ({ value: id, label: id }));
	const mappings = (options.data?.mappings ?? []).map((m) => ({
		value: `${m.providerId}/${m.modelId}`,
		label: `${m.providerId}/${m.modelId}`,
		keywords: `${m.providerName} ${m.modelName}`,
	}));

	const editable = can("PUT", `/admin/organizations/${orgId}/provider-access`);
	const restricted = form.mode !== "none";
	const empty =
		restricted &&
		form.providers.length + form.models.length + form.mappings.length === 0;

	return (
		<Section
			title="Provider access"
			description="An operator-set routing restriction. A request pinned to a denied provider gets a 403; otherwise denied candidates are skipped."
			actions={
				<Button
					size="sm"
					disabled={!editable || save.isPending || empty}
					onClick={() =>
						save.mutate({
							params: { path: { orgId } },
							body: {
								...form,
								reason: form.reason?.trim() ? form.reason.trim() : null,
							},
						})
					}
				>
					{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
					Save
				</Button>
			}
		>
			<div className="space-y-5">
				<div className="grid gap-2 md:grid-cols-3">
					{MODES.map((mode) => (
						<button
							key={mode.value}
							type="button"
							disabled={!editable}
							onClick={() => setForm((f) => ({ ...f, mode: mode.value }))}
							className={cn(
								"rounded-lg border p-3 text-left transition-colors hover:bg-accent",
								form.mode === mode.value && "border-brand bg-brand-soft",
							)}
						>
							<div className="text-sm font-medium">{mode.title}</div>
							<div className="text-xs text-muted-foreground">{mode.body}</div>
						</button>
					))}
				</div>
				{restricted ? (
					<div className="grid gap-4 lg:grid-cols-3">
						<div className="space-y-1.5">
							<Label>Providers</Label>
							<ChipPicker
								values={form.providers}
								onChange={(providers) => setForm((f) => ({ ...f, providers }))}
								options={providers}
								placeholder="Add provider…"
								disabled={!editable}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Models (any provider)</Label>
							<ChipPicker
								values={form.models}
								onChange={(models) => setForm((f) => ({ ...f, models }))}
								options={models}
								placeholder="Add model…"
								disabled={!editable}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Mappings (provider/model)</Label>
							<ChipPicker
								values={form.mappings}
								onChange={(mappings) => setForm((f) => ({ ...f, mappings }))}
								options={mappings}
								placeholder="Add mapping…"
								disabled={!editable}
							/>
						</div>
					</div>
				) : null}
				{empty ? (
					<p className="text-sm text-warning">
						Pick at least one provider, model or mapping, or switch to “No
						restriction”.
					</p>
				) : null}
				<div className="space-y-1.5">
					<Label htmlFor="pa-reason">Reason (shown to operators)</Label>
					<Textarea
						id="pa-reason"
						rows={2}
						disabled={!editable}
						value={form.reason ?? ""}
						onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
						placeholder="e.g. Contract requires EU-only providers"
					/>
				</div>
			</div>
		</Section>
	);
}
