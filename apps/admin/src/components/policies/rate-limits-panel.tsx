"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { ErrorState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDate } from "@/lib/utils";

import { Button, Input, Label } from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import { TargetPicker, targetLabel } from "./target-picker";

import type { RateLimitRow } from "@/lib/api/pending-paths";

interface FormState {
	provider: string | null;
	model: string | null;
	limitType: "rpm" | "rpd";
	maxRequests: string;
	enforcement: "per_org" | "global";
}

function toForm(row?: RateLimitRow): FormState {
	return {
		provider: row?.provider ?? null,
		model: row?.model ?? null,
		limitType: row?.limitType ?? "rpm",
		maxRequests: row ? String(row.maxRequests) : "",
		enforcement: row?.enforcement ?? "per_org",
	};
}

/** Rate limits for one organization, or the global ones when `orgId` is unset. */
export function RateLimitsPanel({ orgId }: { orgId?: string }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const isOrg = Boolean(orgId);
	const orgPath = { orgId: orgId ?? "" };
	const base = isOrg
		? `/admin/organizations/${orgId}/rate-limits`
		: "/admin/rate-limits";

	const globalList = api.useQuery("get", "/admin/rate-limits", undefined, {
		enabled: !isOrg,
	});
	const orgList = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/rate-limits",
		{ params: { path: orgPath } },
		{ enabled: isOrg },
	);
	const list = isOrg ? orgList : globalList;
	const listError: unknown = list.error;

	const done = (message: string) => () => {
		toast.success(message);
		void invalidate("/admin/rate-limits", "/admin/organizations");
	};
	const createGlobal = api.useMutation("post", "/admin/rate-limits", {
		onSuccess: done("Rate limit created"),
	});
	const createOrg = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/rate-limits",
		{ onSuccess: done("Rate limit created") },
	);
	const updateGlobal = api.useMutation(
		"put",
		"/admin/rate-limits/{rateLimitId}",
		{
			onSuccess: done("Rate limit updated"),
		},
	);
	const updateOrg = api.useMutation(
		"put",
		"/admin/organizations/{orgId}/rate-limits/{rateLimitId}",
		{ onSuccess: done("Rate limit updated") },
	);
	const deleteGlobal = api.useMutation(
		"delete",
		"/admin/rate-limits/{rateLimitId}",
		{ onSuccess: done("Rate limit removed") },
	);
	const deleteOrg = api.useMutation(
		"delete",
		"/admin/organizations/{orgId}/rate-limits/{rateLimitId}",
		{ onSuccess: done("Rate limit removed") },
	);

	async function save(form: FormState, reason: string, id?: string) {
		const body = {
			provider: form.provider,
			model: form.model,
			limitType: form.limitType,
			maxRequests: Math.trunc(Number(form.maxRequests)),
			reason: reason || null,
			...(isOrg ? {} : { enforcement: form.enforcement }),
		};
		if (id) {
			await (isOrg
				? updateOrg.mutateAsync({
						params: { path: { ...orgPath, rateLimitId: id } },
						body,
					})
				: updateGlobal.mutateAsync({
						params: { path: { rateLimitId: id } },
						body,
					}));
		} else {
			await (isOrg
				? createOrg.mutateAsync({ params: { path: orgPath }, body })
				: createGlobal.mutateAsync({ body }));
		}
	}

	const columns: ColumnDef<RateLimitRow>[] = [
		{
			id: "target",
			header: "Applies to",
			cell: ({ row }) => targetLabel(row.original.provider, row.original.model),
		},
		{
			accessorKey: "maxRequests",
			header: "Limit",
			cell: ({ row }) => (
				<span className="tabular-nums">
					{formatNumber(row.original.maxRequests)} /{" "}
					{row.original.limitType === "rpm" ? "min" : "day"}
				</span>
			),
		},
		...(isOrg
			? []
			: [
					{
						accessorKey: "enforcement",
						header: "Enforcement",
						cell: ({ row }) => (
							<Tone
								tone={row.original.enforcement === "global" ? "warn" : "muted"}
							>
								{row.original.enforcement === "global"
									? "shared by everyone"
									: "per org"}
							</Tone>
						),
					} satisfies ColumnDef<RateLimitRow>,
				]),
		{
			accessorKey: "reason",
			header: "Reason",
			cell: ({ row }) => (
				<span className="text-xs text-muted-foreground">
					{row.original.reason ?? "—"}
				</span>
			),
		},
		{
			accessorKey: "updatedAt",
			header: "Updated",
			cell: ({ row }) => formatDate(row.original.updatedAt),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex justify-end gap-1">
					<RateLimitDialog
						isOrg={isOrg}
						row={row.original}
						disabled={!can("PUT", `${base}/${row.original.id}`)}
						onSave={(form, reason) => save(form, reason, row.original.id)}
					/>
					<ConfirmAction
						title="Remove rate limit"
						description={targetLabel(row.original.provider, row.original.model)}
						confirmLabel="Remove"
						destructive
						onConfirm={() =>
							isOrg
								? deleteOrg.mutateAsync({
										params: {
											path: { ...orgPath, rateLimitId: row.original.id },
										},
									})
								: deleteGlobal.mutateAsync({
										params: { path: { rateLimitId: row.original.id } },
									})
						}
					>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Remove"
							disabled={!can("DELETE", `${base}/${row.original.id}`)}
						>
							<Trash2 />
						</Button>
					</ConfirmAction>
				</div>
			),
		},
	];

	return (
		<Section
			title={isOrg ? "Organization rate limits" : "Global rate limits"}
			description={
				isOrg
					? "Override the default request rate for this organization."
					: "Per-org limits apply to every organization separately; global limits are one shared bucket."
			}
			actions={
				<RateLimitDialog
					isOrg={isOrg}
					disabled={!can("POST", base)}
					onSave={(form, reason) => save(form, reason)}
				/>
			}
		>
			{listError ? (
				<ErrorState error={listError} />
			) : (
				<DataTable
					columns={columns}
					data={list.data?.rateLimits}
					isLoading={list.isLoading}
					getRowId={(r) => r.id}
					empty="No rate limits."
				/>
			)}
		</Section>
	);
}

function RateLimitDialog({
	isOrg,
	row,
	disabled,
	onSave,
}: {
	isOrg: boolean;
	row?: RateLimitRow;
	disabled?: boolean;
	onSave: (form: FormState, reason: string) => Promise<void>;
}) {
	const [form, setForm] = useState<FormState>(() => toForm(row));
	const valid =
		form.maxRequests !== "" &&
		Number.isInteger(Number(form.maxRequests)) &&
		Number(form.maxRequests) >= 0;

	return (
		<ConfirmAction
			title={row ? "Edit rate limit" : "Add rate limit"}
			confirmLabel={row ? "Save" : "Add"}
			confirmDisabled={!valid}
			extra={
				<div className="space-y-3">
					<TargetPicker
						provider={form.provider}
						model={form.model}
						onChange={(t) => setForm((f) => ({ ...f, ...t }))}
					/>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="rl-max">Max requests</Label>
							<Input
								id="rl-max"
								type="number"
								min={0}
								value={form.maxRequests}
								onChange={(e) =>
									setForm((f) => ({ ...f, maxRequests: e.target.value }))
								}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Per</Label>
							<SimpleSelect
								className="w-full"
								value={form.limitType}
								onChange={(limitType) => setForm((f) => ({ ...f, limitType }))}
								options={[
									{ value: "rpm", label: "Minute" },
									{ value: "rpd", label: "Day" },
								]}
							/>
						</div>
						{isOrg ? null : (
							<div className="col-span-2 space-y-1.5">
								<Label>Enforcement</Label>
								<SimpleSelect
									className="w-full"
									value={form.enforcement}
									onChange={(enforcement) =>
										setForm((f) => ({ ...f, enforcement }))
									}
									options={[
										{ value: "per_org", label: "Per organization" },
										{ value: "global", label: "One shared bucket" },
									]}
								/>
							</div>
						)}
					</div>
				</div>
			}
			onConfirm={(reason) => onSave(form, reason)}
		>
			{row ? (
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label="Edit"
					disabled={disabled}
				>
					<Pencil />
				</Button>
			) : (
				<Button size="sm" variant="outline" disabled={disabled}>
					<Plus /> Add limit
				</Button>
			)}
		</ConfirmAction>
	);
}
