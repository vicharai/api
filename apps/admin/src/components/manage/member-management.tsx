"use client";

import { Crown, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import { Button, Input, Label } from "@llmgateway/shared/components";

import type { OrganizationRole } from "@llmgateway/shared/organization-roles";

const ROLE_OPTIONS: { value: OrganizationRole; label: string }[] = [
	{ value: "owner", label: "Owner" },
	{ value: "admin", label: "Admin" },
	{ value: "project_admin", label: "Project admin" },
	{ value: "developer", label: "Developer" },
];

function isRole(value: string): value is OrganizationRole {
	return ROLE_OPTIONS.some((o) => o.value === value);
}

/** Changes a member's organization role on selection. */
export function MemberRoleSelect({
	orgId,
	userId,
	role,
}: {
	orgId: string;
	userId: string;
	role: string;
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const update = api.useMutation(
		"patch",
		"/admin/organizations/{orgId}/members/{userId}",
		{
			onSuccess: () => {
				toast.success("Role updated");
				void invalidate(`/admin/organizations/{orgId}/members`);
			},
		},
	);

	if (
		!isRole(role) ||
		!can("PATCH", `/admin/organizations/${orgId}/members/${userId}`)
	) {
		return <span className="capitalize">{role.replace(/_/g, " ")}</span>;
	}

	return (
		<SimpleSelect
			className="h-8 min-w-36"
			ariaLabel="Member role"
			value={role}
			options={ROLE_OPTIONS}
			onChange={(next) => {
				if (next !== role) {
					update.mutate({
						params: { path: { orgId, userId } },
						body: { role: next },
					});
				}
			}}
		/>
	);
}

export function RemoveMemberButton({
	orgId,
	userId,
	email,
}: {
	orgId: string;
	userId: string;
	email: string;
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const remove = api.useMutation(
		"delete",
		"/admin/organizations/{orgId}/members/{userId}",
		{
			onSuccess: () => {
				toast.success(`${email} removed`);
				void invalidate("/admin/organizations", "/admin/users");
			},
		},
	);

	return (
		<ConfirmAction
			title="Remove member"
			description={`${email} loses access to this organization. Their account and other organizations are untouched.`}
			confirmLabel="Remove"
			destructive
			requireReason={false}
			onConfirm={() =>
				remove.mutateAsync({ params: { path: { orgId, userId } } })
			}
		>
			<Button
				size="icon-sm"
				variant="ghost"
				aria-label={`Remove ${email}`}
				disabled={
					!can("DELETE", `/admin/organizations/${orgId}/members/${userId}`)
				}
			>
				<UserMinus />
			</Button>
		</ConfirmAction>
	);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Adds an existing, verified user to the organization. */
export function AddMemberDialog({ orgId }: { orgId: string }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<OrganizationRole>("developer");
	const add = api.useMutation("post", "/admin/organizations/{orgId}/members", {
		onSuccess: () => {
			toast.success(`${email.trim()} added`);
			setEmail("");
			void invalidate("/admin/organizations", "/admin/users");
		},
	});

	return (
		<ConfirmAction
			title="Add member"
			description="The user must already have a verified account. Seat limits apply; project grants for project-scoped roles are managed in the dashboard."
			confirmLabel="Add member"
			requireReason={false}
			confirmDisabled={!EMAIL_PATTERN.test(email.trim())}
			extra={
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor="add-member-email">Email</Label>
						<Input
							id="add-member-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="name@example.com"
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Role</Label>
						<SimpleSelect
							className="w-full"
							ariaLabel="Role"
							value={role}
							options={ROLE_OPTIONS}
							onChange={setRole}
						/>
					</div>
				</div>
			}
			onConfirm={() =>
				add.mutateAsync({
					params: { path: { orgId } },
					body: { email: email.trim(), role },
				})
			}
		>
			<Button
				size="sm"
				variant="outline"
				disabled={!can("POST", `/admin/organizations/${orgId}/members`)}
			>
				<UserPlus /> Add member
			</Button>
		</ConfirmAction>
	);
}

/** Makes a member the sole owner; previous owners become admins. */
export function TransferOwnershipDialog({
	orgId,
	members,
}: {
	orgId: string;
	members: { userId: string; email: string; role: string }[];
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const candidates = members.filter((m) => m.role !== "owner");
	const [userId, setUserId] = useState("");
	const target = candidates.find((m) => m.userId === userId);
	const transfer = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/transfer-ownership",
		{
			onSuccess: () => {
				toast.success(`${target?.email ?? "Member"} is now the owner`);
				setUserId("");
				void invalidate("/admin/organizations", "/admin/users");
			},
		},
	);

	return (
		<ConfirmAction
			title="Transfer ownership"
			description="The selected member becomes the only owner; current owners are changed to admin."
			confirmLabel="Transfer"
			destructive
			confirmDisabled={!target}
			extra={
				<div className="space-y-1.5">
					<Label>New owner</Label>
					<SimpleSelect
						className="w-full"
						ariaLabel="New owner"
						placeholder="Pick a member"
						value={userId}
						options={candidates.map((m) => ({
							value: m.userId,
							label: `${m.email} (${m.role.replace(/_/g, " ")})`,
						}))}
						onChange={setUserId}
					/>
				</div>
			}
			onConfirm={() =>
				transfer.mutateAsync({
					params: { path: { orgId } },
					body: { userId },
				})
			}
		>
			<Button
				size="sm"
				variant="outline"
				disabled={
					candidates.length === 0 ||
					!can("POST", `/admin/organizations/${orgId}/transfer-ownership`)
				}
			>
				<Crown /> Transfer ownership
			</Button>
		</ConfirmAction>
	);
}
