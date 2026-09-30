"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";

import { Button } from "@/lib/components/button";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { Switch } from "@/lib/components/switch";
import { useToast } from "@/lib/components/use-toast";
import { useDashboardState } from "@/lib/dashboard-state";
import { useApi } from "@/lib/fetch-client";
import Spinner from "@/lib/icons/Spinner";

import { CREDIT_TOP_UP_MAX_AMOUNT } from "@llmgateway/shared";
import { formatNumber } from "@llmgateway/shared/number-format";

function AutoTopUpSettings() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const api = useApi();

	const { selectedOrganization } = useDashboardState();
	const organizationId = selectedOrganization?.id;
	const isOwner = selectedOrganization?.role === "owner";
	const { data: paymentMethods } = api.useQuery(
		"get",
		"/payments/payment-methods",
		{
			params: { query: { organizationId } },
		},
	);

	const [enabled, setEnabled] = useState(false);
	const [threshold, setThreshold] = useState(10);
	const [amount, setAmount] = useState(10);
	const isAmountValid =
		Number.isInteger(amount) &&
		amount >= 10 &&
		amount <= CREDIT_TOP_UP_MAX_AMOUNT;

	const defaultPaymentMethod = paymentMethods?.paymentMethods?.find(
		(pm) => pm.isDefault,
	);

	const { data: feeData, isLoading: feeDataLoading } = api.useQuery(
		"post",
		"/payments/calculate-fees",
		{
			body: {
				amount,
				paymentMethodId: defaultPaymentMethod?.id,
				organizationId,
			},
		},
		{
			enabled: isAmountValid,
		},
	);

	useEffect(() => {
		if (selectedOrganization) {
			setEnabled(selectedOrganization.autoTopUpEnabled ?? false);
			setThreshold(Number(selectedOrganization.autoTopUpThreshold) || 10);
			setAmount(Number(selectedOrganization.autoTopUpAmount) || 10);
		}
	}, [selectedOrganization]);

	const updateOrganization = api.useMutation("patch", "/orgs/{id}");

	const hasPaymentMethods =
		paymentMethods?.paymentMethods && paymentMethods.paymentMethods.length > 0;
	const hasDefaultPaymentMethod = paymentMethods?.paymentMethods?.some(
		(pm) => pm.isDefault,
	);

	const handleSave = async () => {
		if (enabled && !hasDefaultPaymentMethod) {
			toast({
				title: "Error",
				description:
					"Please add and set a default payment method before enabling auto top-up.",
				variant: "destructive",
			});
			return;
		}

		if (!selectedOrganization) {
			toast({
				title: "Error",
				description: "Organization not found.",
				variant: "destructive",
			});
			return;
		}

		try {
			await updateOrganization.mutateAsync({
				params: {
					path: { id: selectedOrganization.id },
				},
				body: {
					autoTopUpEnabled: enabled,
					autoTopUpThreshold: threshold,
					autoTopUpAmount: amount,
				},
			});

			await queryClient.invalidateQueries({
				queryKey: api.queryOptions("get", "/orgs").queryKey,
			});

			toast({
				title: "Settings saved",
				description: "Your auto top-up settings have been updated.",
			});
		} catch {
			toast({
				title: "Error",
				description: "Failed to save auto top-up settings.",
				variant: "destructive",
			});
		}
	};

	if (!selectedOrganization) {
		return (
			<SquircleSurface className="border border-border p-1 shadow-sm">
				<div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
					<h2 className="ml-1 text-sm font-medium text-foreground/80">
						Auto Top-Up
					</h2>
				</div>
				<SquirclePanel className="p-4 sm:p-5">
					<p className="text-sm text-muted-foreground">
						Please select an organization to manage auto top-up settings.
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
						Automatically add credits when your balance falls below a threshold
					</p>
				</div>
			</div>
			<SquirclePanel className="space-y-4 p-4 sm:p-5">
				{!isOwner && (
					<p className="text-sm text-muted-foreground">
						Only organization owners can change auto top-up settings.
					</p>
				)}
				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label htmlFor="auto-topup-enabled">Enable</Label>
						<p className="text-sm text-muted-foreground">
							Automatically charge your default payment method when credits are
							low
						</p>
					</div>
					<Switch
						id="auto-topup-enabled"
						checked={enabled}
						onCheckedChange={(checked) => setEnabled(!!checked)}
						disabled={!isOwner || !hasDefaultPaymentMethod}
					/>
				</div>

				{!hasPaymentMethods && (
					<div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
						<p className="text-sm text-amber-800 dark:text-amber-300">
							You need to add a payment method before enabling auto top-up.
						</p>
					</div>
				)}

				{hasPaymentMethods && !hasDefaultPaymentMethod && (
					<div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
						<p className="text-sm text-amber-800 dark:text-amber-300">
							Please set a default payment method to enable auto top-up.
						</p>
					</div>
				)}

				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label htmlFor="threshold">Threshold (USD)</Label>
						<Input
							id="threshold"
							type="number"
							min={5}
							value={threshold}
							onChange={(e) => setThreshold(Number(e.target.value))}
							disabled={!isOwner || !enabled}
						/>
						<p className="text-xs text-muted-foreground">
							Minimum $5. Top-up when credits fall below this amount.
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="amount">Top-up Amount (USD)</Label>
						<Input
							id="amount"
							type="number"
							min={10}
							max={CREDIT_TOP_UP_MAX_AMOUNT}
							step={1}
							value={amount}
							onChange={(e) => setAmount(Number(e.target.value))}
							disabled={!isOwner || !enabled}
						/>
						<p className="text-xs text-muted-foreground">
							Minimum $10. Maximum ${formatNumber(CREDIT_TOP_UP_MAX_AMOUNT)}.
							Amount to add when auto top-up triggers.
						</p>
						{amount > CREDIT_TOP_UP_MAX_AMOUNT ? (
							<p className="text-xs text-destructive">
								Maximum top-up amount is $
								{formatNumber(CREDIT_TOP_UP_MAX_AMOUNT)}.
							</p>
						) : !Number.isInteger(amount) ? (
							<p className="text-xs text-destructive">
								Amount must be a whole dollar amount.
							</p>
						) : null}
					</div>
				</div>

				{enabled && isAmountValid && (
					<div className="rounded-xl border border-border bg-card p-4">
						<p className="font-medium mb-2">Estimated Auto Top-up Fees</p>
						{feeDataLoading ? (
							<div className="flex items-center justify-center py-4">
								<Spinner className="h-5 w-5 animate-spin text-muted-foreground" />
								<span className="ml-2 text-sm text-muted-foreground">
									Calculating fees...
								</span>
							</div>
						) : feeData ? (
							<div className="space-y-1 text-sm text-muted-foreground">
								<div className="flex justify-between">
									<span>Credits</span>
									<span>${feeData.baseAmount.toFixed(2)}</span>
								</div>
								<div className="flex justify-between">
									<span>Platform fee (5%)</span>
									<span>${feeData.platformFee.toFixed(2)}</span>
								</div>
								{feeData.internationalFee > 0 ? (
									<div className="flex justify-between">
										<span>International card fee (1.5%)</span>
										<span>${feeData.internationalFee.toFixed(2)}</span>
									</div>
								) : null}
								<div className="border-t border-border pt-1 flex justify-between font-medium text-foreground">
									<span>Estimated total</span>
									<span>${feeData.totalAmount.toFixed(2)}</span>
								</div>
							</div>
						) : null}
					</div>
				)}

				<div className="flex justify-end">
					<Button
						onClick={handleSave}
						disabled={
							!isOwner ||
							Boolean(updateOrganization.isPending) ||
							threshold < 5 ||
							amount < 10 ||
							amount > CREDIT_TOP_UP_MAX_AMOUNT ||
							(enabled && feeDataLoading)
						}
					>
						{updateOrganization.isPending ? "Saving..." : "Save Settings"}
					</Button>
				</div>
			</SquirclePanel>
		</SquircleSurface>
	);
}

export { AutoTopUpSettings };
