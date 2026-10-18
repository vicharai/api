"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { getApiErrorMessage } from "@/lib/api-error";
import { Button } from "@/lib/components/button";
import { Input } from "@/lib/components/input";
import { useToast } from "@/lib/components/use-toast";
import { useDashboardState } from "@/lib/dashboard-state";
import { useApi } from "@/lib/fetch-client";
import Spinner from "@/lib/icons/Spinner";

const currency = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
});

export function PromoCodeRedeem() {
	const { toast } = useToast();
	const api = useApi();
	const queryClient = useQueryClient();
	const { selectedOrganization } = useDashboardState();
	const organizationId = selectedOrganization?.id;
	const [code, setCode] = useState("");

	const redeem = api.useMutation("post", "/orgs/{orgId}/promo-codes/redeem");

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = code.trim();
		if (!organizationId || !trimmed) {
			return;
		}
		try {
			const result = await redeem.mutateAsync({
				params: { path: { orgId: organizationId } },
				body: { code: trimmed },
			});
			setCode("");
			toast({
				title: "Promo code redeemed",
				description: `${currency.format(result.amount)} added. New balance: ${currency.format(result.balance)}.`,
			});
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: api.queryOptions("get", "/orgs").queryKey,
				}),
				queryClient.invalidateQueries({
					queryKey: api.queryOptions("get", "/orgs/{id}/credits-runway", {
						params: { path: { id: organizationId } },
					}).queryKey,
				}),
			]);
		} catch (error) {
			toast({
				title: "Could not redeem code",
				description: getApiErrorMessage(error, "Please try again."),
				variant: "destructive",
			});
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex max-w-md gap-2">
			<Input
				aria-label="Promo code"
				placeholder="Enter promo code"
				value={code}
				onChange={(event) => setCode(event.target.value)}
				maxLength={64}
				autoComplete="off"
			/>
			<Button
				type="submit"
				variant="outline"
				disabled={!code.trim() || redeem.isPending}
			>
				{redeem.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
				Redeem
			</Button>
		</form>
	);
}
