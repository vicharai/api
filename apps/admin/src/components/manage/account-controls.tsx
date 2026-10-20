"use client";

import { MailPlus, PlayCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tone } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import { Button, Checkbox, Input, Label } from "@llmgateway/shared/components";

const DAY_MS = 86_400_000;
const PRESETS = [
	{ label: "1 day", days: 1 },
	{ label: "7 days", days: 7 },
	{ label: "30 days", days: 30 },
] as const;

/** `YYYY-MM-DDTHH:mm` in local time, the value a datetime-local input takes. */
function toLocalInput(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function daysFromNow(days: number): string {
	const offset = days * DAY_MS;
	return toLocalInput(new Date(Date.now() + offset));
}

/** ISO timestamp for a future local time, or null when empty or past. */
export function futureIso(local: string): string | null {
	const date = new Date(local);
	return Number.isNaN(date.getTime()) || date.getTime() <= Date.now()
		? null
		: date.toISOString();
}

export function UntilPicker({
	id,
	label = "Until",
	value,
	onChange,
}: {
	id: string;
	label?: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<div className="flex flex-wrap items-center gap-2">
				<Input
					id={id}
					type="datetime-local"
					className="w-auto"
					min={toLocalInput(new Date())}
					value={value}
					onChange={(e) => onChange(e.target.value)}
				/>
				{PRESETS.map((p) => (
					<Button
						key={p.days}
						type="button"
						size="sm"
						variant="outline"
						onClick={() => onChange(daysFromNow(p.days))}
					>
						{p.label}
					</Button>
				))}
			</div>
			{value && !futureIso(value) ? (
				<p className="text-xs text-destructive">Pick a time in the future.</p>
			) : null}
		</div>
	);
}

/** "Suspended until …" badge, or nothing when not suspended. */
export function SuspendedBadge({ until }: { until: string | null }) {
	return until ? (
		<Tone tone="warn">Suspended until {formatDateTime(until)}</Tone>
	) : null;
}

interface DialogControl {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: ReactNode;
}

function SuspendDialog({
	subject,
	effect,
	onSubmit,
	open,
	onOpenChange,
	children,
}: {
	subject: string;
	effect: string;
	onSubmit: (until: string, reason: string) => Promise<unknown>;
} & DialogControl) {
	const [until, setUntil] = useState(() => daysFromNow(7));
	const iso = futureIso(until);
	return (
		<ConfirmAction
			title={`Suspend ${subject}`}
			description={`${effect} Lifts automatically at the chosen time.`}
			confirmLabel="Suspend"
			destructive
			confirmDisabled={!iso}
			open={open}
			onOpenChange={onOpenChange}
			extra={
				<UntilPicker id="suspend-until" value={until} onChange={setUntil} />
			}
			onConfirm={(reason) => (iso ? onSubmit(iso, reason) : Promise.resolve())}
		>
			{children}
		</ConfirmAction>
	);
}

export function SuspendUserDialog({
	userId,
	...control
}: { userId: string } & DialogControl) {
	const api = useApi();
	const invalidate = useInvalidate();
	const suspend = api.useMutation("post", "/admin/users/{userId}/suspend", {
		onSuccess: (res) => {
			toast.success(`Suspended until ${formatDateTime(res.suspendedUntil)}`);
			void invalidate("/admin/users");
		},
	});
	return (
		<SuspendDialog
			subject="user"
			effect="The user cannot sign in or use the dashboard API until then. API keys keep working; use Lockdown to stop them."
			onSubmit={(until, reason) =>
				suspend.mutateAsync({
					params: { path: { userId } },
					body: { until, reason },
				})
			}
			{...control}
		/>
	);
}

export function SuspendOrgDialog({
	orgId,
	...control
}: { orgId: string } & DialogControl) {
	const api = useApi();
	const invalidate = useInvalidate();
	const suspend = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/suspend",
		{
			onSuccess: (res) => {
				toast.success(`Suspended until ${formatDateTime(res.suspendedUntil)}`);
				void invalidate("/admin/organizations");
			},
		},
	);
	return (
		<SuspendDialog
			subject="organization"
			effect="The gateway rejects every request of this organization (403) until then. Members can still sign in."
			onSubmit={(until, reason) =>
				suspend.mutateAsync({
					params: { path: { orgId } },
					body: { until, reason },
				})
			}
			{...control}
		/>
	);
}

export function UnsuspendButton({
	kind,
	id,
}: {
	kind: "user" | "organization";
	id: string;
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const done = {
		onSuccess: () => {
			toast.success("Suspension lifted");
			void invalidate("/admin/users", "/admin/organizations");
		},
	};
	const user = api.useMutation("post", "/admin/users/{userId}/unsuspend", done);
	const org = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/unsuspend",
		done,
	);
	const path =
		kind === "user"
			? `/admin/users/${id}/unsuspend`
			: `/admin/organizations/${id}/unsuspend`;
	return (
		<ConfirmAction
			title="Lift suspension"
			description="Access is restored immediately."
			confirmLabel="Unsuspend"
			requireReason={false}
			onConfirm={() =>
				kind === "user"
					? user.mutateAsync({ params: { path: { userId: id } } })
					: org.mutateAsync({ params: { path: { orgId: id } } })
			}
		>
			<Button size="sm" variant="outline" disabled={!can("POST", path)}>
				<PlayCircle /> Unsuspend
			</Button>
		</ConfirmAction>
	);
}

function LockdownDialog({
	title,
	description,
	onSubmit,
	open,
	onOpenChange,
	children,
}: {
	title: string;
	description: string;
	onSubmit: (reason: string, suspendUntil?: string) => Promise<unknown>;
} & DialogControl) {
	const [alsoSuspend, setAlsoSuspend] = useState(false);
	const [until, setUntil] = useState(() => daysFromNow(7));
	const iso = futureIso(until);
	return (
		<ConfirmAction
			title={title}
			description={description}
			confirmLabel="Lock down"
			destructive
			confirmDisabled={alsoSuspend && !iso}
			open={open}
			onOpenChange={onOpenChange}
			extra={
				<div className="space-y-3">
					<label className="flex items-center gap-2 text-sm">
						<Checkbox
							checked={alsoSuspend}
							onCheckedChange={(v) => setAlsoSuspend(v === true)}
						/>
						Also suspend
					</label>
					{alsoSuspend ? (
						<UntilPicker
							id="lockdown-until"
							value={until}
							onChange={setUntil}
						/>
					) : null}
				</div>
			}
			onConfirm={(reason) =>
				onSubmit(reason, alsoSuspend && iso ? iso : undefined)
			}
		>
			{children}
		</ConfirmAction>
	);
}

export function UserLockdownDialog({
	userId,
	...control
}: { userId: string } & DialogControl) {
	const api = useApi();
	const invalidate = useInvalidate();
	const lockdown = api.useMutation("post", "/admin/users/{userId}/lockdown", {
		onSuccess: (res) => {
			toast.success(
				`Locked down: ${res.sessionsRevoked} session(s) revoked, ${res.apiKeysDeactivated} key(s) deactivated`,
			);
			void invalidate("/admin/users", "/admin/organizations");
		},
	});
	return (
		<LockdownDialog
			title="Lock down user"
			description="Signs the user out everywhere and deactivates every API key they created, in all organizations. Keys can be reactivated one by one afterwards."
			onSubmit={(reason, suspendUntil) =>
				lockdown.mutateAsync({
					params: { path: { userId } },
					body: { reason, suspendUntil },
				})
			}
			{...control}
		/>
	);
}

export function OrgLockdownDialog({
	orgId,
	...control
}: { orgId: string } & DialogControl) {
	const api = useApi();
	const invalidate = useInvalidate();
	const lockdown = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/lockdown",
		{
			onSuccess: (res) => {
				toast.success(
					`Locked down: ${res.apiKeysDeactivated} key(s) deactivated, ${res.membersSignedOut} member(s) signed out`,
				);
				void invalidate("/admin/organizations", "/admin/users");
			},
		},
	);
	return (
		<LockdownDialog
			title="Lock down organization"
			description="Deactivates every API key of the organization and signs out all members (staff excepted). Keys can be reactivated one by one afterwards."
			onSubmit={(reason, suspendUntil) =>
				lockdown.mutateAsync({
					params: { path: { orgId } },
					body: { reason, suspendUntil },
				})
			}
			{...control}
		/>
	);
}

export function ResendVerificationButton({
	userId,
	email,
}: {
	userId: string;
	email: string;
}) {
	const api = useApi();
	const can = useCan();
	const resend = api.useMutation(
		"post",
		"/admin/users/{userId}/resend-verification",
		{ onSuccess: () => toast.success(`Verification email sent to ${email}`) },
	);
	return (
		<ConfirmAction
			title="Resend verification email"
			description={`Sends ${email} a fresh sign-up verification link.`}
			confirmLabel="Send"
			requireReason={false}
			onConfirm={() => resend.mutateAsync({ params: { path: { userId } } })}
		>
			<Button
				size="sm"
				variant="outline"
				disabled={!can("POST", `/admin/users/${userId}/resend-verification`)}
			>
				<MailPlus /> Resend verification
			</Button>
		</ConfirmAction>
	);
}
