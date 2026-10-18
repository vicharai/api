"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { ErrorState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDate } from "@/lib/utils";

import { Button, Input, Label } from "@llmgateway/shared/components";

import { TargetPicker, targetLabel } from "./target-picker";

import type { Route } from "next";

interface Row {
	id: string;
	organizationId: string | null;
	organizationName?: string | null;
	provider: string | null;
	model: string | null;
	reason: string | null;
	expiresAt: string | null;
	updatedAt: string;
	/** Stored as a fraction, e.g. "0.1000" for 10%. */
	value: string;
}

function percent(fraction: string): string {
	const n = Number(fraction) * 100;
	return `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

function isExpired(expiresAt: string | null) {
	return expiresAt !== null && new Date(expiresAt).getTime() < Date.now();
}

function policyColumns({
	valueLabel,
	showOrg,
	canDelete,
	onDelete,
}: {
	valueLabel: string;
	showOrg?: boolean;
	canDelete: (row: Row) => boolean;
	onDelete: (row: Row) => Promise<unknown>;
}): ColumnDef<Row>[] {
	return [
		...(showOrg
			? [
					{
						id: "org",
						header: "Organization",
						cell: ({ row }) =>
							row.original.organizationId ? (
								<Link
									href={
										`/organizations/${row.original.organizationId}` as Route
									}
									className="hover:underline"
								>
									{row.original.organizationName ?? row.original.organizationId}
								</Link>
							) : (
								"Global"
							),
					} satisfies ColumnDef<Row>,
				]
			: []),
		{
			id: "target",
			header: "Applies to",
			cell: ({ row }) => targetLabel(row.original.provider, row.original.model),
		},
		{
			id: "value",
			header: valueLabel,
			cell: ({ row }) => (
				<span className="font-medium tabular-nums">
					{percent(row.original.value)}
				</span>
			),
		},
		{
			id: "expires",
			header: "Expires",
			cell: ({ row }) =>
				row.original.expiresAt ? (
					isExpired(row.original.expiresAt) ? (
						<Tone tone="muted">
							expired {formatDate(row.original.expiresAt)}
						</Tone>
					) : (
						formatDate(row.original.expiresAt)
					)
				) : (
					"never"
				),
		},
		{
			id: "reason",
			header: "Reason",
			cell: ({ row }) => (
				<span className="text-xs text-muted-foreground">
					{row.original.reason ?? "—"}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex justify-end">
					<ConfirmAction
						title="Remove"
						description={targetLabel(row.original.provider, row.original.model)}
						confirmLabel="Remove"
						destructive
						onConfirm={() => onDelete(row.original)}
					>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Remove"
							disabled={!canDelete(row.original)}
						>
							<Trash2 />
						</Button>
					</ConfirmAction>
				</div>
			),
		},
	];
}

function AddPolicyDialog({
	title,
	valueLabel,
	valueHint,
	min,
	max,
	disabled,
	onSave,
}: {
	title: string;
	valueLabel: string;
	valueHint: string;
	min: number;
	max: number;
	disabled: boolean;
	onSave: (input: {
		provider: string | null;
		model: string | null;
		value: number;
		expiresAt: string | null;
		reason: string;
	}) => Promise<unknown>;
}) {
	const [target, setTarget] = useState<{
		provider: string | null;
		model: string | null;
	}>({ provider: null, model: null });
	const [value, setValue] = useState("");
	const [expiresAt, setExpiresAt] = useState("");
	const n = Number(value);

	return (
		<ConfirmAction
			title={title}
			confirmLabel="Add"
			confirmDisabled={value === "" || n < min || n > max}
			extra={
				<div className="space-y-3">
					<TargetPicker
						provider={target.provider}
						model={target.model}
						onChange={setTarget}
					/>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="policy-value">{valueLabel}</Label>
							<Input
								id="policy-value"
								type="number"
								step="0.01"
								min={min}
								max={max}
								value={value}
								onChange={(e) => setValue(e.target.value)}
							/>
							<p className="text-xs text-muted-foreground">{valueHint}</p>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="policy-exp">Expires</Label>
							<Input
								id="policy-exp"
								type="date"
								value={expiresAt}
								onChange={(e) => setExpiresAt(e.target.value)}
							/>
						</div>
					</div>
				</div>
			}
			onConfirm={async (reason) => {
				await onSave({
					...target,
					value: n,
					expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
					reason,
				});
				setValue("");
				setExpiresAt("");
			}}
		>
			<Button size="sm" variant="outline" disabled={disabled}>
				<Plus /> Add
			</Button>
		</ConfirmAction>
	);
}

export function DiscountsPanel({ orgId }: { orgId?: string }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const isOrg = Boolean(orgId);
	const orgPath = { orgId: orgId ?? "" };
	const base = isOrg
		? `/admin/organizations/${orgId}/discounts`
		: "/admin/discounts";

	const globalList = api.useQuery("get", "/admin/discounts", undefined, {
		enabled: !isOrg,
	});
	const orgList = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/discounts",
		{ params: { path: orgPath } },
		{ enabled: isOrg },
	);
	const list = isOrg ? orgList : globalList;
	const listError: unknown = list.error;

	const done = (message: string) => () => {
		toast.success(message);
		void invalidate("/admin/discounts", "/admin/organizations");
	};
	const createGlobal = api.useMutation("post", "/admin/discounts", {
		onSuccess: done("Discount added"),
	});
	const createOrg = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/discounts",
		{ onSuccess: done("Discount added") },
	);
	const deleteGlobal = api.useMutation(
		"delete",
		"/admin/discounts/{discountId}",
		{
			onSuccess: done("Discount removed"),
		},
	);
	const deleteOrg = api.useMutation(
		"delete",
		"/admin/organizations/{orgId}/discounts/{discountId}",
		{ onSuccess: done("Discount removed") },
	);

	const columns = policyColumns({
		valueLabel: "Discount",
		canDelete: (row) => can("DELETE", `${base}/${row.id}`),
		onDelete: (row) =>
			isOrg
				? deleteOrg.mutateAsync({
						params: { path: { ...orgPath, discountId: row.id } },
					})
				: deleteGlobal.mutateAsync({
						params: { path: { discountId: row.id } },
					}),
	});

	return (
		<Section
			title={isOrg ? "Organization discounts" : "Global discounts"}
			description={
				isOrg
					? "Price reductions for this organization only. They stack on global discounts."
					: "Price reductions for every customer."
			}
			actions={
				<AddPolicyDialog
					title="Add discount"
					valueLabel="Discount %"
					valueHint="0–100. Applied to the list price."
					min={0}
					max={100}
					disabled={!can("POST", base)}
					onSave={({ provider, model, value, expiresAt, reason }) => {
						const body = {
							provider,
							model,
							discountPercent: value,
							expiresAt,
							reason: reason || null,
						};
						return isOrg
							? createOrg.mutateAsync({ params: { path: orgPath }, body })
							: createGlobal.mutateAsync({ body });
					}}
				/>
			}
		>
			{listError ? (
				<ErrorState error={listError} />
			) : (
				<DataTable
					columns={columns}
					data={list.data?.discounts.map((d) => ({
						...d,
						value: d.discountPercent,
					}))}
					isLoading={list.isLoading}
					getRowId={(r) => r.id}
					empty="No discounts."
				/>
			)}
		</Section>
	);
}

export function OrgDiscountsOverview() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const list = api.useQuery("get", "/admin/discounts/organizations");
	const listError: unknown = list.error;
	const remove = api.useMutation(
		"delete",
		"/admin/organizations/{orgId}/discounts/{discountId}",
		{
			onSuccess: () => {
				toast.success("Discount removed");
				void invalidate("/admin/discounts", "/admin/organizations");
			},
		},
	);
	const columns = policyColumns({
		valueLabel: "Discount",
		showOrg: true,
		canDelete: (row) =>
			can(
				"DELETE",
				`/admin/organizations/${row.organizationId}/discounts/${row.id}`,
			),
		onDelete: (row) =>
			remove.mutateAsync({
				params: {
					path: { orgId: row.organizationId ?? "", discountId: row.id },
				},
			}),
	});

	return (
		<Section
			title="Organizations with discounts"
			description="Every org-scoped discount across the platform."
		>
			{listError ? (
				<ErrorState error={listError} />
			) : (
				<DataTable
					columns={columns}
					data={list.data?.discounts.map((d) => ({
						...d,
						value: d.discountPercent,
					}))}
					isLoading={list.isLoading}
					getRowId={(r) => r.id}
					empty="No organization discounts."
				/>
			)}
		</Section>
	);
}

export function ScoreMultipliersPanel() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const list = api.useQuery("get", "/admin/routing-score-multipliers");
	const listError: unknown = list.error;
	const done = (message: string) => () => {
		toast.success(message);
		void invalidate("/admin/routing-score-multipliers");
	};
	const create = api.useMutation("post", "/admin/routing-score-multipliers", {
		onSuccess: done("Multiplier added"),
	});
	const remove = api.useMutation(
		"delete",
		"/admin/routing-score-multipliers/{multiplierId}",
		{ onSuccess: done("Multiplier removed") },
	);
	const columns = policyColumns({
		valueLabel: "Price adjustment",
		canDelete: (row) =>
			can("DELETE", `/admin/routing-score-multipliers/${row.id}`),
		onDelete: (row) =>
			remove.mutateAsync({ params: { path: { multiplierId: row.id } } }),
	});

	return (
		<Section
			title="Routing score multipliers"
			description="Adjust the price the router sees for a provider or model. Negative values make it more attractive; customers are billed normally."
			actions={
				<AddPolicyDialog
					title="Add routing multiplier"
					valueLabel="Adjustment %"
					valueHint="-100 to +∞. -20 makes the router treat it as 20% cheaper."
					min={-100}
					max={10000}
					disabled={!can("POST", "/admin/routing-score-multipliers")}
					onSave={({ provider, model, value, expiresAt, reason }) =>
						create.mutateAsync({
							body: {
								provider,
								model,
								scoreMultiplier: value,
								expiresAt,
								reason: reason || null,
							},
						})
					}
				/>
			}
		>
			{listError ? (
				<ErrorState error={listError} />
			) : (
				<DataTable
					columns={columns}
					data={list.data?.multipliers.map((m) => ({
						...m,
						organizationId: null,
						value: m.scoreMultiplier,
					}))}
					isLoading={list.isLoading}
					getRowId={(r) => r.id}
					empty="No multipliers."
				/>
			)}
		</Section>
	);
}
