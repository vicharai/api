"use client";

import { Download, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
	Pager,
	SimpleSelect,
	StatusBadge,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useApi, useFetchClient } from "@/lib/fetch-client";
import {
	downloadBlob,
	errorMessage,
	formatDateTime,
	formatUsd,
} from "@/lib/utils";

import { Button, Input, Label } from "@llmgateway/shared/components";

import type { LedgerTransaction } from "@/lib/api/admin-types";
import type { Route } from "next";

const PAGE = 50;

export const TRANSACTION_TYPES = [
	"credit_topup",
	"credit_refund",
	"credit_gift",
	"credit_adjustment",
	"credit_manual_payment",
	"promo_credit",
	"signup_bonus",
	"enterprise_license_fee",
	"subscription_start",
	"subscription_cancel",
	"subscription_end",
	"end_user_topup",
	"end_user_refund",
	"end_user_bonus",
	"end_user_margin_accrual",
	"end_user_margin_payout",
] as const;

export const LEDGER_FILTER_DEFAULTS = {
	txType: "all",
	txStatus: "all",
	txFrom: "",
	txTo: "",
	txMin: "",
	txMax: "",
	txOffset: "0",
};

export type LedgerFilters = typeof LEDGER_FILTER_DEFAULTS;

const AMOUNT = /^-?\d+(\.\d+)?$/;

export function typeLabel(type: string) {
	return type.replace(/_/g, " ");
}

/** Ledger query built from URL filter state. */
export function ledgerQuery(filters: LedgerFilters, organizationId?: string) {
	return {
		type: filters.txType === "all" ? undefined : filters.txType,
		status: filters.txStatus === "all" ? undefined : filters.txStatus,
		organizationId,
		from: filters.txFrom ? `${filters.txFrom}T00:00:00.000Z` : undefined,
		to: filters.txTo ? `${filters.txTo}T23:59:59.999Z` : undefined,
		minAmount: AMOUNT.test(filters.txMin) ? Number(filters.txMin) : undefined,
		maxAmount: AMOUNT.test(filters.txMax) ? Number(filters.txMax) : undefined,
	};
}

export function hasLedgerFilters(filters: LedgerFilters) {
	return (
		filters.txType !== "all" ||
		filters.txStatus !== "all" ||
		filters.txFrom !== "" ||
		filters.txTo !== "" ||
		filters.txMin !== "" ||
		filters.txMax !== ""
	);
}

export function LedgerToolbar({
	filters,
	setFilters,
	children,
}: {
	filters: LedgerFilters;
	setFilters: (patch: Partial<LedgerFilters>) => void;
	children?: React.ReactNode;
}) {
	const update = (patch: Partial<LedgerFilters>) =>
		setFilters({ ...patch, txOffset: "0" });

	return (
		<Toolbar>
			<SimpleSelect
				ariaLabel="Type"
				value={filters.txType}
				onChange={(txType) => update({ txType })}
				options={[
					{ value: "all", label: "Any type" },
					...TRANSACTION_TYPES.map((t) => ({ value: t, label: typeLabel(t) })),
				]}
			/>
			<SimpleSelect
				ariaLabel="Status"
				value={filters.txStatus}
				onChange={(txStatus) => update({ txStatus })}
				options={[
					{ value: "all", label: "Any status" },
					{ value: "completed", label: "Completed" },
					{ value: "pending", label: "Pending" },
					{ value: "failed", label: "Failed" },
				]}
			/>
			<div className="flex items-center gap-1.5">
				<Label htmlFor="tx-from" className="text-xs text-muted-foreground">
					Date
				</Label>
				<Input
					id="tx-from"
					type="date"
					className="h-9 w-36"
					value={filters.txFrom}
					onChange={(e) => update({ txFrom: e.target.value })}
				/>
				<span className="text-muted-foreground">–</span>
				<Input
					aria-label="To date"
					type="date"
					className="h-9 w-36"
					value={filters.txTo}
					onChange={(e) => update({ txTo: e.target.value })}
				/>
			</div>
			<div className="flex items-center gap-1.5">
				<Label htmlFor="tx-min" className="text-xs text-muted-foreground">
					Credits
				</Label>
				<Input
					id="tx-min"
					inputMode="decimal"
					className="h-9 w-24"
					placeholder="min"
					value={filters.txMin}
					onChange={(e) => update({ txMin: e.target.value })}
				/>
				<span className="text-muted-foreground">–</span>
				<Input
					aria-label="Maximum credits"
					inputMode="decimal"
					className="h-9 w-24"
					placeholder="max"
					value={filters.txMax}
					onChange={(e) => update({ txMax: e.target.value })}
				/>
			</div>
			{hasLedgerFilters(filters) ? (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setFilters(LEDGER_FILTER_DEFAULTS)}
				>
					<X /> Clear
				</Button>
			) : null}
			{children ? <div className="ml-auto flex gap-2">{children}</div> : null}
		</Toolbar>
	);
}

/** Downloads the filtered ledger from the API's CSV endpoint. */
export function LedgerCsvButton({
	query,
	filename,
}: {
	query: ReturnType<typeof ledgerQuery>;
	filename: string;
}) {
	const fetchClient = useFetchClient();
	const [pending, setPending] = useState(false);

	async function download() {
		setPending(true);
		try {
			const { data, error } = await fetchClient.GET("/admin/transactions.csv", {
				params: { query },
				parseAs: "blob",
			});
			if (error || !data) {
				throw new Error(error ? errorMessage(error) : "Export failed");
			}
			downloadBlob(filename, data);
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setPending(false);
		}
	}

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={pending}
			onClick={() => void download()}
		>
			{pending ? <Loader2 className="animate-spin" /> : <Download />}
			Export CSV
		</Button>
	);
}

/** Paged ledger table driven by URL filters; scoped to one org when given. */
export function LedgerTable({
	organizationId,
	csvFilename = "transactions.csv",
}: {
	organizationId?: string;
	csvFilename?: string;
}) {
	const api = useApi();
	const [filters, setFilters] = useUrlFilters(LEDGER_FILTER_DEFAULTS);
	const offset = Math.max(0, Number(filters.txOffset) || 0);
	const query = ledgerQuery(useDebouncedValue(filters, 250), organizationId);
	const list = api.useQuery("get", "/admin/transactions", {
		params: { query: { ...query, limit: PAGE, offset } },
	});
	const listError: unknown = list.error;

	const columns: ColumnDef<LedgerTransaction>[] = [
		{
			accessorKey: "createdAt",
			header: "Date",
			cell: ({ row }) => formatDateTime(row.original.createdAt),
		},
		...(organizationId
			? []
			: [
					{
						accessorKey: "organizationName",
						header: "Organization",
						cell: ({ row }: { row: { original: LedgerTransaction } }) => (
							<Link
								href={
									`/organizations/${row.original.organizationId}?tab=transactions` as Route
								}
								className="font-medium hover:underline"
								onClick={(e) => e.stopPropagation()}
							>
								{row.original.organizationName}
							</Link>
						),
					} satisfies ColumnDef<LedgerTransaction>,
				]),
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => (
				<Tone tone="muted">{typeLabel(row.original.type)}</Tone>
			),
		},
		{
			accessorKey: "amount",
			header: "Paid",
			cell: ({ row }) =>
				row.original.amount !== null
					? `${formatUsd(row.original.amount)}${row.original.currency && row.original.currency !== "USD" ? ` ${row.original.currency}` : ""}`
					: "—",
		},
		{
			accessorKey: "creditAmount",
			header: "Credits",
			cell: ({ row }) => (
				<span
					className={
						(row.original.creditAmount ?? 0) < 0
							? "text-destructive"
							: undefined
					}
				>
					{formatUsd(row.original.creditAmount)}
				</span>
			),
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
					{row.original.paymentMethod ? ` · ${row.original.paymentMethod}` : ""}
				</div>
			),
		},
	];

	return (
		<>
			<LedgerToolbar filters={filters} setFilters={setFilters}>
				<LedgerCsvButton query={query} filename={csvFilename} />
			</LedgerToolbar>
			{listError ? (
				<ErrorState error={listError} />
			) : (
				<>
					<DataTable
						columns={columns}
						data={list.data?.transactions}
						isLoading={list.isLoading}
						getRowId={(t) => t.id}
						empty="No transactions match."
					/>
					{list.data ? (
						<Pager
							offset={offset}
							limit={PAGE}
							total={list.data.total}
							onChange={(next) => setFilters({ txOffset: String(next) })}
						/>
					) : null}
				</>
			)}
		</>
	);
}
