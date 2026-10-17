"use client";

import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { SimpleSelect } from "@/components/ui/controls";
import { QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import { Button, Input, Label, Switch } from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";
import type { ReactNode } from "react";

type Settings =
	ApiData<"/admin/organizations/{orgId}/settings">["organization"];
type Detail = ApiData<"/admin/organizations/{orgId}">;
type Tier = "auto" | "0" | "1" | "2" | "3" | "4";

const TIER_OPTIONS: { value: Tier; label: string }[] = [
	{ value: "auto", label: "Automatic" },
	{ value: "0", label: "Tier 0" },
	{ value: "1", label: "Tier 1" },
	{ value: "2", label: "Tier 2" },
	{ value: "3", label: "Tier 3" },
	{ value: "4", label: "Tier 4" },
];

function Field({
	label,
	htmlFor,
	children,
	hint,
}: {
	label: string;
	htmlFor?: string;
	children: ReactNode;
	hint?: string;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={htmlFor}>{label}</Label>
			{children}
			{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
		</div>
	);
}

function day(value: string | null | undefined): string {
	return value ? value.slice(0, 10) : "";
}

function intOrNull(value: string): number | null {
	return value.trim() === "" ? null : Math.max(0, Math.trunc(Number(value)));
}

export function OrgManageTab({ orgId }: { orgId: string }) {
	const api = useApi();
	const settings = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/settings",
		{ params: { path: { orgId } } },
	);
	const detail = api.useQuery("get", "/admin/organizations/{orgId}", {
		params: { path: { orgId }, query: { window: "30d" } },
	});

	return (
		<QueryState query={settings} rows={8}>
			{(s) =>
				detail.data ? (
					<ManageForm
						key={s.organization.id + s.organization.plan}
						orgId={orgId}
						org={s.organization}
						detail={detail.data}
					/>
				) : null
			}
		</QueryState>
	);
}

function ManageForm({
	orgId,
	org,
	detail,
}: {
	orgId: string;
	org: Settings;
	detail: Detail;
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const canManage = can("PATCH", `/admin/organizations/${orgId}/manage`);

	const [form, setForm] = useState({
		name: org.name,
		plan: org.plan as "free" | "pro" | "enterprise",
		seats: org.seats?.toString() ?? "",
		apiKeyLimit: org.apiKeyLimit?.toString() ?? "",
		projectLimit: org.projectLimit?.toString() ?? "",
		trustTier: (detail.trustTier.overridden
			? String(detail.trustTier.tier)
			: "auto") as Tier,
		contentFilterTier: (org.contentFilterTierOverride === null
			? "auto"
			: String(org.contentFilterTierOverride)) as Tier,
		contentFilterLogOnly: org.contentFilterLogOnly,
		planStartedAt: day(org.planStartedAt),
		planExpiresAt: day(org.planExpiresAt),
		isTrialActive: org.isTrialActive,
		trialStartDate: day(org.trialStartDate),
		trialEndDate: day(org.trialEndDate),
	});
	const [referral, setReferral] = useState({
		enabled: detail.organization.referralBonusEnabled ?? false,
		percent: String(detail.organization.referralBonusPercent ?? 0),
	});

	const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
		setForm((f) => ({ ...f, [key]: value }));

	const manage = api.useMutation(
		"patch",
		"/admin/organizations/{orgId}/manage",
		{
			onSuccess: (res) => {
				toast.success(res.message);
				void invalidate("/admin/organizations");
			},
		},
	);
	const referralBonus = api.useMutation(
		"patch",
		"/admin/organizations/{orgId}/referral-bonus",
		{
			onSuccess: (res) => {
				toast.success(res.message);
				void invalidate("/admin/organizations");
			},
		},
	);

	function save() {
		manage.mutate({
			params: { path: { orgId } },
			body: {
				name: form.name.trim(),
				plan: form.plan,
				seats: intOrNull(form.seats),
				apiKeyLimit: intOrNull(form.apiKeyLimit),
				projectLimit: intOrNull(form.projectLimit),
				trustTierOverride:
					form.trustTier === "auto" ? null : Number(form.trustTier),
				contentFilterTierOverride:
					form.contentFilterTier === "auto"
						? null
						: Number(form.contentFilterTier),
				contentFilterLogOnly: form.contentFilterLogOnly,
				planStartedAt: form.planStartedAt || null,
				planExpiresAt: form.planExpiresAt || null,
				isTrialActive: form.isTrialActive,
				trialStartDate: form.trialStartDate || null,
				trialEndDate: form.trialEndDate || null,
			},
		});
	}

	return (
		<div className="grid gap-4 xl:grid-cols-3">
			<Section
				title="Plan and limits"
				className="xl:col-span-2"
				description="Empty limit fields fall back to the plan default."
				actions={
					<Button
						size="sm"
						onClick={save}
						disabled={!canManage || manage.isPending}
					>
						{manage.isPending ? <Loader2 className="animate-spin" /> : <Save />}
						Save
					</Button>
				}
			>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<Field label="Name" htmlFor="m-name">
						<Input
							id="m-name"
							value={form.name}
							onChange={(e) => set("name", e.target.value)}
						/>
					</Field>
					<Field label="Plan">
						<SimpleSelect
							className="w-full"
							value={form.plan}
							onChange={(v) => set("plan", v)}
							options={[
								{ value: "free", label: "Free" },
								{ value: "pro", label: "Pro" },
								{ value: "enterprise", label: "Enterprise" },
							]}
						/>
					</Field>
					<Field label="Seats" htmlFor="m-seats">
						<Input
							id="m-seats"
							type="number"
							min={0}
							placeholder="Plan default"
							value={form.seats}
							onChange={(e) => set("seats", e.target.value)}
						/>
					</Field>
					<Field label="API key limit" htmlFor="m-keys">
						<Input
							id="m-keys"
							type="number"
							min={0}
							placeholder="Plan default"
							value={form.apiKeyLimit}
							onChange={(e) => set("apiKeyLimit", e.target.value)}
						/>
					</Field>
					<Field label="Project limit" htmlFor="m-projects">
						<Input
							id="m-projects"
							type="number"
							min={0}
							placeholder="Plan default"
							value={form.projectLimit}
							onChange={(e) => set("projectLimit", e.target.value)}
						/>
					</Field>
					<Field
						label="Trust tier"
						hint="Pins rate limits and spend caps; automatic follows age and spend."
					>
						<SimpleSelect
							className="w-full"
							value={form.trustTier}
							onChange={(v) => set("trustTier", v)}
							options={TIER_OPTIONS}
						/>
					</Field>
					<Field
						label="Content filter tier"
						hint="Automatic follows the trust tier."
					>
						<SimpleSelect
							className="w-full"
							value={form.contentFilterTier}
							onChange={(v) => set("contentFilterTier", v)}
							options={TIER_OPTIONS}
						/>
					</Field>
					<Field label="Content filter log-only">
						<div className="flex h-9 items-center">
							<Switch
								checked={form.contentFilterLogOnly}
								onCheckedChange={(v) => set("contentFilterLogOnly", v)}
							/>
						</div>
					</Field>
					<div />
					<Field label="Plan started" htmlFor="m-ps">
						<Input
							id="m-ps"
							type="date"
							value={form.planStartedAt}
							onChange={(e) => set("planStartedAt", e.target.value)}
						/>
					</Field>
					<Field label="Plan expires" htmlFor="m-pe" hint="Empty = open-ended.">
						<Input
							id="m-pe"
							type="date"
							value={form.planExpiresAt}
							onChange={(e) => set("planExpiresAt", e.target.value)}
						/>
					</Field>
					<div />
					<Field label="Trial active">
						<div className="flex h-9 items-center">
							<Switch
								checked={form.isTrialActive}
								onCheckedChange={(v) => set("isTrialActive", v)}
							/>
						</div>
					</Field>
					<Field label="Trial start" htmlFor="m-ts">
						<Input
							id="m-ts"
							type="date"
							value={form.trialStartDate}
							onChange={(e) => set("trialStartDate", e.target.value)}
						/>
					</Field>
					<Field label="Trial end" htmlFor="m-te">
						<Input
							id="m-te"
							type="date"
							value={form.trialEndDate}
							onChange={(e) => set("trialEndDate", e.target.value)}
						/>
					</Field>
				</div>
			</Section>
			<Section
				title="Referral bonus"
				description="Extra credits granted to this org on referred top-ups."
				actions={
					<Button
						size="sm"
						variant="outline"
						disabled={
							referralBonus.isPending ||
							!can("PATCH", `/admin/organizations/${orgId}/referral-bonus`)
						}
						onClick={() =>
							referralBonus.mutate({
								params: { path: { orgId } },
								body: {
									enabled: referral.enabled,
									percent: Number(referral.percent) || 0,
								},
							})
						}
					>
						Save
					</Button>
				}
			>
				<div className="space-y-4">
					<label className="flex items-center gap-2 text-sm">
						<Switch
							checked={referral.enabled}
							onCheckedChange={(enabled) =>
								setReferral((r) => ({ ...r, enabled }))
							}
						/>
						Enabled
					</label>
					<Field label="Percent" htmlFor="ref-pct">
						<Input
							id="ref-pct"
							type="number"
							min={0}
							max={100}
							value={referral.percent}
							onChange={(e) =>
								setReferral((r) => ({ ...r, percent: e.target.value }))
							}
						/>
					</Field>
				</div>
			</Section>
		</div>
	);
}
