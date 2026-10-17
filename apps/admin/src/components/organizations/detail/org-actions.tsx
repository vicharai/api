"use client";

import {
	Ban,
	ChevronDown,
	CircleDollarSign,
	Gift,
	Landmark,
	PowerOff,
	ShieldAlert,
	ShieldOff,
	Unlock,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { SendEmailDialog } from "@/components/support/send-email-dialog";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatUsd } from "@/lib/utils";

import {
	Button,
	Checkbox,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	Input,
	Label,
} from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";

type Org = ApiData<"/admin/organizations/{orgId}">["organization"];

function AmountField({
	value,
	onChange,
	label = "Amount (USD)",
	allowNegative = false,
}: {
	value: string;
	onChange: (value: string) => void;
	label?: string;
	allowNegative?: boolean;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor="amount">{label}</Label>
			<Input
				id="amount"
				type="number"
				step="0.01"
				min={allowNegative ? undefined : 0.01}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={allowNegative ? "e.g. 25 or -10" : "e.g. 25"}
			/>
		</div>
	);
}

export function OrgActions({ org }: { org: Org }) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const orgId = org.id;
	const path = { orgId };
	const base = `/admin/organizations/${orgId}`;

	const refresh = () => invalidate("/admin/organizations", "/admin/users");
	const ok = (message: string) => () => {
		toast.success(message);
		void refresh();
	};

	const [adjust, setAdjust] = useState("");
	const [gift, setGift] = useState("");
	const [manual, setManual] = useState({
		amount: "",
		method: "wire" as "wire" | "crypto" | "paypal" | "other",
		reference: "",
	});
	const [reactivateMembers, setReactivateMembers] = useState(true);
	const [dialog, setDialog] = useState<
		"gift" | "manual" | "topup" | "risk" | "status" | null
	>(null);
	const [status, setStatus] = useState<"active" | "inactive" | "deleted">(
		(org.status as "active" | "inactive" | "deleted" | null) ?? "active",
	);

	const credits = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/credits",
		{
			onSuccess: (res) => {
				toast.success(`Balance is now ${formatUsd(res.credits)}`);
				setAdjust("");
				void refresh();
			},
		},
	);
	const giftCredits = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/gift-credits",
		{
			onSuccess: (res) => {
				toast.success(`Gifted. Balance is now ${formatUsd(res.credits)}`);
				setGift("");
				void refresh();
			},
		},
	);
	const manualCredits = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/manual-credits",
		{
			onSuccess: (res) => {
				toast.success(`Payment recorded. Balance ${formatUsd(res.credits)}`);
				setManual({ amount: "", method: "wire", reference: "" });
				void refresh();
			},
		},
	);
	const block = api.useMutation("post", "/admin/organizations/{orgId}/block", {
		onSuccess: ok("Organization blocked"),
	});
	const unblock = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/unblock",
		{
			onSuccess: (res) => {
				toast.success(
					`Organization unblocked${res.reactivatedMembers ? `, ${res.reactivatedMembers} member(s) reactivated` : ""}`,
				);
				void refresh();
			},
		},
	);
	const setOrgStatus = api.useMutation(
		"patch",
		"/admin/organizations/{orgId}/status",
		{ onSuccess: ok("Status updated") },
	);
	const riskFlag = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/risk-flag",
		{ onSuccess: ok("Risk flag updated") },
	);
	const disableTopUp = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/auto-top-up/disable",
		{ onSuccess: ok("Auto top-up disabled") },
	);

	const blocked = org.status === "inactive" || org.status === "deleted";
	const adjustValue = Number(adjust);
	const giftValue = Number(gift);
	const manualValue = Number(manual.amount);

	return (
		<>
			<SendEmailDialog to={org.ownerEmail ?? org.billingEmail} />

			<ConfirmAction
				title="Adjust credits"
				description={`Current balance ${formatUsd(org.credits)}. Positive adds, negative deducts. Recorded as a credit adjustment transaction.`}
				confirmLabel="Apply"
				confirmDisabled={!adjustValue}
				extra={
					<AmountField value={adjust} onChange={setAdjust} allowNegative />
				}
				onConfirm={(reason) =>
					credits.mutateAsync({
						params: { path },
						body: { creditAmount: adjustValue, reason },
					})
				}
			>
				<Button
					size="sm"
					variant="outline"
					disabled={!can("POST", `${base}/credits`)}
				>
					<CircleDollarSign /> Credits
				</Button>
			</ConfirmAction>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="sm" variant="outline">
						More <ChevronDown />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuLabel>Billing</DropdownMenuLabel>
					<DropdownMenuItem
						onSelect={() => setDialog("gift")}
						disabled={!can("POST", `${base}/gift-credits`)}
					>
						<Gift className="mr-2 size-4" /> Gift credits
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => setDialog("manual")}
						disabled={!can("POST", `${base}/manual-credits`)}
					>
						<Landmark className="mr-2 size-4" /> Record manual payment
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => setDialog("topup")}
						disabled={!can("POST", `${base}/auto-top-up/disable`)}
					>
						<PowerOff className="mr-2 size-4" /> Disable auto top-up
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuLabel>Risk</DropdownMenuLabel>
					<DropdownMenuItem
						onSelect={() => setDialog("risk")}
						disabled={!can("POST", `${base}/risk-flag`)}
					>
						{org.riskFlagged ? (
							<ShieldOff className="mr-2 size-4" />
						) : (
							<ShieldAlert className="mr-2 size-4" />
						)}
						{org.riskFlagged ? "Clear risk flag" : "Flag as risky"}
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => setDialog("status")}
						disabled={!can("PATCH", `${base}/status`)}
					>
						Set status…
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ConfirmAction
				title="Gift credits"
				description="Free credits, shown to the customer as a gift."
				confirmLabel="Gift"
				requireReason={false}
				confirmDisabled={!(giftValue > 0)}
				extra={<AmountField value={gift} onChange={setGift} />}
				onConfirm={() =>
					giftCredits.mutateAsync({
						params: { path },
						body: { creditAmount: giftValue },
					})
				}
				open={dialog === "gift"}
				onOpenChange={(next) => setDialog(next ? "gift" : null)}
			/>
			<ConfirmAction
				title="Record manual payment"
				description="For wire, crypto or PayPal payments received outside the checkout. Adds the same amount in credits and counts as revenue."
				confirmLabel="Record payment"
				confirmDisabled={!(manualValue > 0)}
				extra={
					<div className="space-y-3">
						<AmountField
							value={manual.amount}
							onChange={(amount) => setManual((m) => ({ ...m, amount }))}
						/>
						<div className="grid grid-cols-2 gap-2">
							<div className="space-y-1.5">
								<Label>Method</Label>
								<SimpleSelect
									className="w-full"
									value={manual.method}
									onChange={(method) => setManual((m) => ({ ...m, method }))}
									options={[
										{ value: "wire", label: "Wire" },
										{ value: "crypto", label: "Crypto" },
										{ value: "paypal", label: "PayPal" },
										{ value: "other", label: "Other" },
									]}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="ext-ref">Reference</Label>
								<Input
									id="ext-ref"
									value={manual.reference}
									onChange={(e) =>
										setManual((m) => ({ ...m, reference: e.target.value }))
									}
								/>
							</div>
						</div>
					</div>
				}
				onConfirm={(reason) =>
					manualCredits.mutateAsync({
						params: { path },
						body: {
							creditAmount: manualValue,
							paymentMethod: manual.method,
							externalReference: manual.reference || undefined,
							comment: reason,
						},
					})
				}
				open={dialog === "manual"}
				onOpenChange={(next) => setDialog(next ? "manual" : null)}
			/>
			<ConfirmAction
				title="Disable auto top-up"
				description="Stops automatic card charges for this organization until the customer re-enables them."
				confirmLabel="Disable"
				destructive
				onConfirm={(reason) =>
					disableTopUp.mutateAsync({ params: { path }, body: { reason } })
				}
				open={dialog === "topup"}
				onOpenChange={(next) => setDialog(next ? "topup" : null)}
			/>
			<ConfirmAction
				title={org.riskFlagged ? "Clear risk flag" : "Flag as risky"}
				description={
					org.riskFlagged
						? "Removes the manual risk flag."
						: "Marks the organization for review. Flagged orgs show up in Issues."
				}
				confirmLabel={org.riskFlagged ? "Clear flag" : "Flag"}
				destructive={!org.riskFlagged}
				onConfirm={(reason) =>
					riskFlag.mutateAsync({
						params: { path },
						body: { flagged: !org.riskFlagged, reason },
					})
				}
				open={dialog === "risk"}
				onOpenChange={(next) => setDialog(next ? "risk" : null)}
			/>
			<ConfirmAction
				title="Set status"
				description="Low-level status change. Prefer Block/Unblock, which also handles members and subscriptions."
				confirmLabel="Set status"
				destructive={status !== "active"}
				extra={
					<SimpleSelect
						className="w-full"
						value={status}
						onChange={setStatus}
						options={[
							{ value: "active", label: "Active" },
							{ value: "inactive", label: "Inactive" },
							{ value: "deleted", label: "Deleted" },
						]}
					/>
				}
				onConfirm={() =>
					setOrgStatus.mutateAsync({ params: { path }, body: { status } })
				}
				open={dialog === "status"}
				onOpenChange={(next) => setDialog(next ? "status" : null)}
			/>

			{blocked ? (
				<ConfirmAction
					title="Unblock organization"
					description="Reactivates the organization so its keys work again."
					confirmLabel="Unblock"
					extra={
						<label className="flex items-center gap-2 text-sm">
							<Checkbox
								checked={reactivateMembers}
								onCheckedChange={(v) => setReactivateMembers(v === true)}
							/>
							Also reactivate members deactivated by the block
						</label>
					}
					onConfirm={() =>
						unblock.mutateAsync({
							params: { path },
							body: { reactivateMembers },
						})
					}
				>
					<Button size="sm" disabled={!can("POST", `${base}/unblock`)}>
						<Unlock /> Unblock
					</Button>
				</ConfirmAction>
			) : (
				<ConfirmAction
					title="Block organization"
					description="Deactivates the organization and its members, cancels subscriptions and ends their sessions. API keys stop working immediately."
					confirmLabel="Block"
					destructive
					onConfirm={(reason) =>
						block.mutateAsync({ params: { path }, body: { reason } })
					}
				>
					<Button
						size="sm"
						variant="destructive"
						disabled={!can("POST", `${base}/block`)}
					>
						<Ban /> Block
					</Button>
				</ConfirmAction>
			)}
		</>
	);
}
