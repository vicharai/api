"use client";

import { ArrowRight, Loader2, Minus, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Segmented, SimpleSelect } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { addMoney } from "@/lib/decimal";
import { useApi } from "@/lib/fetch-client";
import { cn, formatUsd } from "@/lib/utils";

import {
	Button,
	Checkbox,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Input,
	Label,
	Textarea,
} from "@llmgateway/shared/components";

export interface BalanceOrg {
	id: string;
	name: string;
	credits: string | number | null;
}

const MAX_AMOUNT = 100_000;

/**
 * Add or deduct an organization's balance. With `userId` the adjustment goes
 * through the user endpoint and the admin picks one of the user's orgs.
 */
export function AdjustBalanceDialog({
	orgs,
	userId,
	children,
	open: controlledOpen,
	onOpenChange,
}: {
	orgs: BalanceOrg[];
	userId?: string;
	children?: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [localOpen, setLocalOpen] = useState(false);
	const open = controlledOpen ?? localOpen;
	const setOpen = (next: boolean) => {
		setLocalOpen(next);
		onOpenChange?.(next);
	};
	const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
	const [direction, setDirection] = useState<"add" | "deduct">("add");
	const [amount, setAmount] = useState("");
	const [reason, setReason] = useState("");
	const [allowNegative, setAllowNegative] = useState(false);

	const onSuccess = (res: { balance: number }) => {
		toast.success(`Balance is now ${formatUsd(res.balance)}`);
		setAmount("");
		setReason("");
		setAllowNegative(false);
		setOpen(false);
		void invalidate(
			"/admin/organizations",
			"/admin/users",
			"/admin/transactions",
		);
	};
	const forOrg = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/balance-adjustments",
		{ onSuccess },
	);
	const forUser = api.useMutation(
		"post",
		"/admin/users/{userId}/balance-adjustments",
		{ onSuccess },
	);
	const pending = forOrg.isPending || forUser.isPending;

	const org = orgs.find((o) => o.id === orgId);
	const current = Number(org?.credits ?? 0);
	const value = Number(amount);
	const validAmount =
		amount.trim() !== "" &&
		Number.isFinite(value) &&
		value > 0 &&
		value <= MAX_AMOUNT &&
		/^\d+(\.\d{1,2})?$/.test(amount.trim());
	const signed = direction === "add" ? value : -value;
	const resulting = validAmount ? addMoney(current, signed) : current;
	const goesNegative = resulting < 0;
	const reasonValid = reason.trim().length >= 1 && reason.length <= 500;
	const blocked = goesNegative && !allowNegative;

	function submit() {
		if (!org) {
			return;
		}
		const body = {
			amount: signed,
			reason: reason.trim(),
			allowNegative: allowNegative || undefined,
		};
		if (userId) {
			forUser.mutate({
				params: { path: { userId } },
				body: { ...body, organizationId: org.id },
			});
		} else {
			forOrg.mutate({ params: { path: { orgId: org.id } }, body });
		}
	}

	return (
		<Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
			{children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Adjust balance</DialogTitle>
					<DialogDescription>
						Recorded as a credit adjustment with your reason in the audit log.
						Adjustments do not count as revenue or bonus credits.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						if (validAmount && reasonValid && !blocked && org) {
							submit();
						}
					}}
				>
					{orgs.length > 1 ? (
						<div className="space-y-1.5">
							<Label>Organization</Label>
							<SimpleSelect
								className="w-full"
								ariaLabel="Organization"
								value={orgId}
								onChange={setOrgId}
								options={orgs.map((o) => ({
									value: o.id,
									label: `${o.name} · ${formatUsd(o.credits)}`,
								}))}
							/>
						</div>
					) : org ? (
						<p className="text-sm">
							<span className="text-muted-foreground">Organization </span>
							<span className="font-medium">{org.name}</span>
						</p>
					) : (
						<p className="text-sm text-muted-foreground">
							This user has no organization.
						</p>
					)}
					<div className="flex flex-wrap items-end gap-3">
						<Segmented
							ariaLabel="Direction"
							value={direction}
							onChange={setDirection}
							options={[
								{
									value: "add",
									label: (
										<>
											<Plus className="size-3.5" /> Add
										</>
									),
								},
								{
									value: "deduct",
									label: (
										<>
											<Minus className="size-3.5" /> Deduct
										</>
									),
								},
							]}
						/>
						<div className="min-w-32 flex-1 space-y-1.5">
							<Label htmlFor="adjust-amount">Amount (USD)</Label>
							<Input
								id="adjust-amount"
								inputMode="decimal"
								placeholder="e.g. 25.00"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								aria-invalid={amount !== "" && !validAmount}
							/>
						</div>
					</div>
					{amount !== "" && !validAmount ? (
						<p className="text-xs text-destructive">
							Enter a positive amount up to {formatUsd(MAX_AMOUNT)} with at most
							two decimals.
						</p>
					) : null}
					<div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm tabular-nums">
						<span className="text-muted-foreground">Balance</span>
						<span>{formatUsd(current)}</span>
						<ArrowRight className="size-3.5 text-muted-foreground" />
						<span
							className={cn(
								"font-semibold",
								goesNegative && "text-destructive",
							)}
						>
							{formatUsd(resulting)}
						</span>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="adjust-reason">Reason</Label>
						<Textarea
							id="adjust-reason"
							rows={3}
							maxLength={500}
							placeholder="Why is the balance changing? Recorded in the audit log."
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
					<label className="flex items-center gap-2 text-sm">
						<Checkbox
							checked={allowNegative}
							onCheckedChange={(v) => setAllowNegative(v === true)}
						/>
						Allow the balance to go negative
					</label>
					{blocked ? (
						<p className="text-xs text-destructive">
							This would leave a negative balance. Tick the box above to allow
							it.
						</p>
					) : null}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={pending}
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant={direction === "deduct" ? "destructive" : "default"}
							disabled={
								pending || !org || !validAmount || !reasonValid || blocked
							}
						>
							{pending ? <Loader2 className="animate-spin" /> : null}
							{direction === "add" ? "Add" : "Deduct"}{" "}
							{validAmount ? formatUsd(value) : ""}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
