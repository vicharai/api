"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { useBillingConfig } from "@/hooks/useBillingConfig";
import { calculateTopUpFees } from "@/lib/billing-config";
import { Button } from "@/lib/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/lib/components/dialog";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import { useToast } from "@/lib/components/use-toast";
import { useDashboardState } from "@/lib/dashboard-state";
import { useApi } from "@/lib/fetch-client";
import Spinner from "@/lib/icons/Spinner";
import { cn } from "@/lib/utils";

import { isOrganizationAdmin } from "@llmgateway/shared/organization-roles";

import type React from "react";

export function TopUpCreditsButton({
	variant = "default",
}: {
	variant?: React.ComponentProps<typeof Button>["variant"];
}) {
	const { selectedOrganization } = useDashboardState();
	if (
		selectedOrganization?.accountUnderReview &&
		isOrganizationAdmin(selectedOrganization.role)
	) {
		return (
			<Button
				variant={variant}
				className="flex items-center"
				disabled
				title="Top-ups are paused while your account is under review"
			>
				<Plus className="mr-2 h-4 w-4" />
				Add credits
			</Button>
		);
	}
	return (
		<TopUpCreditsDialog>
			<Button variant={variant} className="flex items-center">
				<Plus className="mr-2 h-4 w-4" />
				Add credits
			</Button>
		</TopUpCreditsDialog>
	);
}

interface TopUpCreditsDialogProps {
	children: React.ReactNode;
}

export function TopUpCreditsDialog(props: TopUpCreditsDialogProps) {
	const { selectedOrganization } = useDashboardState();
	if (
		!isOrganizationAdmin(selectedOrganization?.role) ||
		selectedOrganization?.accountUnderReview
	) {
		return null;
	}
	return <TopUpCreditsDialogInner {...props} />;
}

function TopUpCreditsDialogInner({ children }: TopUpCreditsDialogProps) {
	const { toast } = useToast();
	const api = useApi();
	const { selectedOrganization } = useDashboardState();
	const organizationId = selectedOrganization?.id;
	const { topUpMin, topUpMax, topUpPresets, platformFeePercent } =
		useBillingConfig();

	const [open, setOpen] = useState(false);
	const [amount, setAmount] = useState<number>(50);
	const [loading, setLoading] = useState(false);
	const [paymentsUnavailable, setPaymentsUnavailable] = useState(false);

	const checkoutMutation = api.useMutation("post", "/payments/top-up/checkout");

	const limitQuery = api.useQuery(
		"get",
		"/payments/top-up-limit",
		{ params: { query: { organizationId } } },
		{ enabled: open && Boolean(organizationId) },
	);
	// null remainingGrossAmount means the org is not velocity-capped.
	const dailyCap = limitQuery.data?.remainingGrossAmount;
	const maxCheckoutAmount = limitQuery.data?.maxCheckoutAmount;

	useEffect(() => {
		if (open) {
			setPaymentsUnavailable(false);
		}
	}, [open]);

	const isAmountValid =
		Number.isInteger(amount) && amount >= topUpMin && amount <= topUpMax;
	const exceedsDailyLimit =
		maxCheckoutAmount !== undefined && amount > maxCheckoutAmount;

	const { platformFee, totalAmount: total } = calculateTopUpFees(
		amount,
		platformFeePercent,
	);

	const handleCheckout = async () => {
		if (!organizationId || !isAmountValid) {
			return;
		}
		setLoading(true);
		try {
			const result = await checkoutMutation.mutateAsync({
				body: { organizationId, amount },
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
					title: "Checkout failed",
					description: "Could not start the checkout. Please try again.",
					variant: "destructive",
				});
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add credits</DialogTitle>
					<DialogDescription>
						Buy prepaid credits for API usage. Credits never expire.
					</DialogDescription>
				</DialogHeader>

				{paymentsUnavailable ? (
					<p className="py-4 text-center text-sm text-muted-foreground">
						Payments are temporarily unavailable. Please try again later.
					</p>
				) : (
					<>
						<div className="grid grid-cols-4 gap-2">
							{topUpPresets.map((preset) => (
								<button
									key={preset}
									type="button"
									onClick={() => setAmount(preset)}
									className={cn(
										"h-8 rounded-md border text-sm font-medium transition-colors",
										amount === preset
											? "border-foreground bg-foreground/[0.04] text-foreground ring-1 ring-foreground/20"
											: "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
									)}
								>
									${preset}
								</button>
							))}
						</div>

						<div className="space-y-2 pt-2">
							<Label htmlFor="topup-custom-amount">Custom amount</Label>
							<Input
								id="topup-custom-amount"
								type="number"
								min={topUpMin}
								max={topUpMax}
								step={1}
								value={amount}
								onChange={(e) =>
									setAmount(e.target.value === "" ? 0 : Number(e.target.value))
								}
							/>
							{!isAmountValid && (
								<p className="text-xs text-destructive">
									Amount must be a whole dollar between ${topUpMin} and $
									{topUpMax}.
								</p>
							)}
							{isAmountValid &&
								typeof dailyCap === "number" &&
								maxCheckoutAmount !== undefined && (
									<p
										className={cn(
											"text-xs",
											exceedsDailyLimit
												? "text-destructive"
												: "text-muted-foreground",
										)}
									>
										{maxCheckoutAmount < topUpMin
											? "You've reached your 24-hour top-up limit. Try again later or contact support to raise it."
											: exceedsDailyLimit
												? `Exceeds your remaining 24-hour top-up allowance — you can add up to $${Math.floor(maxCheckoutAmount)} in credits right now.`
												: `24-hour limit: up to $${Math.floor(maxCheckoutAmount)} in credits remaining.`}
									</p>
								)}
						</div>

						{isAmountValid && (
							<div className="rounded-md border p-3 text-sm space-y-1">
								<div className="flex justify-between">
									<span className="text-muted-foreground">Credits</span>
									<span>${amount.toFixed(2)}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">
										Platform fee ({platformFeePercent}%)
									</span>
									<span>${platformFee.toFixed(2)}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Tax</span>
									<span className="text-muted-foreground">
										Calculated at checkout
									</span>
								</div>
								<div className="flex justify-between border-t pt-1 font-medium">
									<span>Total</span>
									<span>${total.toFixed(2)}</span>
								</div>
							</div>
						)}

						<DialogFooter>
							<Button
								onClick={handleCheckout}
								disabled={!isAmountValid || exceedsDailyLimit || loading}
								className="w-full"
							>
								{loading ? <Spinner className="mr-2 h-4 w-4" /> : null}
								Continue to checkout
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
