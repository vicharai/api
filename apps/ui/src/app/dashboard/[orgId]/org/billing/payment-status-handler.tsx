"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useToast } from "@/lib/components/use-toast";
import { useApi } from "@/lib/fetch-client";

interface PaymentStatusHandlerProps {
	paymentStatus?: string;
}

const CREDIT_POLL_MAX_MS = 30_000;
const CREDIT_POLL_INTERVAL_MS = 3_000;

export function PaymentStatusHandler({
	paymentStatus,
}: PaymentStatusHandlerProps) {
	const { toast } = useToast();
	const api = useApi();
	const queryClient = useQueryClient();
	const toastHandled = useRef(false);
	const pollHandled = useRef(false);

	useEffect(() => {
		if (toastHandled.current) {
			return;
		}
		if (!paymentStatus) {
			return;
		}

		toastHandled.current = true;

		if (paymentStatus === "success") {
			toast({
				title: "Payment received",
				description: "Credits appear within a minute.",
			});
		} else if (paymentStatus === "mandate") {
			toast({
				title: "Payment method saved",
				description:
					"Auto top-up can now be enabled from the billing settings.",
			});
		} else if (paymentStatus === "canceled") {
			toast({
				title: "Checkout canceled",
				description: "Your checkout was canceled.",
				variant: "destructive",
			});
		}
	}, [paymentStatus, toast]);

	// Poll organization data for ~30s so credited amounts (settled via the
	// Dodo webhook) show up without a manual refresh.
	useEffect(() => {
		if (
			pollHandled.current ||
			(paymentStatus !== "success" && paymentStatus !== "mandate")
		) {
			return;
		}
		pollHandled.current = true;

		const orgsQueryKey = api.queryOptions("get", "/orgs").queryKey;
		const startedAt = Date.now();
		const interval = setInterval(() => {
			void queryClient.invalidateQueries({ queryKey: orgsQueryKey });
			if (Date.now() - startedAt >= CREDIT_POLL_MAX_MS) {
				clearInterval(interval);
			}
		}, CREDIT_POLL_INTERVAL_MS);

		return () => clearInterval(interval);
	}, [paymentStatus, api, queryClient]);

	return null;
}
