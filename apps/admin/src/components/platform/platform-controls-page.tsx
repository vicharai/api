"use client";

import { Loader2, Plus, Save, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect, Tone } from "@/components/ui/controls";
import { PageHeader, QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { cn } from "@/lib/utils";

import {
	Badge,
	Button,
	Input,
	Label,
	Switch,
	Textarea,
} from "@llmgateway/shared/components";

import type {
	AdminDigestSettings,
	PlatformControls,
	SignupMode,
} from "@/lib/api/pending-paths-p2";

const CONTROLS_PATH = "/admin/settings/platform-controls";
const DIGEST_PATH = "/admin/settings/admin-digest";

const SIGNUP_MODES: { value: SignupMode; title: string; body: string }[] = [
	{
		value: "open",
		title: "Open",
		body: "Anyone can create an account.",
	},
	{
		value: "invite_only",
		title: "Invite only",
		body: "Only people with a pending organization invite (and ADMIN_EMAILS) can sign up.",
	},
	{
		value: "closed",
		title: "Closed",
		body: "New signups are refused. Existing users can still sign in.",
	},
];

const IPV4_CIDR = /^(\d{1,3})(\.\d{1,3}){3}(\/(3[0-2]|[12]?\d))?$/;
const IPV6_CIDR = /^[0-9a-f:]+(\/(12[0-8]|1[01]\d|[1-9]?\d))?$/i;

export function isIpOrCidr(value: string): boolean {
	if (IPV4_CIDR.test(value)) {
		return value
			.split("/")[0]
			.split(".")
			.every((octet) => Number(octet) <= 255);
	}
	return value.includes(":") && IPV6_CIDR.test(value);
}

export function PlatformControlsPage() {
	const api = useApi();
	const controls = api.useQuery("get", CONTROLS_PATH);
	const digest = api.useQuery("get", DIGEST_PATH);

	return (
		<>
			<PageHeader
				title="Signup & maintenance"
				description="Who can join, which networks are refused, and whether the gateway is serving. Changes apply within the settings cache interval."
			/>
			<div className="grid gap-4 xl:grid-cols-2">
				<QueryState query={controls}>
					{(c) => (
						<>
							<SignupModeForm key={c.signupMode} initial={c.signupMode} />
							<MaintenanceForm
								key={JSON.stringify(c.maintenance)}
								initial={c.maintenance}
							/>
							<BlockedIpsForm
								key={c.blockedSignupIps.join(",")}
								initial={c.blockedSignupIps}
							/>
						</>
					)}
				</QueryState>
				<QueryState query={digest}>
					{(d) => <DigestForm key={JSON.stringify(d)} initial={d} />}
				</QueryState>
			</div>
		</>
	);
}

function useSaveControls(message: string) {
	const api = useApi();
	const invalidate = useInvalidate();
	return api.useMutation("put", CONTROLS_PATH, {
		onSuccess: () => {
			toast.success(message);
			void invalidate(CONTROLS_PATH);
		},
	});
}

function SaveButton({
	onClick,
	pending,
	disabled,
}: {
	onClick: () => void;
	pending: boolean;
	disabled: boolean;
}) {
	return (
		<Button size="sm" onClick={onClick} disabled={pending || disabled}>
			{pending ? <Loader2 className="animate-spin" /> : <Save />} Save
		</Button>
	);
}

function SignupModeForm({ initial }: { initial: SignupMode }) {
	const can = useCan();
	const [mode, setMode] = useState(initial);
	const save = useSaveControls("Signup mode saved");
	const editable = can("PUT", CONTROLS_PATH);

	return (
		<Section
			title="Signups"
			description="Applies to email, passkey and social signups."
			actions={
				<SaveButton
					pending={save.isPending}
					disabled={!editable || mode === initial}
					onClick={() => save.mutate({ body: { signupMode: mode } })}
				/>
			}
		>
			<div className="grid gap-2 sm:grid-cols-3">
				{SIGNUP_MODES.map((m) => (
					<button
						key={m.value}
						type="button"
						disabled={!editable}
						onClick={() => setMode(m.value)}
						className={cn(
							"rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed",
							mode === m.value && "border-primary ring-1 ring-primary",
						)}
					>
						<div className="font-medium">{m.title}</div>
						<div className="text-xs text-muted-foreground">{m.body}</div>
					</button>
				))}
			</div>
		</Section>
	);
}

function MaintenanceForm({
	initial,
}: {
	initial: PlatformControls["maintenance"];
}) {
	const can = useCan();
	const [enabled, setEnabled] = useState(initial.enabled);
	const [message, setMessage] = useState(initial.message ?? "");
	const save = useSaveControls("Maintenance mode saved");
	const editable = can("PUT", CONTROLS_PATH);
	const [confirming, setConfirming] = useState(false);
	const dirty =
		enabled !== initial.enabled || message !== (initial.message ?? "");
	const body = {
		maintenance: { enabled, message: message.trim() || null },
	};

	return (
		<Section
			title={
				<span className="flex items-center gap-2">
					Gateway maintenance
					{initial.enabled ? <Tone tone="bad">on</Tone> : null}
				</span>
			}
			description="While on, every gateway request gets a 503 with this message. The dashboard and API stay up."
			actions={
				<SaveButton
					pending={save.isPending}
					disabled={!editable || !dirty}
					onClick={() => {
						if (enabled && !initial.enabled) {
							setConfirming(true);
						} else {
							save.mutate({ body });
						}
					}}
				/>
			}
		>
			<div className="space-y-3">
				<label className="flex items-center gap-2 text-sm">
					<Switch
						checked={enabled}
						onCheckedChange={setEnabled}
						disabled={!editable}
					/>
					Maintenance mode
				</label>
				<div className="space-y-1.5">
					<Label htmlFor="maintenance-message">Message</Label>
					<Textarea
						id="maintenance-message"
						rows={2}
						value={message}
						disabled={!editable}
						placeholder="Defaults to a generic maintenance notice."
						onChange={(e) => setMessage(e.target.value)}
					/>
				</div>
			</div>
			<ConfirmAction
				title="Turn on maintenance"
				description="Every customer request to the gateway fails with 503 until you turn it off."
				confirmLabel="Turn on"
				destructive
				requireReason={false}
				open={confirming}
				onOpenChange={setConfirming}
				onConfirm={() => save.mutateAsync({ body })}
			/>
		</Section>
	);
}

function BlockedIpsForm({ initial }: { initial: string[] }) {
	const can = useCan();
	const [values, setValues] = useState(initial);
	const [draft, setDraft] = useState("");
	const save = useSaveControls("Blocked IPs saved");
	const editable = can("PUT", CONTROLS_PATH);
	const candidate = draft.trim();
	const valid = isIpOrCidr(candidate) && !values.includes(candidate);
	const dirty = values.join(",") !== initial.join(",");

	function add() {
		if (valid) {
			setValues([...values, candidate]);
			setDraft("");
		}
	}

	return (
		<Section
			title="Blocked signup networks"
			description="IPv4/IPv6 addresses or CIDR ranges. Signups from these networks are refused."
			actions={
				<SaveButton
					pending={save.isPending}
					disabled={!editable || !dirty}
					onClick={() => save.mutate({ body: { blockedSignupIps: values } })}
				/>
			}
		>
			<div className="space-y-3">
				<div className="flex min-h-9 flex-wrap gap-1.5">
					{values.length === 0 ? (
						<span className="text-sm text-muted-foreground">None</span>
					) : (
						values.map((value) => (
							<Badge
								key={value}
								variant="secondary"
								className="gap-1 pr-1 font-mono"
							>
								{value}
								<button
									type="button"
									aria-label={`Remove ${value}`}
									disabled={!editable}
									className="rounded-sm p-0.5 hover:bg-background/60"
									onClick={() => setValues(values.filter((v) => v !== value))}
								>
									<X className="size-3" />
								</button>
							</Badge>
						))
					)}
				</div>
				<div className="flex gap-2">
					<Input
						value={draft}
						disabled={!editable}
						placeholder="e.g. 203.0.113.0/24"
						className="font-mono"
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								add();
							}
						}}
						aria-invalid={candidate.length > 0 && !valid}
					/>
					<Button
						variant="outline"
						size="sm"
						className="h-9"
						disabled={!editable || !valid}
						onClick={add}
					>
						<Plus /> Add
					</Button>
				</div>
			</div>
		</Section>
	);
}

function DigestForm({ initial }: { initial: AdminDigestSettings }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [form, setForm] = useState(initial);
	const save = api.useMutation("put", DIGEST_PATH, {
		onSuccess: () => {
			toast.success("Digest settings saved");
			void invalidate(DIGEST_PATH);
		},
	});
	const editable = can("PUT", DIGEST_PATH);
	const dirty =
		form.enabled !== initial.enabled || form.hourUtc !== initial.hourUtc;

	return (
		<Section
			title="Daily admin digest"
			description="Emails ADMIN_EMAILS a summary of signups, revenue, top errors, flagged accounts and open support items."
			actions={
				<SaveButton
					pending={save.isPending}
					disabled={!editable || !dirty}
					onClick={() => save.mutate({ body: form })}
				/>
			}
		>
			<div className="flex flex-wrap items-center gap-4">
				<label className="flex items-center gap-2 text-sm">
					<Switch
						checked={form.enabled}
						disabled={!editable}
						onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
					/>
					Send daily
				</label>
				<div className="flex items-center gap-2 text-sm">
					<span className="text-muted-foreground">at</span>
					<SimpleSelect
						value={String(form.hourUtc)}
						onChange={(hour) =>
							setForm((f) => ({ ...f, hourUtc: Number(hour) }))
						}
						ariaLabel="Hour (UTC)"
						options={Array.from({ length: 24 }, (_, hour) => ({
							value: String(hour),
							label: `${String(hour).padStart(2, "0")}:00 UTC`,
						}))}
					/>
				</div>
			</div>
		</Section>
	);
}
