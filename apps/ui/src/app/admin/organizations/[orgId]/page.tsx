"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/lib/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/lib/components/dialog";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { useToast } from "@/lib/components/use-toast";
import { useApi } from "@/lib/fetch-client";
import Spinner from "@/lib/icons/Spinner";

interface PendingAction {
	title: string;
	description: string;
	amountField?: boolean;
	run: (reason: string, amount?: number) => Promise<void>;
}

export default function AdminOrganizationDetailPage() {
	const { orgId } = useParams<{ orgId: string }>();
	const { toast } = useToast();
	const api = useApi();
	const queryClient = useQueryClient();

	const [action, setAction] = useState<PendingAction | null>(null);
	const [reason, setReason] = useState("");
	const [amount, setAmount] = useState<string>("10");
	const [busy, setBusy] = useState(false);

	const { data: detail, refetch: refetchDetail } = api.useQuery(
		"get",
		"/admin/organizations/{orgId}",
		{ params: { path: { orgId } } },
	);
	const { data: membersData } = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/members",
		{ params: { path: { orgId } } },
	);
	const { data: apiKeysData } = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/api-keys",
		{ params: { path: { orgId } } },
	);
	const { data: txnsData, refetch: refetchTxns } = api.useQuery(
		"get",
		"/admin/organizations/{orgId}/transactions",
		{ params: { path: { orgId }, query: { limit: 50 } } },
	);

	const org = detail?.organization;
	const members = membersData?.members ?? [];
	const transactions = txnsData?.transactions ?? [];
	const apiKeyCount = apiKeysData?.total ?? apiKeysData?.apiKeys?.length ?? 0;

	const adjustCredits = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/credits",
	);
	const setRiskFlag = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/risk-flag",
	);
	const setStatus = api.useMutation(
		"patch",
		"/admin/organizations/{orgId}/status",
	);
	const disableAutoTopUp = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/auto-top-up/disable",
	);
	const refundTxn = api.useMutation(
		"post",
		"/admin/organizations/{orgId}/transactions/{transactionId}/refund",
	);

	const refresh = async () => {
		await Promise.all([refetchDetail(), refetchTxns()]);
		await queryClient.invalidateQueries({
			queryKey: api.queryOptions(
				"get",
				"/admin/organizations/{orgId}/members",
				{
					params: { path: { orgId } },
				},
			).queryKey,
		});
	};

	const openAction = (pending: PendingAction) => {
		setReason("");
		setAmount("10");
		setAction(pending);
	};

	const runAction = async () => {
		if (!action) {
			return;
		}
		setBusy(true);
		try {
			await action.run(reason, action.amountField ? Number(amount) : undefined);
			await refresh();
			setAction(null);
		} catch (error) {
			toast({
				title: "Action failed",
				description:
					error instanceof Error ? error.message : "Please try again.",
				variant: "destructive",
			});
		} finally {
			setBusy(false);
		}
	};

	if (!org) {
		return <Spinner className="mx-auto h-8 w-8" />;
	}

	return (
		<div className="space-y-4">
			<SquircleSurface className="border border-border p-1 shadow-sm">
				<SquirclePanel className="space-y-3 p-4 sm:p-5">
					<div className="flex items-center justify-between">
						<div>
							<h2 className="text-lg font-medium">{org.name}</h2>
							<p className="text-xs text-muted-foreground">{org.id}</p>
						</div>
						<div className="flex gap-2 text-sm">
							{org.riskFlagged && (
								<span className="text-destructive">Risk flagged</span>
							)}
							<span className="text-muted-foreground">{org.status}</span>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
						<div>
							<p className="text-muted-foreground">Owner</p>
							<p>{org.ownerEmail ?? org.billingEmail}</p>
						</div>
						<div>
							<p className="text-muted-foreground">Credits</p>
							<p>${Number(org.credits).toFixed(2)}</p>
						</div>
						<div>
							<p className="text-muted-foreground">Members</p>
							<p>{members.length}</p>
						</div>
						<div>
							<p className="text-muted-foreground">API keys</p>
							<p>{apiKeyCount}</p>
						</div>
					</div>

					<div className="flex flex-wrap gap-2 border-t pt-3">
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								openAction({
									title: "Grant or deduct credits",
									description:
										"Positive amounts add credits, negative amounts deduct them. A credit_gift transaction is recorded.",
									amountField: true,
									run: async (r, a) => {
										await adjustCredits.mutateAsync({
											params: { path: { orgId } },
											body: { creditAmount: a ?? 0, reason: r },
										});
										toast({ title: "Credits updated" });
									},
								})
							}
						>
							Adjust credits
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								openAction({
									title: org.riskFlagged ? "Clear risk flag" : "Set risk flag",
									description: org.riskFlagged
										? "Unblocks purchases and inference for this organization."
										: "Blocks credit purchases and inference for this organization.",
									run: async (r) => {
										await setRiskFlag.mutateAsync({
											params: { path: { orgId } },
											body: { flagged: !org.riskFlagged, reason: r },
										});
										toast({ title: "Risk flag updated" });
									},
								})
							}
						>
							{org.riskFlagged ? "Clear risk flag" : "Set risk flag"}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								openAction({
									title:
										org.status === "inactive"
											? "Re-enable organization"
											: "Disable organization",
									description:
										org.status === "inactive"
											? "Marks the organization active again."
											: "Marks the organization inactive. Members keep access but inference is blocked.",
									run: async () => {
										await setStatus.mutateAsync({
											params: { path: { orgId } },
											body: {
												status:
													org.status === "inactive" ? "active" : "inactive",
											},
										});
										toast({ title: "Status updated" });
									},
								})
							}
						>
							{org.status === "inactive" ? "Re-enable" : "Disable"}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								openAction({
									title: "Disable auto top-up",
									description:
										"Stops automatic credit purchases for this organization.",
									run: async (r) => {
										await disableAutoTopUp.mutateAsync({
											params: { path: { orgId } },
											body: { reason: r },
										});
										toast({ title: "Auto top-up disabled" });
									},
								})
							}
						>
							Disable auto top-up
						</Button>
					</div>
				</SquirclePanel>
			</SquircleSurface>

			<SquircleSurface className="border border-border p-1 shadow-sm">
				<div className="px-4 pt-4">
					<h3 className="text-sm font-medium text-foreground/80">Members</h3>
				</div>
				<SquirclePanel className="p-4 sm:p-5">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b text-left text-muted-foreground">
								<th className="pb-2 pr-4 font-medium">Email</th>
								<th className="pb-2 pr-4 font-medium">Name</th>
								<th className="pb-2 font-medium">Role</th>
							</tr>
						</thead>
						<tbody>
							{members.map((m) => (
								<tr key={m.id} className="border-b last:border-0">
									<td className="py-2 pr-4">{m.user?.email ?? m.userId}</td>
									<td className="py-2 pr-4">{m.user?.name ?? "—"}</td>
									<td className="py-2">{m.role}</td>
								</tr>
							))}
						</tbody>
					</table>
				</SquirclePanel>
			</SquircleSurface>

			<SquircleSurface className="border border-border p-1 shadow-sm">
				<div className="px-4 pt-4">
					<h3 className="text-sm font-medium text-foreground/80">
						Transactions
					</h3>
				</div>
				<SquirclePanel className="p-4 sm:p-5">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b text-left text-muted-foreground">
								<th className="pb-2 pr-4 font-medium">Date</th>
								<th className="pb-2 pr-4 font-medium">Type</th>
								<th className="pb-2 pr-4 font-medium">Amount</th>
								<th className="pb-2 pr-4 font-medium">Credits</th>
								<th className="pb-2 pr-4 font-medium">Status</th>
								<th className="pb-2 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody>
							{transactions.map((t) => (
								<tr key={t.id} className="border-b last:border-0">
									<td className="py-2 pr-4">
										{new Date(t.createdAt).toLocaleString()}
									</td>
									<td className="py-2 pr-4">{t.type}</td>
									<td className="py-2 pr-4">
										${Number(t.amount ?? 0).toFixed(2)}
									</td>
									<td className="py-2 pr-4">
										{Number(t.creditAmount ?? 0).toFixed(2)}
									</td>
									<td className="py-2 pr-4">{t.status}</td>
									<td className="py-2">
										{t.refundability?.refundable && (
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													openAction({
														title: `Refund ${t.type} of $${Number(t.amount).toFixed(2)}`,
														description:
															"Issues a Dodo refund for this payment and deducts the corresponding credits when it completes.",
														run: async (r) => {
															await refundTxn.mutateAsync({
																params: {
																	path: { orgId, transactionId: t.id },
																},
																body: { reason: r },
															});
															toast({ title: "Refund issued" });
														},
													})
												}
											>
												Refund
											</Button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</SquirclePanel>
			</SquircleSurface>

			<Dialog open={Boolean(action)} onOpenChange={() => setAction(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{action?.title}</DialogTitle>
						<DialogDescription>{action?.description}</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						{action?.amountField && (
							<div className="space-y-1.5">
								<Label htmlFor="admin-action-amount">
									Credit amount (negative to deduct)
								</Label>
								<Input
									id="admin-action-amount"
									type="number"
									step="0.01"
									value={amount}
									onChange={(e) => setAmount(e.target.value)}
								/>
							</div>
						)}
						<div className="space-y-1.5">
							<Label htmlFor="admin-action-reason">Reason (required)</Label>
							<Input
								id="admin-action-reason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder="Why is this change being made?"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setAction(null)}
							disabled={busy}
						>
							Cancel
						</Button>
						<Button
							onClick={runAction}
							disabled={busy || reason.trim().length < 3}
						>
							{busy ? <Spinner className="mr-2 h-4 w-4" /> : null}
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
