"use client";

import { Pencil, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
	Pager,
	SimpleSelect,
	StatusBadge,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime, formatUsd } from "@/lib/utils";

import { Button, Input, Label } from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";

type Txn =
	ApiData<"/admin/organizations/{orgId}/transactions">["transactions"][number];
type DealMethod = "wire" | "crypto" | "other";

const PAGE = 50;

export function OrgTransactionsTab({ orgId }: { orgId: string }) {
	const api = useApi();
	const [offset, setOffset] = useState(0);
	const txns = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/transactions",
		{ params: { path: { orgId }, query: { limit: PAGE, offset } } },
	);

	const columns: ColumnDef<Txn>[] = [
		{
			accessorKey: "createdAt",
			header: "Date",
			cell: ({ row }) => formatDateTime(row.original.createdAt),
		},
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => <Tone tone="muted">{row.original.type}</Tone>,
		},
		{
			accessorKey: "amount",
			header: "Paid",
			cell: ({ row }) =>
				row.original.amount
					? `${formatUsd(row.original.amount)} ${row.original.currency !== "USD" ? row.original.currency : ""}`
					: "—",
		},
		{
			accessorKey: "creditAmount",
			header: "Credits",
			cell: ({ row }) => formatUsd(row.original.creditAmount),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			accessorKey: "description",
			header: "Description",
			cell: ({ row }) => (
				<div className="max-w-xs truncate text-xs text-muted-foreground">
					{row.original.description ?? "—"}
					{row.original.externalReference
						? ` · ref ${row.original.externalReference}`
						: ""}
					{row.original.refundability &&
					Number(row.original.refundability.refundedAmount) > 0
						? ` · refunded ${formatUsd(row.original.refundability.refundedAmount)}`
						: ""}
				</div>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex justify-end gap-1">
					{row.original.type === "enterprise_deal" ? (
						<DealDialog orgId={orgId} txn={row.original} />
					) : null}
					{row.original.refundability?.refundable ? (
						<RefundDialog orgId={orgId} txn={row.original} />
					) : null}
				</div>
			),
		},
	];

	return (
		<Section title="Transactions" actions={<DealDialog orgId={orgId} />}>
			<QueryState query={txns}>
				{(data) => (
					<>
						<DataTable
							columns={columns}
							data={data.transactions}
							getRowId={(t) => t.id}
							empty="No transactions."
						/>
						<Pager
							offset={offset}
							limit={PAGE}
							total={data.total}
							onChange={setOffset}
						/>
					</>
				)}
			</QueryState>
		</Section>
	);
}

function RefundDialog({ orgId, txn }: { orgId: string; txn: Txn }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const refundable = txn.refundability?.refundableAmount ?? "0";
	const [amount, setAmount] = useState("");
	const refund = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/transactions/{transactionId}/refund",
		{
			onSuccess: (res) => {
				toast.success(`Refund of ${formatUsd(res.amount)} issued`);
				setAmount("");
				void invalidate("/admin/organizations");
			},
		},
	);

	return (
		<ConfirmAction
			title="Refund payment"
			description={`Refunds through the payment provider and deducts the matching credits. Up to ${formatUsd(refundable)} is refundable.`}
			confirmLabel="Refund"
			destructive
			confirmDisabled={
				amount !== "" &&
				!(Number(amount) > 0 && Number(amount) <= Number(refundable))
			}
			extra={
				<div className="space-y-1.5">
					<Label htmlFor="refund-amount">Amount (empty = full)</Label>
					<Input
						id="refund-amount"
						type="number"
						step="0.01"
						min={0.01}
						max={Number(refundable)}
						placeholder={refundable}
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
					/>
				</div>
			}
			onConfirm={(reason) =>
				refund.mutateAsync({
					params: { path: { orgId, transactionId: txn.id } },
					body: { reason, amount: amount ? Number(amount) : undefined },
				})
			}
		>
			<Button
				size="sm"
				variant="outline"
				disabled={
					!can(
						"POST",
						`/admin/organizations/${orgId}/transactions/${txn.id}/refund`,
					)
				}
			>
				<Undo2 /> Refund
			</Button>
		</ConfirmAction>
	);
}

function DealDialog({ orgId, txn }: { orgId: string; txn?: Txn }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [form, setForm] = useState({
		amount: txn?.amount ?? "",
		method: (txn?.paymentMethod as DealMethod | null) ?? "wire",
		date: txn?.createdAt.slice(0, 10) ?? "",
		reference: txn?.externalReference ?? "",
	});
	const onSuccess = (res: { message: string }) => {
		toast.success(res.message);
		void invalidate("/admin/organizations");
	};
	const create = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/enterprise-deals",
		{ onSuccess },
	);
	const update = api.useMutation(
		"patch",
		"/admin/organizations/{orgId}/enterprise-deals/{transactionId}",
		{ onSuccess },
	);

	const body = (comment: string) => ({
		amount: Number(form.amount),
		paymentMethod: form.method,
		transactionDate: form.date || undefined,
		externalReference: form.reference || undefined,
		comment: comment || undefined,
	});

	return (
		<ConfirmAction
			title={txn ? "Edit enterprise deal" : "Record enterprise deal"}
			description="Contract revenue paid outside the checkout. Counts as enterprise revenue; it does not add credits."
			confirmLabel={txn ? "Save" : "Record"}
			requireReason={false}
			confirmDisabled={!(Number(form.amount) > 0)}
			extra={
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1.5">
						<Label htmlFor="deal-amount">Amount (USD)</Label>
						<Input
							id="deal-amount"
							type="number"
							step="0.01"
							value={form.amount}
							onChange={(e) =>
								setForm((f) => ({ ...f, amount: e.target.value }))
							}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Method</Label>
						<SimpleSelect
							className="w-full"
							value={form.method}
							onChange={(method) => setForm((f) => ({ ...f, method }))}
							options={[
								{ value: "wire", label: "Wire" },
								{ value: "crypto", label: "Crypto" },
								{ value: "other", label: "Other" },
							]}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="deal-date">Date</Label>
						<Input
							id="deal-date"
							type="date"
							value={form.date}
							onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="deal-ref">Reference</Label>
						<Input
							id="deal-ref"
							value={form.reference}
							onChange={(e) =>
								setForm((f) => ({ ...f, reference: e.target.value }))
							}
						/>
					</div>
				</div>
			}
			onConfirm={(comment) =>
				txn
					? update.mutateAsync({
							params: { path: { orgId, transactionId: txn.id } },
							body: body(comment),
						})
					: create.mutateAsync({
							params: { path: { orgId } },
							body: body(comment),
						})
			}
		>
			<Button
				size="sm"
				variant={txn ? "ghost" : "outline"}
				disabled={
					!can("POST", `/admin/organizations/${orgId}/enterprise-deals`)
				}
			>
				{txn ? <Pencil /> : <Plus />}
				{txn ? "Edit" : "Enterprise deal"}
			</Button>
		</ConfirmAction>
	);
}
