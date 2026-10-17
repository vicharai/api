"use client";

import {
	Ban,
	CheckCircle2,
	LogOut,
	MailCheck,
	ShieldCheck,
	Unlock,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { useAdminSession, useCan } from "@/components/shell/admin-session";
import { SendEmailDialog } from "@/components/support/send-email-dialog";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { StatusBadge, Tone } from "@/components/ui/controls";
import {
	KeyValue,
	PageHeader,
	QueryState,
	Section,
} from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime, formatUsd } from "@/lib/utils";

import {
	Alert,
	AlertDescription,
	AlertTitle,
	Button,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Detail = ApiData<"/admin/users/{userId}">;

export function UserDetail({ userId }: { userId: string }) {
	const api = useApi();
	const detail = api.useQuery("get", "/admin/users/{userId}", {
		params: { path: { userId } },
	});

	return (
		<QueryState query={detail} rows={8}>
			{(data) => <UserDetailView data={data} />}
		</QueryState>
	);
}

function UserDetailView({ data }: { data: Detail }) {
	const { user } = data;
	const session = useAdminSession();
	const can = useCan();
	const api = useApi();
	const invalidate = useInvalidate();
	const path = { userId: user.id };

	const refresh = () =>
		invalidate(
			"/admin/users",
			"/admin/flagged-accounts",
			"/admin/organizations",
		);

	const block = api.useMutation("post", "/admin/users/{userId}/block", {
		onSuccess: () => {
			toast.success("User blocked and signed out");
			void refresh();
		},
	});
	const unblock = api.useMutation("post", "/admin/users/{userId}/unblock", {
		onSuccess: () => {
			toast.success("User unblocked");
			void refresh();
		},
	});
	const logout = api.useMutation("delete", "/admin/users/{userId}/sessions", {
		onSuccess: (res) => {
			toast.success(`Ended ${res.deleted} session(s)`);
			void refresh();
		},
	});
	const verify = api.useMutation("post", "/admin/users/{userId}/verify-email", {
		onSuccess: () => {
			toast.success("Email marked verified");
			void refresh();
		},
	});
	const approve = api.useMutation(
		"post",
		"/admin/flagged-accounts/{userId}/approve",
		{
			onSuccess: () => {
				toast.success("Risk flag approved");
				void refresh();
			},
		},
	);

	const isSelf = user.id === session.userId;
	const isStaff = user.isOwnerAdmin || user.adminRole !== null;
	const blocked = user.status === "deactivated";
	const canBlock =
		!isSelf && !isStaff && can("POST", `/admin/users/${user.id}/block`);

	return (
		<>
			<PageHeader
				title={user.email}
				description={user.name ?? undefined}
				actions={
					<>
						<SendEmailDialog to={user.email} />
						{!user.emailVerified ? (
							<ConfirmAction
								title="Mark email verified"
								description="Use this when the user proved ownership another way (e.g. replied from the address)."
								confirmLabel="Mark verified"
								onConfirm={(reason) =>
									verify.mutateAsync({ params: { path }, body: { reason } })
								}
							>
								<Button
									variant="outline"
									size="sm"
									disabled={
										!can("POST", `/admin/users/${user.id}/verify-email`)
									}
								>
									<MailCheck /> Verify email
								</Button>
							</ConfirmAction>
						) : null}
						{user.riskStatus === "flagged" ? (
							<ConfirmAction
								title="Approve flagged account"
								description="Clears the risk flag and lets the account use the platform normally."
								confirmLabel="Approve"
								requireReason={false}
								onConfirm={() => approve.mutateAsync({ params: { path } })}
							>
								<Button
									variant="outline"
									size="sm"
									disabled={
										!can("POST", `/admin/flagged-accounts/${user.id}/approve`)
									}
								>
									<CheckCircle2 /> Approve risk flag
								</Button>
							</ConfirmAction>
						) : null}
						<ConfirmAction
							title="Sign out everywhere"
							description={`Ends all ${data.sessions.length} active session(s) for this user.`}
							confirmLabel="Sign out"
							destructive
							onConfirm={() => logout.mutateAsync({ params: { path } })}
						>
							<Button
								variant="outline"
								size="sm"
								disabled={
									data.sessions.length === 0 ||
									!can("DELETE", `/admin/users/${user.id}/sessions`)
								}
							>
								<LogOut /> Force logout
							</Button>
						</ConfirmAction>
						{blocked ? (
							<ConfirmAction
								title="Unblock user"
								description="Reactivates the account so the user can sign in again."
								confirmLabel="Unblock"
								onConfirm={() => unblock.mutateAsync({ params: { path } })}
							>
								<Button
									size="sm"
									disabled={!can("POST", `/admin/users/${user.id}/unblock`)}
								>
									<Unlock /> Unblock
								</Button>
							</ConfirmAction>
						) : (
							<ConfirmAction
								title="Block user"
								description="Deactivates the account and ends every session. The user cannot sign in until unblocked."
								confirmLabel="Block user"
								destructive
								onConfirm={(reason) =>
									block.mutateAsync({ params: { path }, body: { reason } })
								}
							>
								<Button
									variant="destructive"
									size="sm"
									disabled={!canBlock}
									title={
										isStaff
											? "Staff accounts cannot be blocked"
											: isSelf
												? "You cannot block yourself"
												: undefined
									}
								>
									<Ban /> Block
								</Button>
							</ConfirmAction>
						)}
					</>
				}
			>
				<div className="flex flex-wrap gap-2">
					<StatusBadge status={user.status} />
					<StatusBadge
						status={user.emailVerified ? "verified" : "unverified"}
					/>
					{user.riskStatus ? <StatusBadge status={user.riskStatus} /> : null}
					{user.adminRole ? (
						<Tone tone="info">
							<ShieldCheck /> {user.isOwnerAdmin ? "Owner" : user.adminRole}
						</Tone>
					) : null}
				</div>
			</PageHeader>

			<div className="space-y-4">
				{blocked ? (
					<Alert variant="destructive">
						<Ban className="size-4" />
						<AlertTitle>Blocked</AlertTitle>
						<AlertDescription>
							{user.blockReason ?? "No reason recorded."}
						</AlertDescription>
					</Alert>
				) : null}

				<Section title="Profile">
					<KeyValue
						items={[
							{
								label: "User ID",
								value: <code className="text-xs">{user.id}</code>,
							},
							{ label: "Joined", value: formatDateTime(user.createdAt) },
							{
								label: "Sign-in methods",
								value:
									[
										...data.accounts.map((a) => a.providerId),
										...(data.hasPasskeys ? ["passkey"] : []),
									].join(", ") || "—",
							},
							{ label: "Risk status", value: user.riskStatus ?? "none" },
							{
								label: "Flagged at",
								value: formatDateTime(user.riskFlaggedAt),
							},
							{ label: "Flag IP", value: user.riskFlagIp ?? "—" },
							{
								label: "Risk reviewed",
								value: formatDateTime(user.riskReviewedAt),
							},
							{
								label: "Last session",
								value: formatDateTime(data.sessions[0]?.createdAt ?? null),
							},
						]}
					/>
				</Section>

				<Section title="Organizations">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Kind</TableHead>
								<TableHead>Plan</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="text-right">Credits</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.organizations.map((org) => (
								<TableRow key={org.id}>
									<TableCell>
										<Link
											href={`/organizations/${org.id}` as Route}
											className="font-medium hover:underline"
										>
											{org.name}
										</Link>
									</TableCell>
									<TableCell className="capitalize">{org.role}</TableCell>
									<TableCell>{org.kind}</TableCell>
									<TableCell>{org.plan}</TableCell>
									<TableCell>
										<StatusBadge status={org.status} />
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatUsd(org.credits)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Section>

				<Section title="Sessions" description="Most recent first.">
					{data.sessions.length === 0 ? (
						<p className="text-sm text-muted-foreground">No active sessions.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Started</TableHead>
									<TableHead>Expires</TableHead>
									<TableHead>IP</TableHead>
									<TableHead>User agent</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.sessions.map((s) => (
									<TableRow key={s.id}>
										<TableCell>{formatDateTime(s.createdAt)}</TableCell>
										<TableCell>{formatDateTime(s.expiresAt)}</TableCell>
										<TableCell className="font-mono text-xs">
											{s.ipAddress ?? "—"}
										</TableCell>
										<TableCell className="max-w-md truncate text-xs text-muted-foreground">
											{s.userAgent ?? "—"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</Section>
			</div>
		</>
	);
}
