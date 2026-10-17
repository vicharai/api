"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/ui/confirm-action";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatUsd } from "@/lib/utils";

import { Checkbox, Input, Label } from "@llmgateway/shared/components";

export interface OrgRef {
	id: string;
	name: string;
	status: string | null;
	credits?: string | null;
}

export interface UserRef {
	id: string;
	email: string;
}

interface Controlled {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function AddCreditsDialog({
	org,
	open,
	onOpenChange,
}: { org: OrgRef } & Controlled) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [amount, setAmount] = useState("");
	const credits = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/credits",
		{
			onSuccess: (res) => {
				toast.success(`${org.name}: balance is now ${formatUsd(res.credits)}`);
				setAmount("");
				void invalidate("/admin/organizations");
			},
		},
	);
	const value = Number(amount);

	return (
		<ConfirmAction
			title={`Adjust credits · ${org.name}`}
			description={`${org.credits ? `Current balance ${formatUsd(org.credits)}. ` : ""}Positive adds, negative deducts. Recorded as a credit adjustment.`}
			confirmLabel="Apply"
			confirmDisabled={!Number.isFinite(value) || value === 0}
			open={open}
			onOpenChange={onOpenChange}
			extra={
				<div className="space-y-1.5">
					<Label htmlFor="quick-credits">Amount (USD)</Label>
					<Input
						id="quick-credits"
						type="number"
						step="0.01"
						value={amount}
						placeholder="e.g. 25 or -10"
						onChange={(e) => setAmount(e.target.value)}
					/>
				</div>
			}
			onConfirm={(reason) =>
				credits.mutateAsync({
					params: { path: { orgId: org.id } },
					body: { creditAmount: value, reason },
				})
			}
		/>
	);
}

export function BlockOrgDialog({
	org,
	open,
	onOpenChange,
}: { org: OrgRef } & Controlled) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [reactivateMembers, setReactivateMembers] = useState(true);
	const blocked = org.status === "inactive" || org.status === "deleted";
	const refresh = () => void invalidate("/admin/organizations", "/admin/users");
	const block = api.useMutation("post", "/admin/organizations/{orgId}/block", {
		onSuccess: () => {
			toast.success(`${org.name} blocked`);
			refresh();
		},
	});
	const unblock = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/unblock",
		{
			onSuccess: () => {
				toast.success(`${org.name} unblocked`);
				refresh();
			},
		},
	);
	const path = { orgId: org.id };

	return blocked ? (
		<ConfirmAction
			title={`Unblock ${org.name}`}
			description="Reactivates the organization so its keys work again."
			confirmLabel="Unblock"
			requireReason={false}
			open={open}
			onOpenChange={onOpenChange}
			extra={
				<label className="flex items-center gap-2 text-sm">
					<Checkbox
						checked={reactivateMembers}
						onCheckedChange={(v) => setReactivateMembers(v === true)}
					/>
					Also reactivate members deactivated by the block
				</label>
			}
			onConfirm={() =>
				unblock.mutateAsync({ params: { path }, body: { reactivateMembers } })
			}
		/>
	) : (
		<ConfirmAction
			title={`Block ${org.name}`}
			description="Deactivates the organization and its members, cancels subscriptions and ends their sessions."
			confirmLabel="Block"
			destructive
			open={open}
			onOpenChange={onOpenChange}
			onConfirm={(reason) =>
				block.mutateAsync({ params: { path }, body: { reason } })
			}
		/>
	);
}

export function BlockUserDialog({
	user,
	open,
	onOpenChange,
}: { user: UserRef } & Controlled) {
	const api = useApi();
	const invalidate = useInvalidate();
	const detail = api.useQuery(
		"get",
		"/admin/users/{userId}",
		{ params: { path: { userId: user.id } } },
		{ enabled: open },
	);
	const refresh = () =>
		void invalidate("/admin/users", "/admin/flagged-accounts");
	const block = api.useMutation("post", "/admin/users/{userId}/block", {
		onSuccess: () => {
			toast.success(`${user.email} blocked`);
			refresh();
		},
	});
	const unblock = api.useMutation("post", "/admin/users/{userId}/unblock", {
		onSuccess: () => {
			toast.success(`${user.email} unblocked`);
			refresh();
		},
	});
	const path = { userId: user.id };
	const target = detail.data?.user;
	const blocked = target?.status === "deactivated";
	const isStaff = Boolean(target && (target.isOwnerAdmin || target.adminRole));

	return blocked ? (
		<ConfirmAction
			title={`Unblock ${user.email}`}
			description="Reactivates the account so the user can sign in again."
			confirmLabel="Unblock"
			requireReason={false}
			open={open}
			onOpenChange={onOpenChange}
			onConfirm={() => unblock.mutateAsync({ params: { path } })}
		/>
	) : (
		<ConfirmAction
			title={`Block ${user.email}`}
			description={
				isStaff
					? "Staff accounts cannot be blocked."
					: "Deactivates the account and ends every session."
			}
			confirmLabel="Block user"
			destructive
			confirmDisabled={!target || isStaff}
			open={open}
			onOpenChange={onOpenChange}
			onConfirm={(reason) =>
				block.mutateAsync({ params: { path }, body: { reason } })
			}
		/>
	);
}
