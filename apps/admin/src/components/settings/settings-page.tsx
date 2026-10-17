"use client";

import { Loader2, Plus, Save, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { SimpleSelect, StatusBadge, Tone } from "@/components/ui/controls";
import {
	KeyValue,
	PageHeader,
	QueryState,
	Section,
} from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDate } from "@/lib/utils";

import {
	Badge,
	Button,
	Input,
	Label,
	Switch,
	Textarea,
} from "@llmgateway/shared/components";

import type { ErrorRateAlertSettings } from "@/lib/api/admin-types";
import type { ApiData } from "@/lib/api/types";

type Banner = ApiData<"/admin/settings/banner">;

export function SettingsPage() {
	const api = useApi();
	const banner = api.useQuery("get", "/admin/settings/banner");
	const countries = api.useQuery(
		"get",
		"/admin/settings/blocked-signup-countries",
	);
	const domains = api.useQuery(
		"get",
		"/admin/settings/blocked-signup-email-domains",
	);
	const alerts = api.useQuery("get", "/admin/settings/model-error-rate-alerts");

	return (
		<>
			<PageHeader
				title="Settings"
				description="Platform-wide switches. Every change is recorded in the audit log."
			/>
			<div className="grid gap-4 xl:grid-cols-2">
				<QueryState query={banner}>
					{(b) => <BannerForm key={JSON.stringify(b)} initial={b} />}
				</QueryState>
				<QueryState query={alerts}>
					{(a) => <AlertsForm key={JSON.stringify(a)} initial={a} />}
				</QueryState>
				<QueryState query={countries}>
					{(c) => (
						<ListSetting
							key={c.countries.join(",")}
							title="Blocked signup countries"
							description="ISO 3166-1 alpha-2 codes. Signups from these countries are refused."
							placeholder="e.g. KP"
							normalize={(v) => v.trim().toUpperCase()}
							validate={(v) => /^[A-Z]{2}$/.test(v)}
							initial={c.countries}
							path="/admin/settings/blocked-signup-countries"
							field="countries"
						/>
					)}
				</QueryState>
				<QueryState query={domains}>
					{(d) => (
						<ListSetting
							key={d.domains.join(",")}
							title="Blocked email domains"
							description="Signups and email changes to these domains are refused."
							placeholder="e.g. mailinator.com"
							normalize={(v) => v.trim().toLowerCase().replace(/^@/, "")}
							validate={(v) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)}
							initial={d.domains}
							path="/admin/settings/blocked-signup-email-domains"
							field="domains"
						/>
					)}
				</QueryState>
				<License />
			</div>
		</>
	);
}

function BannerForm({ initial }: { initial: Banner }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [form, setForm] = useState(initial);
	const save = api.useMutation("put", "/admin/settings/banner", {
		onSuccess: () => {
			toast.success("Banner saved");
			void invalidate("/admin/settings/banner");
		},
	});
	const editable = can("PUT", "/admin/settings/banner");

	return (
		<Section
			title="System banner"
			description="Shown at the top of the customer dashboard."
			actions={
				<Button
					size="sm"
					disabled={
						!editable ||
						save.isPending ||
						(form.enabled && !form.message.trim())
					}
					onClick={() =>
						save.mutate({
							body: {
								...form,
								linkUrl: form.linkUrl?.trim() || null,
								linkLabel: form.linkLabel?.trim() || null,
							},
						})
					}
				>
					{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
					Save
				</Button>
			}
		>
			<div className="space-y-3">
				<label className="flex items-center gap-2 text-sm">
					<Switch
						disabled={!editable}
						checked={form.enabled}
						onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
					/>
					Show banner
				</label>
				<div className="space-y-1.5">
					<Label htmlFor="banner-msg">Message</Label>
					<Textarea
						id="banner-msg"
						rows={2}
						disabled={!editable}
						value={form.message}
						onChange={(e) =>
							setForm((f) => ({ ...f, message: e.target.value }))
						}
					/>
				</div>
				<div className="grid grid-cols-3 gap-3">
					<div className="space-y-1.5">
						<Label>Severity</Label>
						<SimpleSelect
							className="w-full"
							value={form.severity}
							onChange={(severity) => setForm((f) => ({ ...f, severity }))}
							options={[
								{ value: "info", label: "Info" },
								{ value: "warning", label: "Warning" },
								{ value: "critical", label: "Critical" },
							]}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="banner-url">Link URL</Label>
						<Input
							id="banner-url"
							disabled={!editable}
							value={form.linkUrl ?? ""}
							onChange={(e) =>
								setForm((f) => ({ ...f, linkUrl: e.target.value }))
							}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="banner-label">Link label</Label>
						<Input
							id="banner-label"
							disabled={!editable}
							value={form.linkLabel ?? ""}
							onChange={(e) =>
								setForm((f) => ({ ...f, linkLabel: e.target.value }))
							}
						/>
					</div>
				</div>
				{form.message ? (
					<div className="rounded-md border p-2 text-sm">
						<Tone
							tone={
								form.severity === "critical"
									? "bad"
									: form.severity === "warning"
										? "warn"
										: "info"
							}
						>
							preview
						</Tone>{" "}
						{form.message}{" "}
						{form.linkUrl ? (
							<span className="underline">
								{form.linkLabel || "Learn more"}
							</span>
						) : null}
					</div>
				) : null}
			</div>
		</Section>
	);
}

function ListSetting({
	title,
	description,
	placeholder,
	normalize,
	validate,
	initial,
	path,
	field,
}: {
	title: string;
	description: string;
	placeholder: string;
	normalize: (value: string) => string;
	validate: (value: string) => boolean;
	initial: string[];
	path:
		| "/admin/settings/blocked-signup-countries"
		| "/admin/settings/blocked-signup-email-domains";
	field: "countries" | "domains";
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [values, setValues] = useState(initial);
	const [draft, setDraft] = useState("");
	const onSuccess = () => {
		toast.success(`${title} saved`);
		void invalidate(path);
	};
	const saveCountries = api.useMutation(
		"put",
		"/admin/settings/blocked-signup-countries",
		{ onSuccess },
	);
	const saveDomains = api.useMutation(
		"put",
		"/admin/settings/blocked-signup-email-domains",
		{ onSuccess },
	);
	const pending = saveCountries.isPending || saveDomains.isPending;
	const editable = can("PUT", path);
	const next = normalize(draft);
	const dirty = values.join(",") !== initial.join(",");

	function add() {
		if (validate(next) && !values.includes(next)) {
			setValues([...values, next].sort());
			setDraft("");
		}
	}

	return (
		<Section
			title={title}
			description={description}
			actions={
				<Button
					size="sm"
					disabled={!editable || pending || !dirty}
					onClick={() =>
						field === "countries"
							? saveCountries.mutate({ body: { countries: values } })
							: saveDomains.mutate({ body: { domains: values } })
					}
				>
					{pending ? <Loader2 className="animate-spin" /> : <Save />}
					Save
				</Button>
			}
		>
			<div className="space-y-3">
				<form
					className="flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						add();
					}}
				>
					<Input
						value={draft}
						disabled={!editable}
						placeholder={placeholder}
						onChange={(e) => setDraft(e.target.value)}
					/>
					<Button
						type="submit"
						variant="outline"
						disabled={!editable || !validate(next)}
					>
						<Plus /> Add
					</Button>
				</form>
				<div className="flex flex-wrap gap-1.5">
					{values.length === 0 ? (
						<span className="text-sm text-muted-foreground">None.</span>
					) : (
						values.map((v) => (
							<Badge key={v} variant="secondary" className="gap-1 pr-1">
								{v}
								<button
									type="button"
									aria-label={`Remove ${v}`}
									disabled={!editable}
									className="rounded-sm p-0.5 hover:bg-background/60"
									onClick={() => setValues(values.filter((x) => x !== v))}
								>
									<X className="size-3" />
								</button>
							</Badge>
						))
					)}
				</div>
			</div>
		</Section>
	);
}

function AlertsForm({ initial }: { initial: ErrorRateAlertSettings }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [form, setForm] = useState({
		enabled: initial.enabled,
		thresholdPercent: String(initial.thresholdPercent),
		minRequests: String(initial.minRequests),
		windowMinutes: String(initial.windowMinutes),
		cooldownMinutes: String(initial.cooldownMinutes),
		webhookUrl: "",
		clearWebhook: false,
	});
	const save = api.useMutation(
		"put",
		"/admin/settings/model-error-rate-alerts",
		{
			onSuccess: () => {
				toast.success("Alert rules saved");
				void invalidate("/admin/settings/model-error-rate-alerts");
			},
		},
	);
	const editable = can("PUT", "/admin/settings/model-error-rate-alerts");
	const webhookValid =
		form.webhookUrl === "" || /^https:\/\/\S+$/.test(form.webhookUrl);

	const numbers = [
		["thresholdPercent", "Error rate ≥ %", 1, 100],
		["minRequests", "Min requests", 1, 1_000_000],
		["windowMinutes", "Window (min)", 5, 1440],
		["cooldownMinutes", "Cooldown (min)", 5, 10080],
	] as const;
	const numbersValid = numbers.every(([key, , min, max]) => {
		const n = Number(form[key]);
		return Number.isFinite(n) && n >= min && n <= max;
	});

	return (
		<Section
			title="Model error-rate alerts"
			description="Posts to Discord when a provider mapping's error rate crosses the threshold."
			actions={
				<Button
					size="sm"
					disabled={
						!editable || save.isPending || !webhookValid || !numbersValid
					}
					onClick={() =>
						save.mutate({
							body: {
								enabled: form.enabled,
								thresholdPercent: Number(form.thresholdPercent),
								minRequests: Number(form.minRequests),
								windowMinutes: Number(form.windowMinutes),
								cooldownMinutes: Number(form.cooldownMinutes),
								...(form.clearWebhook
									? { webhookUrl: null }
									: form.webhookUrl
										? { webhookUrl: form.webhookUrl }
										: {}),
							},
						})
					}
				>
					{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
					Save
				</Button>
			}
		>
			<div className="space-y-3">
				<label className="flex items-center gap-2 text-sm">
					<Switch
						disabled={!editable}
						checked={form.enabled}
						onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
					/>
					Alerts enabled
				</label>
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
					{numbers.map(([key, label, min, max]) => (
						<div key={key} className="space-y-1.5">
							<Label htmlFor={`al-${key}`}>{label}</Label>
							<Input
								id={`al-${key}`}
								type="number"
								min={min}
								max={max}
								disabled={!editable}
								value={form[key]}
								onChange={(e) =>
									setForm((f) => ({ ...f, [key]: e.target.value }))
								}
							/>
						</div>
					))}
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="al-hook">
						Discord webhook{" "}
						{initial.webhookConfigured ? (
							<Tone tone="good">configured</Tone>
						) : (
							<Tone tone="warn">not set</Tone>
						)}
					</Label>
					<Input
						id="al-hook"
						type="url"
						disabled={!editable || form.clearWebhook}
						placeholder={
							initial.webhookConfigured
								? "Leave empty to keep the current webhook"
								: "https://discord.com/api/webhooks/…"
						}
						value={form.webhookUrl}
						onChange={(e) =>
							setForm((f) => ({ ...f, webhookUrl: e.target.value }))
						}
					/>
					{!webhookValid ? (
						<p className="text-xs text-destructive">Must be an https URL.</p>
					) : null}
					{initial.webhookConfigured ? (
						<label className="flex items-center gap-2 text-xs text-muted-foreground">
							<Switch
								disabled={!editable}
								checked={form.clearWebhook}
								onCheckedChange={(clearWebhook) =>
									setForm((f) => ({ ...f, clearWebhook, webhookUrl: "" }))
								}
							/>
							Remove the webhook
						</label>
					) : null}
				</div>
			</div>
		</Section>
	);
}

function License() {
	const api = useApi();
	const license = api.useQuery("get", "/admin/license");
	return (
		<Section title="License">
			<QueryState query={license}>
				{(l) => (
					<KeyValue
						items={[
							{ label: "Status", value: <StatusBadge status={l.status} /> },
							{ label: "Kind", value: l.kind ?? "—" },
							{
								label: "Enterprise",
								value: l.enterpriseEnabled ? "yes" : "no",
							},
							{
								label: "White label",
								value: l.whiteLabelEnabled ? "yes" : "no",
							},
							{ label: "Expires", value: formatDate(l.expiresAt) },
							{
								label: "Seats",
								value:
									l.maxSeats === null
										? `${l.seatsUsed} used`
										: `${l.seatsUsed} / ${l.maxSeats}`,
							},
						]}
					/>
				)}
			</QueryState>
		</Section>
	);
}
