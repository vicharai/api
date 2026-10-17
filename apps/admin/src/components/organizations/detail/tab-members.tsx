"use client";

import { Mail } from "lucide-react";
import Link from "next/link";

import {
	MemberRoleSelect,
	RemoveMemberButton,
} from "@/components/manage/member-management";
import { SendEmailDialog } from "@/components/support/send-email-dialog";
import { StatusBadge, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, Section } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatDate, formatUsd } from "@/lib/utils";

import { Button } from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Members = ApiData<"/admin/organizations/{orgId}/members">;
type Member = Members["members"][number];
type Team = Members["teams"][number];

const memberColumns = (orgId: string): ColumnDef<Member>[] => [
	{
		id: "email",
		accessorFn: (m) => m.user.email,
		header: "Member",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<Link
					href={`/users/${row.original.userId}` as Route}
					className="font-medium hover:underline"
				>
					{row.original.user.email}
				</Link>
				<div className="text-xs text-muted-foreground">
					{row.original.user.name ?? "—"}
				</div>
			</div>
		),
	},
	{
		accessorKey: "role",
		header: "Role",
		cell: ({ row }) => (
			<MemberRoleSelect
				orgId={orgId}
				userId={row.original.userId}
				role={row.original.role}
			/>
		),
	},
	{
		id: "verified",
		header: "Email",
		cell: ({ row }) => (
			<StatusBadge
				status={row.original.user.emailVerified ? "verified" : "unverified"}
			/>
		),
	},
	{
		id: "team",
		header: "Team",
		cell: ({ row }) =>
			row.original.team ? (
				<span>
					{row.original.team.name}{" "}
					<span className="text-xs text-muted-foreground">
						({row.original.teamAssignmentSource})
					</span>
				</span>
			) : (
				"—"
			),
	},
	{
		id: "rules",
		header: "IAM rules",
		cell: ({ row }) => row.original.iamRules.length || "—",
	},
	{
		accessorKey: "createdAt",
		header: "Joined",
		cell: ({ row }) => formatDate(row.original.createdAt),
	},
	{
		id: "actions",
		header: "",
		cell: ({ row }) => (
			<div className="flex justify-end">
				<SendEmailDialog to={row.original.user.email}>
					<Button size="icon-sm" variant="ghost" aria-label="Email member">
						<Mail />
					</Button>
				</SendEmailDialog>
				<RemoveMemberButton
					orgId={orgId}
					userId={row.original.userId}
					email={row.original.user.email}
				/>
			</div>
		),
	},
];

const teamColumns: ColumnDef<Team>[] = [
	{
		accessorKey: "name",
		header: "Team",
		cell: ({ row }) => (
			<span className="font-medium">
				{row.original.name}{" "}
				{row.original.isDefault ? <Tone tone="muted">default</Tone> : null}
			</span>
		),
	},
	{
		id: "members",
		header: "Members",
		cell: ({ row }) => row.original.members.length,
	},
	{
		id: "projects",
		header: "Projects",
		cell: ({ row }) =>
			row.original.projects.map((p) => p.name).join(", ") || "—",
	},
	{
		id: "budget",
		header: "Budget",
		cell: ({ row }) => {
			const b = row.original.budget;
			const parts = [
				b.maxApiKeys !== null ? `${b.maxApiKeys} keys` : null,
				b.usageLimit ? `${formatUsd(b.usageLimit)} total` : null,
				b.periodUsageLimit
					? `${formatUsd(b.periodUsageLimit)}/${b.periodUsageDurationValue ?? 1}${b.periodUsageDurationUnit ?? ""}`
					: null,
			].filter(Boolean);
			return parts.join(" · ") || "—";
		},
	},
	{
		id: "rules",
		header: "IAM rules",
		cell: ({ row }) => row.original.iamRules.length || "—",
	},
];

export function OrgMembersTab({ orgId }: { orgId: string }) {
	const api = useApi();
	const members = api.useQuery("get", "/admin/organizations/{orgId}/members", {
		params: { path: { orgId } },
	});

	return (
		<QueryState query={members} rows={6}>
			{(data) => (
				<div className="space-y-4">
					<Section title={`Members (${data.total})`}>
						<DataTable
							columns={memberColumns(orgId)}
							data={data.members}
							getRowId={(m) => m.id}
						/>
					</Section>
					{data.teams.length > 0 ? (
						<Section title={`Teams (${data.teamTotal})`}>
							<DataTable
								columns={teamColumns}
								data={data.teams}
								getRowId={(t) => t.id}
							/>
						</Section>
					) : null}
				</div>
			)}
		</QueryState>
	);
}
