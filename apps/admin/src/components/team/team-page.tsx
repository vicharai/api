"use client";

import { Lock, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useAdminSession } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
	KeyValue,
	PageHeader,
	QueryState,
	Section,
} from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { ROLE_LABELS, type AdminRole } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";

import { Button, Input, Label } from "@llmgateway/shared/components";

import type { AdminTeamMember } from "@/lib/api/admin-types";
import type { Route } from "next";

const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
	{ value: "admin", label: "Admin" },
	{ value: "support", label: "Support" },
	{ value: "viewer", label: "Viewer" },
];

const ROLE_HELP: Record<AdminRole, string> = {
	admin:
		"Everything, including revenue, team management and destructive actions.",
	support:
		"Read everything except revenue; reply to support, refund, verify emails, approve flagged accounts, log CRM activity.",
	viewer: "Read-only access to everything except revenue.",
};

export function TeamPage() {
	const api = useApi();
	const session = useAdminSession();
	const invalidate = useInvalidate();
	const team = api.useQuery("get", "/admin/team");
	const done = (message: string) => () => {
		toast.success(message);
		void invalidate("/admin/team");
	};
	const update = api.useMutation("patch", "/admin/team/{userId}", {
		onSuccess: done("Role updated"),
	});
	const remove = api.useMutation("delete", "/admin/team/{userId}", {
		onSuccess: done("Access revoked"),
	});

	const columns: ColumnDef<AdminTeamMember>[] = [
		{
			accessorKey: "email",
			header: "Member",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<Link
						href={`/users/${row.original.userId}` as Route}
						className="font-medium hover:underline"
					>
						{row.original.email}
					</Link>
					<div className="text-xs text-muted-foreground">
						{row.original.name ?? "—"}
					</div>
				</div>
			),
		},
		{
			accessorKey: "role",
			header: "Role",
			cell: ({ row }) =>
				row.original.isOwner ? (
					<Tone tone="info">
						<Lock /> Owner (ADMIN_EMAILS)
					</Tone>
				) : (
					<SimpleSelect
						value={row.original.role}
						onChange={(role) =>
							update.mutate({
								params: { path: { userId: row.original.userId } },
								body: { role },
							})
						}
						options={ROLE_OPTIONS}
						className="h-8"
					/>
				),
		},
		{
			accessorKey: "createdAt",
			header: "Since",
			cell: ({ row }) => formatDate(row.original.createdAt),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) =>
				row.original.isOwner ||
				row.original.userId === session.userId ? null : (
					<div className="flex justify-end">
						<ConfirmAction
							title={`Revoke ${row.original.email}`}
							description="Removes their admin role. Their user account is untouched."
							confirmLabel="Revoke"
							destructive
							onConfirm={() =>
								remove.mutateAsync({
									params: { path: { userId: row.original.userId } },
								})
							}
						>
							<Button size="icon-sm" variant="ghost" aria-label="Revoke">
								<Trash2 />
							</Button>
						</ConfirmAction>
					</div>
				),
		},
	];

	return (
		<>
			<PageHeader
				title="Team"
				description="Staff who can sign in to this panel. Owners come from ADMIN_EMAILS and can only be changed in the deployment config."
				actions={<GrantDialog />}
			/>
			<div className="space-y-4">
				<QueryState query={team}>
					{(data) => (
						<DataTable
							columns={columns}
							data={data.members}
							getRowId={(m) => m.userId}
							empty="No team members."
						/>
					)}
				</QueryState>
				<Section title="Roles">
					<KeyValue
						items={ROLE_OPTIONS.map((r) => ({
							label: r.label,
							value: (
								<span className="whitespace-normal">{ROLE_HELP[r.value]}</span>
							),
						}))}
					/>
				</Section>
			</div>
		</>
	);
}

function GrantDialog() {
	const api = useApi();
	const invalidate = useInvalidate();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<AdminRole>("support");
	const grant = api.useMutation("post", "/admin/team", {
		onSuccess: (res) => {
			toast.success(
				`${res.member.email} is now ${ROLE_LABELS[res.member.role].toLowerCase()}`,
			);
			setEmail("");
			void invalidate("/admin/team");
		},
	});

	return (
		<ConfirmAction
			title="Grant admin access"
			description="The user must already have a verified account."
			confirmLabel="Grant"
			confirmDisabled={!/\S+@\S+\.\S+/.test(email)}
			extra={
				<div className="grid grid-cols-3 gap-3">
					<div className="col-span-2 space-y-1.5">
						<Label htmlFor="grant-email">Email</Label>
						<Input
							id="grant-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Role</Label>
						<SimpleSelect
							className="w-full"
							value={role}
							onChange={setRole}
							options={ROLE_OPTIONS}
						/>
					</div>
					<p className="col-span-3 text-xs text-muted-foreground">
						{ROLE_HELP[role]}
					</p>
				</div>
			}
			onConfirm={() =>
				grant.mutateAsync({ body: { email: email.trim(), role } })
			}
		>
			<Button size="sm">
				<UserPlus /> Grant access
			</Button>
		</ConfirmAction>
	);
}
