"use client";

import {
	ChevronDown,
	Fingerprint,
	KeyRound,
	Mail,
	Trash2,
	type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAdminSession, useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	Input,
	Label,
} from "@llmgateway/shared/components";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface DialogControl {
	/** Trigger element; omit and use `open`/`onOpenChange` to control it. */
	children?: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

function TriggerButton({
	icon: Icon,
	label,
	disabled,
	destructive,
	title,
}: {
	icon: LucideIcon;
	label: string;
	disabled?: boolean;
	destructive?: boolean;
	title?: string;
}) {
	return (
		<Button
			size="sm"
			variant={destructive ? "destructive" : "outline"}
			disabled={disabled}
			title={title}
		>
			<Icon /> {label}
		</Button>
	);
}

export function ChangeEmailDialog({
	userId,
	currentEmail,
	children,
	open,
	onOpenChange,
}: { userId: string; currentEmail: string } & DialogControl) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [email, setEmail] = useState("");
	const change = api.useMutation("patch", "/admin/users/{userId}/email", {
		onSuccess: () => {
			toast.success("Email changed");
			setEmail("");
			void invalidate("/admin/users", "/admin/organizations");
		},
	});
	const next = email.trim().toLowerCase();
	const valid = EMAIL_PATTERN.test(next) && next !== currentEmail.toLowerCase();

	return (
		<ConfirmAction
			title="Change email"
			description={`Currently ${currentEmail}. The new address is marked verified and the user signs in with it from now on.`}
			confirmLabel="Change email"
			requireReason={false}
			confirmDisabled={!valid}
			open={open}
			onOpenChange={onOpenChange}
			extra={
				<div className="space-y-1.5">
					<Label htmlFor="new-email">New email</Label>
					<Input
						id="new-email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="name@example.com"
					/>
				</div>
			}
			onConfirm={() =>
				change.mutateAsync({
					params: { path: { userId } },
					body: { email: next },
				})
			}
		>
			{open !== undefined
				? children
				: (children ?? (
						<TriggerButton
							icon={Mail}
							label="Change email"
							disabled={!can("PATCH", `/admin/users/${userId}/email`)}
						/>
					))}
		</ConfirmAction>
	);
}

export function SendPasswordResetButton({
	userId,
	email,
	children,
	open,
	onOpenChange,
}: { userId: string; email: string } & DialogControl) {
	const api = useApi();
	const can = useCan();
	const reset = api.useMutation(
		"post",
		"/admin/users/{userId}/password-reset",
		{ onSuccess: () => toast.success(`Password reset email sent to ${email}`) },
	);

	return (
		<ConfirmAction
			title="Send password reset"
			description={`Emails ${email} a link to set a new password. Their current password keeps working until they use it.`}
			confirmLabel="Send email"
			requireReason={false}
			open={open}
			onOpenChange={onOpenChange}
			onConfirm={() => reset.mutateAsync({ params: { path: { userId } } })}
		>
			{open !== undefined
				? children
				: (children ?? (
						<TriggerButton
							icon={KeyRound}
							label="Reset password"
							disabled={!can("POST", `/admin/users/${userId}/password-reset`)}
						/>
					))}
		</ConfirmAction>
	);
}

export function RemovePasskeysButton({
	userId,
	hasPasskeys,
	children,
	open,
	onOpenChange,
}: { userId: string; hasPasskeys: boolean } & DialogControl) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const remove = api.useMutation("delete", "/admin/users/{userId}/passkeys", {
		onSuccess: (res) => {
			toast.success(`Removed ${res.deleted} passkey(s)`);
			void invalidate("/admin/users");
		},
	});

	return (
		<ConfirmAction
			title="Remove passkeys"
			description="Deletes every passkey on the account, e.g. after a lost device. The user can still sign in with a password or social login."
			confirmLabel="Remove passkeys"
			destructive
			requireReason={false}
			open={open}
			onOpenChange={onOpenChange}
			onConfirm={() => remove.mutateAsync({ params: { path: { userId } } })}
		>
			{open !== undefined
				? children
				: (children ?? (
						<TriggerButton
							icon={Fingerprint}
							label="Remove passkeys"
							disabled={
								!hasPasskeys ||
								!can("DELETE", `/admin/users/${userId}/passkeys`)
							}
						/>
					))}
		</ConfirmAction>
	);
}

export function DeleteUserDialog({
	userId,
	email,
	children,
	open,
	onOpenChange,
	onDeleted,
}: {
	userId: string;
	email: string;
	onDeleted?: () => void;
} & DialogControl) {
	const api = useApi();
	const can = useCan();
	const router = useRouter();
	const invalidate = useInvalidate();
	const [typed, setTyped] = useState("");
	const remove = api.useMutation("delete", "/admin/users/{userId}", {
		onSuccess: () => {
			toast.success(`${email} deleted`);
			setTyped("");
			void invalidate("/admin/users", "/admin/organizations");
			if (onDeleted) {
				onDeleted();
			} else {
				router.push("/users");
			}
		},
	});

	return (
		<ConfirmAction
			title="Delete user"
			description="Permanently deletes the account and its sessions, and the organizations they solely own. This cannot be undone."
			confirmLabel="Delete user"
			destructive
			confirmDisabled={typed.trim().toLowerCase() !== email.toLowerCase()}
			open={open}
			onOpenChange={onOpenChange}
			extra={
				<div className="space-y-1.5">
					<Label htmlFor="confirm-delete-email">
						Type <span className="font-mono">{email}</span> to confirm
					</Label>
					<Input
						id="confirm-delete-email"
						autoComplete="off"
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
					/>
				</div>
			}
			onConfirm={(reason) =>
				remove.mutateAsync({ params: { path: { userId } }, body: { reason } })
			}
		>
			{open !== undefined
				? children
				: (children ?? (
						<TriggerButton
							icon={Trash2}
							label="Delete user"
							destructive
							disabled={!can("DELETE", `/admin/users/${userId}`)}
						/>
					))}
		</ConfirmAction>
	);
}

type ManageDialog = "email" | "reset" | "passkeys" | "delete" | null;

/** "Manage" dropdown with every account-management action for a user. */
export function UserManageMenu({
	user,
	hasPasskeys,
}: {
	user: {
		id: string;
		email: string;
		isOwnerAdmin: boolean;
		adminRole: string | null;
	};
	hasPasskeys: boolean;
}) {
	const session = useAdminSession();
	const can = useCan();
	const [dialog, setDialog] = useState<ManageDialog>(null);
	const base = `/admin/users/${user.id}`;
	const isSelf = user.id === session.userId;
	const isStaff = user.isOwnerAdmin || user.adminRole !== null;
	const control = (name: Exclude<ManageDialog, null>) => ({
		open: dialog === name,
		onOpenChange: (next: boolean) => setDialog(next ? name : null),
	});

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="sm" variant="outline">
						Manage <ChevronDown />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuItem
						onSelect={() => setDialog("email")}
						disabled={!can("PATCH", `${base}/email`)}
					>
						<Mail className="mr-2 size-4" /> Change email
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => setDialog("reset")}
						disabled={!can("POST", `${base}/password-reset`)}
					>
						<KeyRound className="mr-2 size-4" /> Send password reset
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => setDialog("passkeys")}
						disabled={!hasPasskeys || !can("DELETE", `${base}/passkeys`)}
					>
						<Fingerprint className="mr-2 size-4" /> Remove passkeys
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => setDialog("delete")}
						disabled={isSelf || isStaff || !can("DELETE", base)}
					>
						<Trash2 className="mr-2 size-4" /> Delete user
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ChangeEmailDialog
				userId={user.id}
				currentEmail={user.email}
				{...control("email")}
			/>
			<SendPasswordResetButton
				userId={user.id}
				email={user.email}
				{...control("reset")}
			/>
			<RemovePasskeysButton
				userId={user.id}
				hasPasskeys={hasPasskeys}
				{...control("passkeys")}
			/>
			<DeleteUserDialog
				userId={user.id}
				email={user.email}
				{...control("delete")}
			/>
		</>
	);
}
