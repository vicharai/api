import { AutoTopUpSettings } from "@/components/billing/auto-topup-settings";
import {
	TransactionsClient,
	type TransactionsData,
} from "@/components/billing/transactions-client";
import { PaymentMethodsManagement } from "@/components/credits/payment-methods-management";
import { TopUpCreditsButton } from "@/components/credits/top-up-credits-dialog";
import { UnauthorizedView } from "@/components/dashboard/unauthorized-view";
import { OrganizationBillingEmailSettings } from "@/components/settings/organization-billing-email-settings";
import { PageHeader, Section } from "@/lib/components/page-layout";
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
		mandate?: string;
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
	const [{ orgId }, { success, canceled, mandate, tab: tabParam }, data] =
		await Promise.all([params, searchParams, getOrganizations()]);
	if (
		!isOrganizationAdmin(
			data?.organizations.find((org) => org.id === orgId)?.role,
		)
	) {
		return <UnauthorizedView resource="workspace" />;
	}

	const tab =
		tabParam === "transactions"
			? "transactions"
			: tabParam === "details"
				? "details"
				: "billing";
	const paymentStatus = success
		? "success"
		: mandate
			? "mandate"
			: canceled
				? "canceled"
				: undefined;

	// Only hit the transactions endpoint when that tab is actually open.
	const transactionsData =
		tab === "transactions" ? await fetchTransactions(orgId) : undefined;

	return (
		<div className="space-y-8">
			<PaymentStatusHandler paymentStatus={paymentStatus} />
			<PageHeader
				title="Billing"
				description="Credits, payment methods, and billing details."
			/>
			<BillingTabs tab={tab}>
				<TabsContent value="billing" className="space-y-8">
					<Section title="Balance" action={<TopUpCreditsButton />}>
						<div className="px-4 py-4">
							<CreditsBalance />
						</div>
					</Section>

					<Section
						title="Auto top-up"
						description="Automatically buy credits when your balance runs low."
					>
						<div className="px-4 py-4">
							<AutoTopUpSettings />
						</div>
					</Section>

					<Section title="Payment methods">
						<div className="px-4 py-4">
							<PaymentMethodsManagement />
						</div>
					</Section>
				</TabsContent>
				<TabsContent value="transactions">
					<TransactionsClient
						data={transactionsData ?? { transactions: [] }}
						orgId={orgId}
					/>
				</TabsContent>
				<TabsContent value="details">
					<Section
						title="Billing details"
						description="Email, company, and address shown on invoices."
					>
						<div className="px-4 py-4">
							<OrganizationBillingEmailSettings />
						</div>
					</Section>
				</TabsContent>
			</BillingTabs>
		</div>
	);
}
