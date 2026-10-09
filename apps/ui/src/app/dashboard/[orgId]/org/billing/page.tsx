import { AutoTopUpSettings } from "@/components/billing/auto-topup-settings";
import { PlanManagement } from "@/components/billing/plan-management";
import {
	TransactionsClient,
	type TransactionsData,
} from "@/components/billing/transactions-client";
import { PaymentMethodsManagement } from "@/components/credits/payment-methods-management";
import { TopUpCreditsButton } from "@/components/credits/top-up-credits-dialog";
import { UnauthorizedView } from "@/components/dashboard/unauthorized-view";
import { OrganizationBillingEmailSettings } from "@/components/settings/organization-billing-email-settings";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { TabsContent } from "@/lib/components/tabs";
import { fetchServerData, getOrganizations } from "@/lib/server-api";

import { isOrganizationAdmin } from "@llmgateway/shared/organization-roles";

import { BillingTabs } from "./billing-tabs";
import { CreditsBalance } from "./credits-balance";
import { PaymentStatusHandler } from "./payment-status-handler";

interface BillingPageProps {
	params: Promise<{
		orgId: string;
	}>;
	searchParams: Promise<{
		success?: string;
		canceled?: string;
		tab?: string;
	}>;
}

async function fetchTransactions(orgId: string): Promise<TransactionsData> {
	const data = await fetchServerData<TransactionsData>(
		"GET",
		"/orgs/{id}/transactions",
		{
			params: {
				path: { id: orgId },
			},
		},
	);

	return data ?? { transactions: [] };
}

export default async function BillingPage({
	params,
	searchParams,
}: BillingPageProps) {
	const [{ orgId }, { success, canceled, tab: tabParam }, data] =
		await Promise.all([params, searchParams, getOrganizations()]);
	if (
		!isOrganizationAdmin(
			data?.organizations.find((org) => org.id === orgId)?.role,
		)
	) {
		return <UnauthorizedView resource="workspace" />;
	}

	const tab = tabParam === "transactions" ? "transactions" : "billing";
	const paymentStatus = success ? "success" : canceled ? "canceled" : undefined;

	// Only hit the transactions endpoint when that tab is actually open.
	const transactionsData =
		tab === "transactions" ? await fetchTransactions(orgId) : undefined;

	return (
		<div className="flex flex-col">
			<PaymentStatusHandler paymentStatus={paymentStatus} />
			<div className="flex-1 space-y-5">
				<div>
					<h1 className="text-xl font-medium tracking-tight">Billing</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Manage credits, plan, payment methods, and transactions
					</p>
				</div>
				<BillingTabs tab={tab}>
					<TabsContent value="billing" className="space-y-5">
						<SquircleSurface className="border border-border p-1 shadow-sm">
							<div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
								<div className="ml-1 min-w-0">
									<h2 className="text-sm font-medium text-foreground/80">
										Credits
									</h2>
									<p className="mt-0.5 text-xs text-muted-foreground">
										Your current credit balance and top-up options
									</p>
								</div>
								<TopUpCreditsButton />
							</div>
							<SquirclePanel className="p-4 sm:p-5">
								<CreditsBalance />
							</SquirclePanel>
						</SquircleSurface>

						<AutoTopUpSettings />

						<PlanManagement />

						<SquircleSurface className="border border-border p-1 shadow-sm">
							<div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
								<div className="ml-1 min-w-0">
									<h2 className="text-sm font-medium text-foreground/80">
										Payment Methods
									</h2>
									<p className="mt-0.5 text-xs text-muted-foreground">
										Manage your payment methods and billing information
									</p>
								</div>
							</div>
							<SquirclePanel className="p-4 sm:p-5">
								<PaymentMethodsManagement />
							</SquirclePanel>
						</SquircleSurface>

						<SquircleSurface className="border border-border p-1 shadow-sm">
							<div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
								<div className="ml-1 min-w-0">
									<h2 className="text-sm font-medium text-foreground/80">
										Billing Email
									</h2>
									<p className="mt-0.5 text-xs text-muted-foreground">
										Manage your workspace's billing email address.
									</p>
								</div>
							</div>
							<SquirclePanel className="p-4 sm:p-5">
								<OrganizationBillingEmailSettings />
							</SquirclePanel>
						</SquircleSurface>
					</TabsContent>
					<TabsContent value="transactions">
						<TransactionsClient
							data={transactionsData ?? { transactions: [] }}
							orgId={orgId}
						/>
					</TabsContent>
				</BillingTabs>
			</div>
		</div>
	);
}
