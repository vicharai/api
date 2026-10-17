"use client";

import { toast } from "sonner";

import { PaymentFailures } from "@/components/issues/payment-failures";
import {
	DiscountsPanel,
	OrgDiscountsOverview,
} from "@/components/policies/discounts-panel";
import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tone } from "@/components/ui/controls";
import { PageHeader, QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import { Button } from "@llmgateway/shared/components";

export function BillingPage() {
	return (
		<>
			<PageHeader
				title="Billing"
				description="Discounts, the credit purchase kill switch and failed payments."
			/>
			<div className="space-y-4">
				<CreditPurchaseSwitch />
				<DiscountsPanel />
				<OrgDiscountsOverview />
				<PaymentFailures />
			</div>
		</>
	);
}

function CreditPurchaseSwitch() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const state = api.useQuery("get", "/admin/settings/credit-purchase-block");
	const update = api.useMutation(
		"put",
		"/admin/settings/credit-purchase-block",
		{
			onSuccess: (res) => {
				toast.success(
					res.blocked ? "Credit purchases blocked" : "Credit purchases allowed",
				);
				void invalidate("/admin/settings/credit-purchase-block");
			},
		},
	);

	return (
		<Section
			title="Credit purchases"
			description="Emergency stop for new top-ups (e.g. during a fraud wave or payment-provider incident). Existing balances keep working."
		>
			<QueryState query={state} rows={1}>
				{(s) => (
					<div className="flex flex-wrap items-center gap-3">
						{s.blocked ? (
							<Tone tone="bad">Purchases blocked</Tone>
						) : (
							<Tone tone="good">Purchases allowed</Tone>
						)}
						{s.envForced ? (
							<span className="text-sm text-muted-foreground">
								Forced on by an environment variable; this toggle has no effect
								until it is removed.
							</span>
						) : null}
						<ConfirmAction
							title={
								s.blocked ? "Allow credit purchases" : "Block credit purchases"
							}
							description={
								s.blocked
									? "Customers can top up again."
									: "Every checkout and auto top-up is refused until you allow purchases again."
							}
							confirmLabel={s.blocked ? "Allow" : "Block purchases"}
							destructive={!s.blocked}
							onConfirm={() =>
								update.mutateAsync({ body: { blocked: !s.blocked } })
							}
						>
							<Button
								size="sm"
								variant={s.blocked ? "default" : "destructive"}
								disabled={
									s.envForced ||
									!can("PUT", "/admin/settings/credit-purchase-block")
								}
							>
								{s.blocked ? "Allow purchases" : "Block purchases"}
							</Button>
						</ConfirmAction>
					</div>
				)}
			</QueryState>
		</Section>
	);
}
