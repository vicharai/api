"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/lib/components/button";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
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
		Number(selectedOrganization?.autoTopUpAmount ?? 10),
	);
	const [saving, setSaving] = useState(false);
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
				error instanceof Error &&
				(error.message.includes("503") ||
					error.message.includes("not configured"))
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
			<SquircleSurface className="border border-border p-1 shadow-sm">
				<SquirclePanel className="p-4 sm:p-5">
					<p className="text-sm text-muted-foreground">
						Payments are temporarily unavailable. Please try again later.
					</p>
				</SquirclePanel>
			</SquircleSurface>
		);
	}

	return (
		<SquircleSurface className="border border-border p-1 shadow-sm">
			<div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
				<div className="ml-1 min-w-0">
					<h2 className="text-sm font-medium text-foreground/80">
						Auto Top-Up
					</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Automatically buy credits when your balance runs low
					</p>
				</div>
			</div>
			<SquirclePanel className="space-y-4 p-4 sm:p-5">
				{failureCount > 0 && (
					<p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
						The last {failureCount} auto top-up{" "}
						{failureCount === 1 ? "charge" : "charges"} failed.
						{!enabled && " Auto top-up has been disabled."}
					</p>
				)}

				<div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">
						Saved payment method mandate
					</span>
					<span className="text-sm font-medium">
						{hasMandate ? "Active" : "Not set up"}
					</span>
				</div>

				{enabled && (
					<p className="text-sm text-muted-foreground">
						Auto top-up is enabled: ${amount} of credits will be purchased when
						the balance drops below ${threshold}.
					</p>
				)}

				{hasMandate && !enabled && (
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
				)}

				{isOwner && (
					<div className="flex gap-2">
						{!hasMandate ? (
							<Button onClick={handleEnableMandate} disabled={saving}>
								{saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
								Enable auto top-up
							</Button>
						) : (
							<>
								{!enabled && (
									<Button
										onClick={handleSaveSettings}
										disabled={saving || !isAmountValid || !isThresholdValid}
									>
										{saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
										Save &amp; enable
									</Button>
								)}
								<Button
									variant="outline"
									onClick={handleDisable}
									disabled={saving}
								>
									Disable
								</Button>
							</>
						)}
					</div>
				)}
			</SquirclePanel>
		</SquircleSurface>
	);
}
