"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { StatusBadge, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
	EmptyState,
	JsonBlock,
	KeyValue,
	QueryState,
	Section,
} from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatDate, formatDateTime, formatUsd } from "@/lib/utils";

import { Button, Input, Label } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { PaymentMethodRow } from "@/lib/api/pending-paths";

const paymentColumns: ColumnDef<PaymentMethodRow>[] = [
	{
		id: "card",
		header: "Method",
		cell: ({ row }) => (
			<span>
				{row.original.brand ?? row.original.type}
				{row.original.last4 ? ` •••• ${row.original.last4}` : ""}{" "}
				{row.original.isDefault ? <Tone tone="info">default</Tone> : null}
			</span>
		),
	},
	{
		id: "exp",
		header: "Expires",
		cell: ({ row }) =>
			row.original.expMonth && row.original.expYear
				? `${String(row.original.expMonth).padStart(2, "0")}/${row.original.expYear}`
				: "—",
	},
	{
		accessorKey: "createdAt",
		header: "Added",
		cell: ({ row }) => formatDate(row.original.createdAt),
	},
];

function yesNo(value: boolean | null | undefined) {
	return value ? "yes" : "no";
}

export function OrgSettingsTab({ orgId }: { orgId: string }) {
	const api = useApi();
	const can = useCan();
	const path = { orgId };
	const settings = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/settings",
		{ params: { path } },
	);
	const sso = api.useQuery("get", "/admin/organizations/{orgId}/sso", {
		params: { path },
	});
	const payments = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/payment-methods",
		{ params: { path } },
	);
	const [fingerprint, setFingerprint] = useState("");
	const release = api.useMutation(
		"delete",
		"/admin/organizations/{orgId}/dev-plan-card-fingerprints/{fingerprintId}",
		{
			onSuccess: () => {
				toast.success("Card fingerprint released");
				setFingerprint("");
			},
		},
	);

	return (
		<div className="space-y-4">
			<QueryState query={settings} rows={8}>
				{({ organization: o, customProviders }) => (
					<>
						<Section title="Organization settings">
							<KeyValue
								items={[
									{
										label: "ID",
										value: <code className="text-xs">{o.id}</code>,
									},
									{ label: "Safety identifier", value: o.safetyIdentifier },
									{ label: "Kind", value: o.kind },
									{ label: "Plan", value: o.plan },
									{ label: "Dev plan", value: o.devPlan },
									{ label: "Retention", value: o.retentionLevel },
									{ label: "Credits", value: formatUsd(o.credits) },
									{
										label: "Auto top-up",
										value: o.autoTopUpEnabled
											? `on · below ${formatUsd(o.autoTopUpThreshold)} add ${formatUsd(o.autoTopUpAmount)}`
											: "off",
									},
									{ label: "Last top-up", value: formatUsd(o.lastTopUpAmount) },
									{
										label: "Payment failures",
										value: o.paymentFailureCount
											? `${formatNumber(o.paymentFailureCount)} · last ${formatDateTime(o.lastPaymentFailureAt)}`
											: "none",
									},
									{
										label: "Subscription",
										value: o.stripeSubscriptionId
											? `${o.stripeSubscriptionId}${o.subscriptionCancelled ? " (cancelled)" : ""}`
											: "—",
									},
									{ label: "Customer ID", value: o.stripeCustomerId ?? "—" },
									{ label: "Billing company", value: o.billingCompany ?? "—" },
									{ label: "Billing address", value: o.billingAddress ?? "—" },
									{ label: "Tax ID", value: o.billingTaxId ?? "—" },
									{ label: "Billing notes", value: o.billingNotes ?? "—" },
									{
										label: "SSO auto-join domain",
										value: o.ssoAutoJoinDomain ?? "—",
									},
									{
										label: "Referral bonus",
										value: yesNo(o.referralBonusEnabled),
									},
								]}
							/>
						</Section>
						<div className="grid gap-4 lg:grid-cols-2">
							<Section title="Provider compliance policy">
								{o.providerCompliancePolicy?.enabled ? (
									<JsonBlock value={o.providerCompliancePolicy} />
								) : (
									<EmptyState>No compliance policy.</EmptyState>
								)}
							</Section>
							<Section title="Custom providers">
								{customProviders.length === 0 ? (
									<EmptyState>None.</EmptyState>
								) : (
									<ul className="space-y-2 text-sm">
										{customProviders.map((p) => (
											<li key={p.id} className="flex items-center gap-2">
												<span className="font-medium">{p.name ?? p.id}</span>
												<StatusBadge status={p.status} />
												{p.customModelsOnly ? (
													<Tone tone="muted">custom models only</Tone>
												) : null}
											</li>
										))}
									</ul>
								)}
							</Section>
						</div>
					</>
				)}
			</QueryState>

			<Section title="Payment methods">
				<QueryState query={payments}>
					{(data) => (
						<DataTable
							columns={paymentColumns}
							data={data.paymentMethods}
							getRowId={(p) => p.id}
							empty="No saved payment methods."
						/>
					)}
				</QueryState>
			</Section>

			<Section title="SSO and SCIM">
				<QueryState query={sso}>
					{(s) =>
						s.connections.length === 0 && s.scimTokens.length === 0 ? (
							<EmptyState>No SSO connections.</EmptyState>
						) : (
							<div className="space-y-4 text-sm">
								{s.connections.map((c) => (
									<div key={c.id} className="rounded-md border p-3">
										<div className="flex flex-wrap items-center gap-2 font-medium">
											{c.domain}
											<Tone tone="info">{c.protocol}</Tone>
											{c.enforced ? <Tone tone="warn">enforced</Tone> : null}
											<StatusBadge
												status={c.domainVerified ? "verified" : "unverified"}
											/>
										</div>
										<div className="text-xs text-muted-foreground">
											{c.issuer} · {c.providerType} · since{" "}
											{formatDate(c.createdAt)}
										</div>
									</div>
								))}
								{s.scimTokens.length > 0 ? (
									<div>
										<h4 className="mb-1 font-medium">SCIM tokens</h4>
										<ul className="space-y-1 text-xs">
											{s.scimTokens.map((t) => (
												<li key={t.id}>
													<code>{t.maskedToken}</code> · {t.status} · last used{" "}
													{formatDateTime(t.lastUsedAt)}
												</li>
											))}
										</ul>
									</div>
								) : null}
								{s.roleMappings.length > 0 ? (
									<div>
										<h4 className="mb-1 font-medium">Role mappings</h4>
										<ul className="space-y-1 text-xs">
											{s.roleMappings.map((m) => (
												<li key={m.id}>
													{m.groupName} → {m.role}
												</li>
											))}
										</ul>
									</div>
								) : null}
								{s.scimGroups.length > 0 ? (
									<div>
										<h4 className="mb-1 font-medium">SCIM groups</h4>
										<ul className="space-y-1 text-xs">
											{s.scimGroups.map((g) => (
												<li key={g.id}>
													{g.displayName} · {g.memberCount} members
												</li>
											))}
										</ul>
									</div>
								) : null}
							</div>
						)
					}
				</QueryState>
			</Section>

			<Section
				title="Release DevPass card fingerprint"
				description="Lets a card that was used for a DevPass trial be used again."
			>
				<div className="flex max-w-lg items-end gap-2">
					<div className="flex-1 space-y-1.5">
						<Label htmlFor="fp">Fingerprint ID</Label>
						<Input
							id="fp"
							value={fingerprint}
							onChange={(e) => setFingerprint(e.target.value)}
						/>
					</div>
					<ConfirmAction
						title="Release card fingerprint"
						confirmLabel="Release"
						destructive
						onConfirm={() =>
							release.mutateAsync({
								params: {
									path: { orgId, fingerprintId: fingerprint.trim() },
								},
							})
						}
					>
						<Button
							variant="outline"
							disabled={
								!fingerprint.trim() ||
								!can(
									"DELETE",
									`/admin/organizations/${orgId}/dev-plan-card-fingerprints/x`,
								)
							}
						>
							Release
						</Button>
					</ConfirmAction>
				</div>
			</Section>
		</div>
	);
}
