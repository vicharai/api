"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

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

import {
	calculateFees,
	CREDIT_TOP_UP_MAX_AMOUNT,
	CREDIT_TOP_UP_MIN_AMOUNT,
} from "@llmgateway/shared";
import { isOrganizationAdmin } from "@llmgateway/shared/organization-roles";

import type React from "react";

const PRESET_AMOUNTS = [10, 25, 50, 100];

export function TopUpCreditsButton({
	variant = "default",
}: {
	variant?: React.ComponentProps<typeof Button>["variant"];
}) {
	return (
		<TopUpCreditsDialog>
			<Button variant={variant} className="flex items-center">
				<Plus className="mr-2 h-4 w-4" />
				Top Up Credits
			</Button>
		</TopUpCreditsDialog>
	);
}

interface TopUpCreditsDialogProps {
	children: React.ReactNode;
}

export function TopUpCreditsDialog(props: TopUpCreditsDialogProps) {
	const { selectedOrganization } = useDashboardState();
	if (!isOrganizationAdmin(selectedOrganization?.role)) {
		return null;
	}
	return <TopUpCreditsDialogInner {...props} />;
}

function TopUpCreditsDialogInner({ children }: TopUpCreditsDialogProps) {
	const { toast } = useToast();
	const api = useApi();
	const { selectedOrganization } = useDashboardState();
	const organizationId = selectedOrganization?.id;

	const [open, setOpen] = useState(false);
	const [amount, setAmount] = useState<number>(25);
	const [loading, setLoading] = useState(false);
	const [paymentsUnavailable, setPaymentsUnavailable] = useState(false);

	const checkoutMutation = api.useMutation("post", "/payments/top-up/checkout");

	useEffect(() => {
		if (open) {
			setPaymentsUnavailable(false);
		}
	}, [open]);

	const isAmountValid =
		Number.isInteger(amount) &&
		amount >= CREDIT_TOP_UP_MIN_AMOUNT &&
		amount <= CREDIT_TOP_UP_MAX_AMOUNT;

	const fees = calculateFees({ amount });
	const platformFee = fees.platformFee;
	const total = fees.totalAmount;

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
				error instanceof Error &&
				(error.message.includes("503") ||
					error.message.includes("not configured"))
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
					<DialogTitle>Top Up Credits</DialogTitle>
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
							{PRESET_AMOUNTS.map((preset) => (
								<Button
									key={preset}
									variant={amount === preset ? "default" : "outline"}
									onClick={() => setAmount(preset)}
								>
									${preset}
								</Button>
							))}
						</div>

						<div className="space-y-2 pt-2">
							<Label htmlFor="topup-custom-amount">Custom amount</Label>
							<Input
								id="topup-custom-amount"
								type="number"
								min={CREDIT_TOP_UP_MIN_AMOUNT}
								max={CREDIT_TOP_UP_MAX_AMOUNT}
								step={1}
								value={amount}
								onChange={(e) =>
									setAmount(e.target.value === "" ? 0 : Number(e.target.value))
								}
							/>
							{!isAmountValid && (
								<p className="text-xs text-destructive">
									Amount must be a whole dollar between $
									{CREDIT_TOP_UP_MIN_AMOUNT} and ${CREDIT_TOP_UP_MAX_AMOUNT}.
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
										Platform fee (5%)
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
								disabled={!isAmountValid || loading}
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
