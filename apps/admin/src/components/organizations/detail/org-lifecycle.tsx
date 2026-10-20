"use client";

import {
	ArchiveRestore,
	Lock,
	PauseCircle,
	Rocket,
	Trash2,
	X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
	daysFromNow,
	futureIso,
	OrgLockdownDialog,
	SuspendedBadge,
	UnsuspendButton,
	UntilPicker,
} from "@/components/manage/account-controls";
import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect, Tone } from "@/components/ui/controls";
import { Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime, formatUsd } from "@/lib/utils";

import {
	Alert,
	AlertDescription,
	AlertTitle,
	Button,
	Checkbox,
	Input,
	Label,
} from "@llmgateway/shared/components";

export function useOrgControls(orgId: string) {
	const api = useApi();
	return api.useQuery("get", "/admin/organizations/{orgId}/controls", {
		params: { path: { orgId } },
	});
}

/** Header badges: suspension and active boost. */
export function OrgControlBadges({ orgId }: { orgId: string }) {
	const { data } = useOrgControls(orgId);
	if (!data) {
		return null;
	}
	return (
		<>
			<SuspendedBadge until={data.suspendedUntil} />
			{data.boost ? (
				<Tone tone="info">
					<Rocket /> Tier {data.boost.trustTier} boost
				</Tone>
			) : null}
		</>
	);
}

/** Suspension and boost banners under the org header. */
export function OrgControlBanners({ orgId }: { orgId: string }) {
	const { data } = useOrgControls(orgId);
	if (!data || (!data.suspendedUntil && !data.boost)) {
		return null;
	}
	return (
		<div className="mb-4 space-y-2">
			{data.suspendedUntil ? (
				<Alert variant="destructive">
					<PauseCircle className="size-4" />
					<AlertTitle>
						Suspended until {formatDateTime(data.suspendedUntil)}
					</AlertTitle>
					<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
						<span>
							The gateway rejects this organization&apos;s requests.{" "}
							{data.suspendReason ? `Reason: ${data.suspendReason}` : null}
						</span>
						<UnsuspendButton kind="organization" id={orgId} />
					</AlertDescription>
				</Alert>
			) : null}
			{data.boost ? (
				<Alert>
					<Rocket className="size-4" />
					<AlertTitle>
						Trust tier boosted to {data.boost.trustTier} until{" "}
						{formatDateTime(data.boost.until)}
					</AlertTitle>
					<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
						<span>
							Afterwards the organization returns to the automatic ladder.
						</span>
						<ClearBoostButton orgId={orgId} />
					</AlertDescription>
				</Alert>
			) : null}
		</div>
	);
}

function ClearBoostButton({ orgId }: { orgId: string }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const clear = api.useMutation(
		"delete",
		"/admin/organizations/{orgId}/boost",
		{
			onSuccess: () => {
				toast.success("Boost removed");
				void invalidate("/admin/organizations");
			},
		},
	);
	return (
		<ConfirmAction
			title="Remove boost"
			description="The organization goes back to the automatic trust tier immediately."
			confirmLabel="Remove"
			requireReason={false}
			onConfirm={() => clear.mutateAsync({ params: { path: { orgId } } })}
		>
			<Button
				size="sm"
				variant="outline"
				disabled={!can("DELETE", `/admin/organizations/${orgId}/boost`)}
			>
				<X /> Remove boost
			</Button>
		</ConfirmAction>
	);
}

const TIERS = ["0", "1", "2", "3", "4"] as const;

export function BoostDialog({
	orgId,
	open,
	onOpenChange,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [tier, setTier] = useState<(typeof TIERS)[number]>("3");
	const [until, setUntil] = useState(() => daysFromNow(7));
	const iso = futureIso(until);
	const boost = api.useMutation("post", "/admin/organizations/{orgId}/boost", {
		onSuccess: (res) => {
			toast.success(
				`Tier ${res.trustTierOverride} until ${formatDateTime(res.trustTierOverrideUntil)}`,
			);
			void invalidate("/admin/organizations");
		},
	});
	return (
		<ConfirmAction
			title="Temporary trust-tier boost"
			description="Pins the trust tier (rate limits, spend caps, top-up allowance) until the chosen time. Replaces any existing pin; afterwards the organization follows the automatic ladder."
			confirmLabel="Boost"
			confirmDisabled={!iso}
			open={open}
			onOpenChange={onOpenChange}
			extra={
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label>Trust tier</Label>
						<SimpleSelect
							className="w-full"
							ariaLabel="Trust tier"
							value={tier}
							onChange={setTier}
							options={TIERS.map((t) => ({ value: t, label: `Tier ${t}` }))}
						/>
					</div>
					<UntilPicker id="boost-until" value={until} onChange={setUntil} />
				</div>
			}
			onConfirm={(reason) =>
				iso
					? boost.mutateAsync({
							params: { path: { orgId } },
							body: { trustTier: Number(tier), until: iso, reason },
						})
					: Promise.resolve()
			}
		/>
	);
}

function DeleteOrgDialog({
	orgId,
	name,
	credits,
	children,
}: {
	orgId: string;
	name: string;
	credits: string;
	children: ReactNode;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [typed, setTyped] = useState("");
	const [forfeit, setForfeit] = useState(false);
	const hasBalance = Number(credits) > 0;
	const remove = api.useMutation("delete", "/admin/organizations/{orgId}", {
		onSuccess: (res) => {
			toast.success(
				`Organization deleted, ${res.revokedApiKeys} key(s) revoked${res.forfeitedCredits ? `, ${formatUsd(res.forfeitedCredits)} forfeited` : ""}`,
			);
			setTyped("");
			setForfeit(false);
			void invalidate("/admin/organizations", "/admin/users");
		},
	});
	return (
		<ConfirmAction
			title="Delete organization"
			description="Cancels subscriptions and auto top-up, revokes every API key and marks the organization deleted. Members keep their accounts."
			confirmLabel="Delete organization"
			destructive
			confirmDisabled={typed.trim() !== name || (hasBalance && !forfeit)}
			extra={
				<div className="space-y-3">
					{hasBalance ? (
						<label className="flex items-start gap-2 text-sm">
							<Checkbox
								className="mt-0.5"
								checked={forfeit}
								onCheckedChange={(v) => setForfeit(v === true)}
							/>
							<span>
								Forfeit the remaining balance of{" "}
								<strong>{formatUsd(credits)}</strong> (recorded as a balance
								adjustment)
							</span>
						</label>
					) : null}
					<div className="space-y-1.5">
						<Label htmlFor="confirm-org-name">
							Type <span className="font-mono">{name}</span> to confirm
						</Label>
						<Input
							id="confirm-org-name"
							autoComplete="off"
							value={typed}
							onChange={(e) => setTyped(e.target.value)}
						/>
					</div>
				</div>
			}
			onConfirm={(reason) =>
				remove.mutateAsync({
					params: { path: { orgId } },
					body: { reason, forfeitBalance: hasBalance ? forfeit : undefined },
				})
			}
		>
			{children}
		</ConfirmAction>
	);
}

function RestoreOrgButton({ orgId }: { orgId: string }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const restore = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/restore",
		{
			onSuccess: () => {
				toast.success("Organization restored");
				void invalidate("/admin/organizations", "/admin/users");
			},
		},
	);
	return (
		<ConfirmAction
			title="Restore organization"
			description="Sets the organization active again. Revoked API keys, cancelled subscriptions and forfeited credits are NOT restored; members must create new keys."
			confirmLabel="Restore"
			onConfirm={(reason) =>
				restore.mutateAsync({ params: { path: { orgId } }, body: { reason } })
			}
		>
			<Button
				size="sm"
				variant="outline"
				disabled={!can("POST", `/admin/organizations/${orgId}/restore`)}
			>
				<ArchiveRestore /> Restore
			</Button>
		</ConfirmAction>
	);
}

function DangerRow({
	title,
	description,
	action,
}: {
	title: string;
	description: string;
	action: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
			<div className="space-y-0.5">
				<p className="text-sm font-medium">{title}</p>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			{action}
		</div>
	);
}

export function OrgDangerZone({
	orgId,
	name,
}: {
	orgId: string;
	name: string;
}) {
	const can = useCan();
	const { data } = useOrgControls(orgId);
	if (!data) {
		return null;
	}
	const deleted = data.status === "deleted";
	const base = `/admin/organizations/${orgId}`;
	return (
		<Section
			title="Danger zone"
			className="border-destructive/40"
			contentClassName="divide-y"
		>
			{deleted ? null : (
				<DangerRow
					title="Lock down"
					description={`Deactivate all ${data.activeApiKeys} active API key(s) and sign out every member. Optionally suspend.`}
					action={
						<OrgLockdownDialog orgId={orgId}>
							<Button
								size="sm"
								variant="destructive"
								disabled={!can("POST", `${base}/lockdown`)}
							>
								<Lock /> Lockdown
							</Button>
						</OrgLockdownDialog>
					}
				/>
			)}
			{deleted ? (
				<DangerRow
					title="Restore organization"
					description="Reactivates a deleted organization. Keys and subscriptions stay revoked."
					action={<RestoreOrgButton orgId={orgId} />}
				/>
			) : (
				<DangerRow
					title="Delete organization"
					description={
						Number(data.credits) > 0
							? `Soft delete. The ${formatUsd(data.credits)} balance must be forfeited explicitly.`
							: "Soft delete: subscriptions cancelled, API keys revoked. Members keep their accounts."
					}
					action={
						<DeleteOrgDialog orgId={orgId} name={name} credits={data.credits}>
							<Button
								size="sm"
								variant="destructive"
								disabled={!can("DELETE", base)}
							>
								<Trash2 /> Delete
							</Button>
						</DeleteOrgDialog>
					}
				/>
			)}
		</Section>
	);
}
