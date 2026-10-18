"use client";

import { UserMinus } from "lucide-react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import { Button } from "@llmgateway/shared/components";

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
