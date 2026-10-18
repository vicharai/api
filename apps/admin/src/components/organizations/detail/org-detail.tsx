"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DetailAnnotations } from "@/components/annotations/detail-annotations";
import { NotesPanel } from "@/components/annotations/notes-panel";
import { StatusBadge, Tone } from "@/components/ui/controls";
import { PageHeader, QueryState } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatDate, formatUsd } from "@/lib/utils";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@llmgateway/shared/components";

import { OrgActions } from "./org-actions";
import { OrgApiKeysTab } from "./tab-api-keys";
import { OrgAuditTab } from "./tab-audit";
import { OrgLimitsTab } from "./tab-limits";
import { OrgLogsTab } from "./tab-logs";
import { OrgManageTab } from "./tab-manage";
import { OrgMembersTab } from "./tab-members";
import { OrgOverviewTab } from "./tab-overview";
import { OrgProjectsTab } from "./tab-projects";
import { OrgProviderAccessTab } from "./tab-provider-access";
import { OrgSafetyTab } from "./tab-safety";
import { OrgSettingsTab } from "./tab-settings";
import { OrgTransactionsTab } from "./tab-transactions";

import type { Route } from "next";

const TABS = [
	{ value: "overview", label: "Overview" },
	{ value: "manage", label: "Manage" },
	{ value: "members", label: "Members" },
	{ value: "projects", label: "Projects" },
	{ value: "keys", label: "API keys" },
	{ value: "transactions", label: "Transactions" },
	{ value: "logs", label: "Logs" },
	{ value: "limits", label: "Limits" },
	{ value: "access", label: "Provider access" },
	{ value: "safety", label: "Safety" },
	{ value: "settings", label: "Settings" },
	{ value: "audit", label: "Audit" },
	{ value: "notes", label: "Notes" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export function OrgDetail({ orgId }: { orgId: string }) {
	const api = useApi();
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const tab = (TABS.find((t) => t.value === params.get("tab"))?.value ??
		"overview") as TabValue;

	const detail = api.useQuery("get", "/admin/organizations/{orgId}", {
		params: { path: { orgId }, query: { window: "30d" } },
	});

	return (
		<QueryState query={detail} rows={6}>
			{(data) => {
				const org = data.organization;
				return (
					<>
						<PageHeader
							title={org.name}
							description={
								<>
									{org.billingEmail}
									{org.ownerEmail && org.ownerUserId ? (
										<>
											{" · owner "}
											<Link
												href={`/users/${org.ownerUserId}` as Route}
												className="hover:underline"
											>
												{org.ownerEmail}
											</Link>
										</>
									) : null}
									{` · created ${formatDate(org.createdAt)}`}
								</>
							}
							actions={<OrgActions org={org} />}
						>
							<div className="flex flex-wrap items-center gap-2">
								<StatusBadge status={org.status} />
								<Tone tone={org.plan === "free" ? "muted" : "info"}>
									{org.plan}
								</Tone>
								{org.kind !== "default" ? (
									<Tone tone="muted">{org.kind}</Tone>
								) : null}
								{org.riskFlagged ? <Tone tone="bad">risk flagged</Tone> : null}
								{org.isTrialActive ? <Tone tone="warn">trial</Tone> : null}
								<span className="text-sm text-muted-foreground">
									Balance{" "}
									<strong className="text-foreground tabular-nums">
										{formatUsd(org.credits)}
									</strong>
								</span>
							</div>
							<DetailAnnotations
								targetType="organization"
								targetId={org.id}
								label={org.name}
							/>
						</PageHeader>
						<Tabs
							value={tab}
							onValueChange={(value) =>
								router.replace(`${pathname}?tab=${value}` as Route, {
									scroll: false,
								})
							}
						>
							<div className="-mx-1 overflow-x-auto px-1 pb-1">
								<TabsList>
									{TABS.map((t) => (
										<TabsTrigger key={t.value} value={t.value}>
											{t.label}
										</TabsTrigger>
									))}
								</TabsList>
							</div>
							<TabsContent value="overview" className="mt-4">
								<OrgOverviewTab orgId={orgId} initial={data} />
							</TabsContent>
							<TabsContent value="manage" className="mt-4">
								<OrgManageTab orgId={orgId} />
							</TabsContent>
							<TabsContent value="members" className="mt-4">
								<OrgMembersTab orgId={orgId} />
							</TabsContent>
							<TabsContent value="projects" className="mt-4">
								<OrgProjectsTab orgId={orgId} />
							</TabsContent>
							<TabsContent value="keys" className="mt-4">
								<OrgApiKeysTab orgId={orgId} />
							</TabsContent>
							<TabsContent value="transactions" className="mt-4">
								<OrgTransactionsTab orgId={orgId} />
							</TabsContent>
							<TabsContent value="logs" className="mt-4">
								<OrgLogsTab orgId={orgId} />
							</TabsContent>
							<TabsContent value="limits" className="mt-4">
								<OrgLimitsTab orgId={orgId} />
							</TabsContent>
							<TabsContent value="access" className="mt-4">
								<OrgProviderAccessTab orgId={orgId} />
							</TabsContent>
							<TabsContent value="safety" className="mt-4">
								<OrgSafetyTab orgId={orgId} />
							</TabsContent>
							<TabsContent value="settings" className="mt-4">
								<OrgSettingsTab orgId={orgId} />
							</TabsContent>
							<TabsContent value="audit" className="mt-4">
								<OrgAuditTab orgId={orgId} />
							</TabsContent>
							<TabsContent value="notes" className="mt-4">
								<NotesPanel targetType="organization" targetId={orgId} />
							</TabsContent>
						</Tabs>
					</>
				);
			}}
		</QueryState>
	);
}
