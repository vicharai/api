"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/lib/components/button";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import { useToast } from "@/lib/components/use-toast";
import { useDashboardState } from "@/lib/dashboard-state";
import { useApi } from "@/lib/fetch-client";
import Spinner from "@/lib/icons/Spinner";

import {
	CREDIT_TOP_UP_MAX_AMOUNT,
	CREDIT_TOP_UP_MIN_AMOUNT,
} from "@llmgateway/shared";

export function AutoTopUpSettings() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const api = useApi();

	const { selectedOrganization } = useDashboardState();
	const organizationId = selectedOrganization?.id;
	const isOwner = selectedOrganization?.role === "owner";

	const hasMandate = Boolean(selectedOrganization?.dodoAutoTopUpSubscriptionId);
	const enabled = selectedOrganization?.autoTopUpEnabled ?? false;
	const failureCount = selectedOrganization?.autoTopUpFailureCount ?? 0;

	const [threshold, setThreshold] = useState(
		Number(selectedOrganization?.autoTopUpThreshold ?? 10),
	);
	const [amount, setAmount] = useState(
		Math.max(
			Number(selectedOrganization?.autoTopUpAmount ?? 0),
			CREDIT_TOP_UP_MIN_AMOUNT,
		),
	);
	const [saving, setSaving] = useState(false);
	const [editing, setEditing] = useState(false);
	const [paymentsUnavailable, setPaymentsUnavailable] = useState(false);

	const updateOrganization = api.useMutation("patch", "/orgs/{id}");
	const mandateCheckout = api.useMutation(
		"post",
		"/payments/auto-top-up/mandate",
	);
	const deleteMandate = api.useMutation(
		"delete",
		"/payments/auto-top-up/mandate",
	);

	const isAmountValid =
		Number.isInteger(amount) &&
		amount >= CREDIT_TOP_UP_MIN_AMOUNT &&
		amount <= CREDIT_TOP_UP_MAX_AMOUNT;
	const isThresholdValid = Number.isInteger(threshold) && threshold >= 0;

	const invalidateOrgs = async () => {
		await queryClient.invalidateQueries({
			queryKey: api.queryOptions("get", "/orgs").queryKey,
		});
	};

	const handleEnableMandate = async () => {
		if (!organizationId) {
			return;
		}
		setSaving(true);
		try {
			const result = await mandateCheckout.mutateAsync({
				body: { organizationId },
			});
			window.location.href = result.checkoutUrl;
		} catch (error) {
			if (
				typeof (error as { message?: unknown }).message === "string" &&
				((error as { message: string }).message.includes("503") ||
					(error as { message: string }).message.includes("not configured"))
			) {
				setPaymentsUnavailable(true);
			} else {
				toast({
					title: "Could not start auto top-up setup",
					description: "Please try again.",
					variant: "destructive",
				});
			}
		} finally {
			setSaving(false);
		}
	};

	const handleSaveSettings = async () => {
		if (!organizationId || !isAmountValid || !isThresholdValid) {
			return;
		}
		setSaving(true);
		try {
			await updateOrganization.mutateAsync({
				params: { path: { id: organizationId } },
				body: {
					autoTopUpEnabled: true,
					autoTopUpThreshold: threshold,
					autoTopUpAmount: amount,
				},
			});
			await invalidateOrgs();
			toast({ title: "Auto top-up enabled" });
		} catch {
			toast({
				title: "Could not save auto top-up settings",
				description: "Please try again.",
				variant: "destructive",
			});
		} finally {
			setSaving(false);
		}
	};

	const handleDisable = async () => {
		if (!organizationId) {
			return;
		}
		setSaving(true);
		try {
			await deleteMandate.mutateAsync({
				body: { organizationId },
			});
			await invalidateOrgs();
			toast({ title: "Auto top-up disabled" });
		} catch {
			toast({
				title: "Could not disable auto top-up",
				description: "Please try again.",
				variant: "destructive",
			});
		} finally {
			setSaving(false);
		}
	};

	if (paymentsUnavailable) {
		return (
			<p className="text-sm text-muted-foreground">
				Payments are temporarily unavailable. Please try again later.
			</p>
		);
	}

	return (
		<div className="space-y-4">
			{failureCount > 0 && (
				<p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
					The last {failureCount} auto top-up{" "}
					{failureCount === 1 ? "charge" : "charges"} failed.
					{!enabled && " Auto top-up has been disabled."}
				</p>
			)}

			{!hasMandate && (
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="text-sm font-medium">Auto top-up is off</p>
						<p className="mt-0.5 text-[13px] text-muted-foreground">
							Charge your saved card when the balance drops below a threshold.
						</p>
					</div>
					{isOwner && (
						<Button
							variant="outline"
							size="sm"
							onClick={handleEnableMandate}
							disabled={saving}
						>
							{saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
							Set up
						</Button>
					)}
				</div>
			)}

			{hasMandate && enabled && (
				<div className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-sm font-medium">Auto top-up is on</p>
							<p className="mt-0.5 text-[13px] text-muted-foreground">
								${amount} of credits when the balance drops below ${threshold}.
							</p>
						</div>
						{isOwner && (
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => setEditing((v) => !v)}
								>
									{editing ? "Cancel" : "Edit"}
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={handleDisable}
									disabled={saving}
								>
									Disable
								</Button>
							</div>
						)}
					</div>
					{editing && (
						<>
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1.5">
									<Label htmlFor="auto-topup-threshold">
										Top up when balance falls below
									</Label>
									<Input
										id="auto-topup-threshold"
										type="number"
										min={0}
										step={1}
										value={threshold}
										onChange={(e) => setThreshold(Number(e.target.value))}
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="auto-topup-amount">Top-up amount</Label>
									<Input
										id="auto-topup-amount"
										type="number"
										min={CREDIT_TOP_UP_MIN_AMOUNT}
										max={CREDIT_TOP_UP_MAX_AMOUNT}
										step={1}
										value={amount}
										onChange={(e) => setAmount(Number(e.target.value))}
									/>
								</div>
							</div>
							{isOwner && (
								<Button
									size="sm"
									onClick={async () => {
										await handleSaveSettings();
										setEditing(false);
									}}
									disabled={saving || !isAmountValid || !isThresholdValid}
								>
									{saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
									Save
								</Button>
							)}
						</>
					)}
				</div>
			)}

			{hasMandate && !enabled && (
				<>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-sm font-medium">
								Card saved — auto top-up is off
							</p>
							<p className="mt-0.5 text-[13px] text-muted-foreground">
								Choose a threshold and amount, then enable.
							</p>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="auto-topup-threshold">
								Top up when balance falls below
							</Label>
							<Input
								id="auto-topup-threshold"
								type="number"
								min={0}
								step={1}
								value={threshold}
								onChange={(e) => setThreshold(Number(e.target.value))}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="auto-topup-amount">Top-up amount</Label>
							<Input
								id="auto-topup-amount"
								type="number"
								min={CREDIT_TOP_UP_MIN_AMOUNT}
								max={CREDIT_TOP_UP_MAX_AMOUNT}
								step={1}
								value={amount}
								onChange={(e) => setAmount(Number(e.target.value))}
							/>
						</div>
					</div>
				</>
			)}

			{isOwner && hasMandate && !enabled && (
				<div className="flex gap-2">
					<Button
						size="sm"
						onClick={handleSaveSettings}
						disabled={saving || !isAmountValid || !isThresholdValid}
					>
						{saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
						Save &amp; enable
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={handleDisable}
						disabled={saving}
					>
						Disable
					</Button>
				</div>
			)}
		</div>
	);
}
