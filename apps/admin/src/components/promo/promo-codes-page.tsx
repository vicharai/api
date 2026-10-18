"use client";

import { Dices, Loader2, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import {
	SearchInput,
	SimpleSelect,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { CopyIdButton } from "@/components/ui/copy-id-button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { PageHeader, QueryState } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDate, formatDateTime, formatUsd } from "@/lib/utils";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	Switch,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { PromoCode } from "@/lib/api/admin-types";
import type { Route } from "next";

const CODE = /^[A-Z0-9][A-Z0-9_-]{3,31}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode() {
	const bytes = new Uint8Array(10);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function promoState(code: PromoCode) {
	if (!code.active) {
		return { label: "inactive", tone: "muted" } as const;
	}
	if (code.expiresAt && new Date(code.expiresAt) < new Date()) {
		return { label: "expired", tone: "warn" } as const;
	}
	if (
		code.maxRedemptions !== null &&
		code.redemptionCount >= code.maxRedemptions
	) {
		return { label: "exhausted", tone: "warn" } as const;
	}
	return { label: "active", tone: "good" } as const;
}

/** Date input value (local day) ↔ ISO end of day. */
function dayToIso(day: string) {
	return day ? new Date(`${day}T23:59:59`).toISOString() : undefined;
}
function isoToDay(iso: string | null) {
	return iso ? iso.slice(0, 10) : "";
}

export function PromoCodesPage() {
	const api = useApi();
	const can = useCan();
	const list = api.useQuery("get", "/admin/promo-codes");
	const [query, setQuery] = useState("");
	const [state, setState] = useState("all");
	const [dialog, setDialog] = useState<PromoCode | "new" | null>(null);
	const [redemptions, setRedemptions] = useState<PromoCode | null>(null);

	const columns: ColumnDef<PromoCode>[] = [
		{
			accessorKey: "code",
			header: "Code",
			cell: ({ row }) => (
				<span className="inline-flex items-center gap-1 font-mono font-medium">
					{row.original.code}
					<CopyIdButton value={row.original.code} label="code" />
				</span>
			),
		},
		{
			accessorKey: "amount",
			header: "Credit",
			cell: ({ row }) => formatUsd(row.original.amount),
		},
		{
			accessorKey: "redemptionCount",
			header: "Redeemed",
			cell: ({ row }) => (
				<button
					type="button"
					className="tabular-nums hover:underline"
					onClick={(e) => {
						e.stopPropagation();
						setRedemptions(row.original);
					}}
				>
					{formatNumber(row.original.redemptionCount)}
					{row.original.maxRedemptions !== null
						? ` / ${formatNumber(row.original.maxRedemptions)}`
						: ""}
				</button>
			),
		},
		{
			accessorKey: "perOrgLimit",
			header: "Per org",
		},
		{
			accessorKey: "expiresAt",
			header: "Expires",
			cell: ({ row }) => formatDate(row.original.expiresAt),
		},
		{
			id: "state",
			header: "Status",
			cell: ({ row }) => {
				const s = promoState(row.original);
				return <Tone tone={s.tone}>{s.label}</Tone>;
			},
		},
		{
			accessorKey: "createdAt",
			header: "Created",
			cell: ({ row }) => (
				<div className="text-xs">
					{formatDate(row.original.createdAt)}
					<div className="text-muted-foreground">
						{row.original.createdByEmail ?? ""}
					</div>
				</div>
			),
		},
		{
			id: "actions",
			header: "",
			enableSorting: false,
			cell: ({ row }) => (
				<div className="flex justify-end">
					<Button
						size="sm"
						variant="ghost"
						disabled={!can("PATCH", `/admin/promo-codes/${row.original.id}`)}
						onClick={(e) => {
							e.stopPropagation();
							setDialog(row.original);
						}}
					>
						<Pencil /> Edit
					</Button>
				</div>
			),
		},
	];

	const q = query.trim().toUpperCase();

	return (
		<>
			<PageHeader
				title="Promo codes"
				description="Codes customers redeem on the billing page for free credits."
				actions={
					<Button
						size="sm"
						disabled={!can("POST", "/admin/promo-codes")}
						onClick={() => setDialog("new")}
					>
						<Plus /> New code
					</Button>
				}
			/>
			<Toolbar>
				<SearchInput value={query} onChange={setQuery} placeholder="Code" />
				<SimpleSelect
					ariaLabel="Status"
					value={state}
					onChange={setState}
					options={[
						{ value: "all", label: "Any status" },
						{ value: "active", label: "Active" },
						{ value: "expired", label: "Expired" },
						{ value: "exhausted", label: "Exhausted" },
						{ value: "inactive", label: "Inactive" },
					]}
				/>
			</Toolbar>
			<QueryState query={list}>
				{(data) => (
					<DataTable
						columns={columns}
						data={data.codes.filter(
							(c) =>
								(!q || c.code.includes(q)) &&
								(state === "all" || promoState(c).label === state),
						)}
						getRowId={(c) => c.id}
						onRowClick={setRedemptions}
						empty="No promo codes yet."
					/>
				)}
			</QueryState>
			{dialog ? (
				<PromoDialog
					code={dialog === "new" ? undefined : dialog}
					onClose={() => setDialog(null)}
				/>
			) : null}
			{redemptions ? (
				<RedemptionsSheet
					code={redemptions}
					onClose={() => setRedemptions(null)}
				/>
			) : null}
		</>
	);
}

function PromoDialog({
	code,
	onClose,
}: {
	code?: PromoCode;
	onClose: () => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [form, setForm] = useState({
		code: code?.code ?? randomCode(),
		amount: code ? String(code.amount) : "",
		maxRedemptions:
			code?.maxRedemptions !== null && code?.maxRedemptions !== undefined
				? String(code.maxRedemptions)
				: "",
		perOrgLimit: code ? String(code.perOrgLimit) : "1",
		expires: isoToDay(code?.expiresAt ?? null),
		active: code?.active ?? true,
	});
	const done = (message: string) => () => {
		toast.success(message);
		void invalidate("/admin/promo-codes");
		onClose();
	};
	const create = api.useMutation("post", "/admin/promo-codes", {
		onSuccess: done("Promo code created"),
	});
	const update = api.useMutation("patch", "/admin/promo-codes/{id}", {
		onSuccess: done("Promo code updated"),
	});
	const pending = create.isPending || update.isPending;

	const amount = Number(form.amount);
	const max = form.maxRedemptions === "" ? null : Number(form.maxRedemptions);
	const perOrg = Number(form.perOrgLimit);
	const errors = {
		code:
			!code && !CODE.test(form.code) ? "4–32 chars: A–Z, 0–9, - or _" : null,
		amount:
			!code &&
			!(
				amount > 0 &&
				amount <= 100_000 &&
				/^\d+(\.\d{1,2})?$/.test(form.amount)
			)
				? "Positive amount, at most two decimals"
				: null,
		max:
			max !== null && !(Number.isInteger(max) && max >= 1)
				? "Whole number ≥ 1, or empty for unlimited"
				: null,
		perOrg:
			!code && !(Number.isInteger(perOrg) && perOrg >= 1)
				? "Whole number ≥ 1"
				: null,
	};
	const valid = Object.values(errors).every((e) => e === null);

	function submit() {
		if (code) {
			update.mutate({
				params: { path: { id: code.id } },
				body: {
					active: form.active,
					expiresAt: dayToIso(form.expires) ?? null,
					maxRedemptions: max,
				},
			});
		} else {
			create.mutate({
				body: {
					code: form.code,
					amount,
					maxRedemptions: max ?? undefined,
					perOrgLimit: perOrg,
					expiresAt: dayToIso(form.expires),
				},
			});
		}
	}

	return (
		<Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{code ? `Edit ${code.code}` : "New promo code"}
					</DialogTitle>
					<DialogDescription>
						{code
							? "Amount and per-org limit are fixed once a code exists."
							: "Each redemption adds the credit to the redeeming organization."}
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid) {
							submit();
						}
					}}
				>
					<div className="space-y-1.5">
						<Label htmlFor="promo-code">Code</Label>
						<div className="flex gap-2">
							<Input
								id="promo-code"
								className="font-mono uppercase"
								disabled={Boolean(code)}
								value={form.code}
								onChange={(e) =>
									setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
								}
							/>
							{code ? null : (
								<Button
									type="button"
									variant="outline"
									size="icon"
									aria-label="Generate code"
									onClick={() => setForm((f) => ({ ...f, code: randomCode() }))}
								>
									<Dices />
								</Button>
							)}
						</div>
						{errors.code ? (
							<p className="text-xs text-destructive">{errors.code}</p>
						) : null}
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="promo-amount">Credit (USD)</Label>
							<Input
								id="promo-amount"
								inputMode="decimal"
								disabled={Boolean(code)}
								value={form.amount}
								onChange={(e) =>
									setForm((f) => ({ ...f, amount: e.target.value }))
								}
							/>
							{form.amount && errors.amount ? (
								<p className="text-xs text-destructive">{errors.amount}</p>
							) : null}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="promo-per-org">Uses per org</Label>
							<Input
								id="promo-per-org"
								inputMode="numeric"
								disabled={Boolean(code)}
								value={form.perOrgLimit}
								onChange={(e) =>
									setForm((f) => ({ ...f, perOrgLimit: e.target.value }))
								}
							/>
							{errors.perOrg ? (
								<p className="text-xs text-destructive">{errors.perOrg}</p>
							) : null}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="promo-max">Total redemptions</Label>
							<Input
								id="promo-max"
								inputMode="numeric"
								placeholder="Unlimited"
								value={form.maxRedemptions}
								onChange={(e) =>
									setForm((f) => ({ ...f, maxRedemptions: e.target.value }))
								}
							/>
							{errors.max ? (
								<p className="text-xs text-destructive">{errors.max}</p>
							) : null}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="promo-expires">Expires (end of day)</Label>
							<Input
								id="promo-expires"
								type="date"
								value={form.expires}
								onChange={(e) =>
									setForm((f) => ({ ...f, expires: e.target.value }))
								}
							/>
						</div>
					</div>
					{code ? (
						<label className="flex items-center gap-2 text-sm">
							<Switch
								checked={form.active}
								onCheckedChange={(active) => setForm((f) => ({ ...f, active }))}
							/>
							Active
						</label>
					) : null}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={pending}
							onClick={onClose}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!valid || pending}>
							{pending ? <Loader2 className="animate-spin" /> : null}
							{code ? "Save" : "Create code"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function RedemptionsSheet({
	code,
	onClose,
}: {
	code: PromoCode;
	onClose: () => void;
}) {
	const api = useApi();
	const list = api.useQuery("get", "/admin/promo-codes/{id}/redemptions", {
		params: { path: { id: code.id } },
	});

	return (
		<Sheet open onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-xl">
				<SheetHeader>
					<SheetTitle className="font-mono">{code.code}</SheetTitle>
					<SheetDescription>
						{formatUsd(code.amount)} per redemption ·{" "}
						{formatNumber(code.redemptionCount)} redeemed
					</SheetDescription>
				</SheetHeader>
				<div className="px-4 pb-6">
					<QueryState query={list}>
						{(data) => (
							<DataTable
								data={data.redemptions}
								getRowId={(r) => r.id}
								empty="Not redeemed yet."
								columns={[
									{
										accessorKey: "organizationName",
										header: "Organization",
										cell: ({ row }) => (
											<Link
												href={
													`/organizations/${row.original.organizationId}` as Route
												}
												className="font-medium hover:underline"
											>
												{row.original.organizationName}
											</Link>
										),
									},
									{
										accessorKey: "userEmail",
										header: "By",
										cell: ({ row }) => row.original.userEmail ?? "—",
									},
									{
										accessorKey: "amount",
										header: "Credit",
										cell: ({ row }) => formatUsd(row.original.amount),
									},
									{
										accessorKey: "createdAt",
										header: "When",
										cell: ({ row }) => formatDateTime(row.original.createdAt),
									},
								]}
							/>
						)}
					</QueryState>
				</div>
			</SheetContent>
		</Sheet>
	);
}
