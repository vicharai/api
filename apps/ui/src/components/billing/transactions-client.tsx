"use client";

import { format } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/lib/components/badge";
import { Button } from "@/lib/components/button";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { useToast } from "@/lib/components/use-toast";
import { useFetchClient } from "@/lib/fetch-client";

export interface Transaction {
	id: string;
	createdAt: string;
	type:
		| "credit_refund"
		| "credit_topup"
		| "credit_gift"
		| "credit_manual_payment"
		| "subscription_start"
		| "subscription_cancel"
		| "subscription_end"
		| "dev_plan_start"
		| "dev_plan_renewal"
		| "dev_plan_upgrade"
		| "dev_plan_reset_pass"
		| "chat_plan_start"
		| "chat_plan_renewal"
		| "chat_plan_upgrade";
	creditAmount: string | null;
	amount: string | null;
	status: "pending" | "completed" | "failed";
	description: string | null;
}

export interface TransactionsData {
	transactions: Transaction[];
}

// A transaction has a downloadable document when it is a completed, positive
// amount — a charge (invoice) or a refund (credit note). Mirrors
// isInvoiceableTransaction on the API.
function isInvoiceable(transaction: Transaction): boolean {
	return (
		transaction.status === "completed" &&
		transaction.amount !== null &&
		Number(transaction.amount) > 0
	);
}

function isRefund(type: Transaction["type"]): boolean {
	return type === "credit_refund";
}

// Refunds move money back to the customer, so show the paid amount as negative
// — matching the already-signed Credits column. The stored `amount` stays
// positive (it feeds invoice/credit-note generation).
function paidAmountDisplay(transaction: Transaction): string {
	if (transaction.amount === null) {
		return "—";
	}
	return isRefund(transaction.type)
		? `-${transaction.amount}`
		: transaction.amount;
}

function InvoiceDownloadButton({
	orgId,
	transaction,
}: {
	orgId: string;
	transaction: Transaction;
}) {
	const fetchClient = useFetchClient();
	const { toast } = useToast();
	const [loading, setLoading] = useState(false);

	if (!isInvoiceable(transaction)) {
		return null;
	}

	const refund = isRefund(transaction.type);
	const label = refund ? "Credit note" : "Invoice";

	async function handleDownload() {
		setLoading(true);
		try {
			const { data, response } = await fetchClient.GET(
				"/orgs/{id}/transactions/{transactionId}/invoice",
				{
					params: { path: { id: orgId, transactionId: transaction.id } },
					parseAs: "blob",
				},
			);

			if (!response.ok || !data) {
				throw new Error("Failed to download document");
			}

			const url = URL.createObjectURL(data as unknown as Blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${refund ? "credit-note" : "invoice"}-${transaction.id}.pdf`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		} catch {
			toast({
				title: `Could not download ${label.toLowerCase()}`,
				description: "Please try again later.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	}

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={handleDownload}
			disabled={loading}
		>
			{loading ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				<Download className="h-4 w-4" />
			)}
			{label}
		</Button>
	);
}

function StatusDot({ status }: { status: string }) {
	return (
		<span
			className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${
				status === "completed"
					? "text-success"
					: status === "failed"
						? "text-destructive"
						: "text-warning"
			}`}
		>
			<span
				className={`size-1.5 rounded-full ${
					status === "completed"
						? "bg-success"
						: status === "failed"
							? "bg-destructive"
							: "bg-warning"
				}`}
			/>
			{status}
		</span>
	);
}

function TransactionCard({
	transaction,
	orgId,
}: {
	transaction: Transaction;
	orgId: string;
}) {
	const getTypeLabel = (type: Transaction["type"]) => {
		switch (type) {
			case "credit_topup":
				return "Credit Top-up";
			case "credit_refund":
				return "Credit Refund";
			case "credit_gift":
				return "Credit Gift";
			case "credit_manual_payment":
				return "Credits Added";
			case "subscription_start":
				return "Subscription Start";
			case "subscription_cancel":
				return "Subscription Cancelled";
			case "subscription_end":
				return "Subscription Ended";
			default:
				return type;
		}
	};

	const getStatusColor = (status: Transaction["status"]) => {
		switch (status) {
			case "completed":
				return "bg-success-soft text-success";
			case "pending":
				return "bg-warning-soft text-warning";
			case "failed":
				return "bg-destructive-soft text-destructive";
			default:
				return "bg-muted text-muted-foreground";
		}
	};

	return (
		<div className="border-b border-border p-3 last:border-b-0">
			<div className="space-y-3">
				<div className="flex items-start justify-between">
					<div className="space-y-1">
						<p className="font-medium text-sm">
							{getTypeLabel(transaction.type)}
						</p>
						<p className="text-xs text-muted-foreground">
							{format(new Date(transaction.createdAt), "MMM d, yyyy HH:mm")}
						</p>
					</div>
					<Badge className={`text-xs ${getStatusColor(transaction.status)}`}>
						{transaction.status}
					</Badge>
				</div>

				<div className="grid grid-cols-2 gap-4 text-sm">
					{transaction.creditAmount && (
						<div>
							<p className="text-muted-foreground text-xs">Credits</p>
							<p className="font-medium">{transaction.creditAmount}</p>
						</div>
					)}
					{transaction.amount && (
						<div>
							<p className="text-muted-foreground text-xs">Total Paid</p>
							<p className="font-medium">{paidAmountDisplay(transaction)}</p>
						</div>
					)}
				</div>

				{transaction.description && (
					<div>
						<p className="text-muted-foreground text-xs">Description</p>
						<p className="text-sm">{transaction.description}</p>
					</div>
				)}

				{isInvoiceable(transaction) && (
					<div className="pt-1 flex gap-2">
						<InvoiceDownloadButton orgId={orgId} transaction={transaction} />
					</div>
				)}
			</div>
		</div>
	);
}

export function TransactionsClient({
	data,
	orgId,
}: {
	data: TransactionsData;
	orgId: string;
}) {
	const isMobile = useIsMobile();

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<SquircleSurface>
					<SquirclePanel className={isMobile ? "p-3" : "p-1"}>
						{isMobile ? (
							// Mobile card layout
							<div>
								{data.transactions.length === 0 ? (
									<div className="text-center py-8 text-muted-foreground">
										No transactions found
									</div>
								) : (
									data.transactions.map((transaction) => (
										<TransactionCard
											key={transaction.id}
											transaction={transaction}
											orgId={orgId}
										/>
									))
								)}
							</div>
						) : (
							// Desktop table layout
							<div className="overflow-x-auto">
								<table className="w-full">
									<thead>
										<tr className="border-b border-border">
											<th className="h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap">
												Date
											</th>
											<th className="h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap">
												Type
											</th>
											<th className="h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap">
												Credits
											</th>
											<th className="h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap">
												Total Paid
											</th>
											<th className="h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap">
												Status
											</th>
											<th className="h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap">
												Description
											</th>
											<th className="h-10 px-3 text-right align-middle text-xs font-medium text-muted-foreground whitespace-nowrap">
												Invoice
											</th>
										</tr>
									</thead>
									<tbody>
										{data.transactions.map((transaction) => (
											<tr
												key={transaction.id}
												className="border-b border-border/60 last:border-0 hover:bg-card transition-colors"
											>
												<td className="px-3 py-3 align-middle whitespace-nowrap">
													{format(
														new Date(transaction.createdAt),
														"MMM d, yyyy",
													)}
												</td>
												<td className="px-3 py-3 align-middle whitespace-nowrap">
													{transaction.type === "credit_topup" &&
														"Credit Top-up"}
													{transaction.type === "credit_refund" &&
														"Credit Refund"}
													{transaction.type === "credit_gift" && "Credit Gift"}
													{transaction.type === "credit_manual_payment" &&
														"Credits Added"}
													{transaction.type === "subscription_start" &&
														"Subscription Start"}
													{transaction.type === "subscription_cancel" &&
														"Subscription Cancelled"}
													{transaction.type === "subscription_end" &&
														"Subscription Ended"}
												</td>
												<td className="px-3 py-3 align-middle whitespace-nowrap">
													{transaction.creditAmount ?? "—"}
												</td>
												<td className="px-3 py-3 align-middle whitespace-nowrap">
													{paidAmountDisplay(transaction)}
												</td>
												<td className="px-3 py-3 align-middle whitespace-nowrap">
													<StatusDot status={transaction.status} />
												</td>
												<td className="px-3 py-3 align-middle text-sm text-muted-foreground max-w-xs truncate">
													{transaction.description ?? "—"}
												</td>
												<td className="px-3 py-3 align-middle whitespace-nowrap text-right">
													{isInvoiceable(transaction) ? (
														<InvoiceDownloadButton
															orgId={orgId}
															transaction={transaction}
														/>
													) : (
														"—"
													)}
												</td>
											</tr>
										))}
										{data.transactions.length === 0 && (
											<tr>
												<td
													colSpan={7}
													className="p-8 text-center text-muted-foreground"
												>
													No transactions found
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						)}
					</SquirclePanel>
				</SquircleSurface>
			</div>
		</div>
	);
}
