"use client";

import { useState } from "react";

import { Button } from "@/lib/components/button";
import { useToast } from "@/lib/components/use-toast";
import { useDashboardState } from "@/lib/dashboard-state";
import { useApi } from "@/lib/fetch-client";
import Spinner from "@/lib/icons/Spinner";

import { isOrganizationAdmin } from "@llmgateway/shared/organization-roles";

export function PaymentMethodsManagement() {
	const { toast } = useToast();
	const api = useApi();
	const { selectedOrganization } = useDashboardState();
	const organizationId = selectedOrganization?.id;
	const [loading, setLoading] = useState(false);
	const [paymentsUnavailable, setPaymentsUnavailable] = useState(false);

	const portalMutation = api.useMutation("post", "/payments/portal");

	const openPortal = async () => {
		if (!organizationId) {
			return;
		}
		setLoading(true);
		try {
			const result = await portalMutation.mutateAsync({
				body: { organizationId },
			});
			window.location.href = result.portalUrl;
		} catch (error) {
			if (
				error instanceof Error &&
				(error.message.includes("503") ||
					error.message.includes("not configured"))
			) {
				setPaymentsUnavailable(true);
			} else {
				toast({
					title: "Could not open the billing portal",
					description: "Please try again.",
					variant: "destructive",
				});
			}
		} finally {
			setLoading(false);
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
		<div className="space-y-3">
			<p className="text-sm text-muted-foreground">
				Payment methods and invoices are managed in the secure billing portal.
			</p>
			{isOrganizationAdmin(selectedOrganization?.role) && (
				<Button onClick={openPortal} disabled={loading}>
					{loading ? <Spinner className="mr-2 h-4 w-4" /> : null}
					Manage payment methods &amp; invoices
				</Button>
			)}
		</div>
	);
}
