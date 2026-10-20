"use client";

import { Badge } from "@/lib/components/badge";
import { Section } from "@/lib/components/page-layout";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/lib/components/table";
import { useDashboardState } from "@/lib/dashboard-state";
import { useApi } from "@/lib/fetch-client";

import { isOrganizationAdmin } from "@llmgateway/shared/organization-roles";

import type { paths } from "@/lib/api/v1";

type DiscountsResponse =
	paths["/orgs/{id}/discounts"]["get"]["responses"][200]["content"]["application/json"];
export type CustomerDiscount = DiscountsResponse["orgDiscounts"][number] & {
	global: boolean;
};

export function formatDiscountPercent(fraction: string): string {
	return `${Number((Number(fraction) * 100).toFixed(2))}%`;
}

function formatExpiry(expiresAt: string | null): string {
	return expiresAt
		? new Date(expiresAt).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: "No expiry";
}

/** Active workspace and platform-wide discounts (owners and admins only). */
export function useActiveDiscounts(): CustomerDiscount[] | undefined {
	const { selectedOrganization: org } = useDashboardState();
	const api = useApi();
	const enabled = !!org?.id && isOrganizationAdmin(org.role);
	const { data } = api.useQuery(
		"get",
		"/orgs/{id}/discounts",
		{ params: { path: { id: org?.id ?? "" } } },
		{ enabled },
	);
	if (!data) {
		return enabled ? undefined : [];
	}
	return [
		...data.orgDiscounts.map((d) => ({ ...d, global: false })),
		...data.globalDiscounts.map((d) => ({ ...d, global: true })),
	];
}

export function discountScopeLabel(discount: CustomerDiscount): string {
	if (!discount.model) {
		return discount.providerScoped ? "Selected routes" : "All models";
	}
	return discount.model;
}

interface DiscountRow {
	key: string;
	model: string | null;
	label: string;
	routesOnly: boolean;
	global: boolean;
	percent: string;
	expiry: string;
}

// Route-scoped discounts without a model can't name their routes, so each
// audience collapses into one "Selected routes" row.
function toRows(discounts: CustomerDiscount[]): DiscountRow[] {
	const rows: DiscountRow[] = [];
	for (const global of [false, true]) {
		const scoped = discounts.filter(
			(d) => d.global === global && !d.model && d.providerScoped,
		);
		if (scoped.length === 0) {
			continue;
		}
		const percents = scoped.map((d) => Number(d.discountPercent));
		const expiries = new Set(scoped.map((d) => formatExpiry(d.expiresAt)));
		const max = String(Math.max(...percents));
		rows.push({
			key: `routes-${global}`,
			model: null,
			label: "Selected routes",
			routesOnly: false,
			global,
			percent:
				new Set(percents).size > 1
					? `up to −${formatDiscountPercent(max)}`
					: `−${formatDiscountPercent(max)}`,
			expiry: expiries.size === 1 ? Array.from(expiries)[0] : "Varies",
		});
	}
	const direct = discounts
		.filter((d) => d.model || !d.providerScoped)
		.map((d) => ({
			key: d.id,
			model: d.model,
			label: discountScopeLabel(d),
			routesOnly: Boolean(d.model) && d.providerScoped,
			global: d.global,
			percent: `−${formatDiscountPercent(d.discountPercent)}`,
			expiry: formatExpiry(d.expiresAt),
		}));
	return [...direct, ...rows];
}

export function ActiveDiscounts({
	discounts,
}: {
	discounts: CustomerDiscount[];
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow className="hover:bg-transparent">
					<TableHead className="text-xs">Applies to</TableHead>
					<TableHead className="text-right text-xs">Discount</TableHead>
					<TableHead className="text-xs">Expires</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{toRows(discounts).map((row) => (
					<TableRow key={row.key}>
						<TableCell>
							<div className="flex flex-wrap items-center gap-2">
								<span className={row.model ? "font-mono text-sm" : ""}>
									{row.label}
								</span>
								{row.routesOnly && (
									<span className="text-xs text-muted-foreground">
										on selected routes
									</span>
								)}
								{row.global && <Badge variant="outline">All customers</Badge>}
							</div>
						</TableCell>
						<TableCell className="text-right font-mono text-sm text-success">
							{row.percent}
						</TableCell>
						<TableCell className="text-sm text-muted-foreground">
							{row.expiry}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

/** Billing-page section; hidden while there is nothing to show. */
export function ActiveDiscountsSection() {
	const discounts = useActiveDiscounts();
	if (!discounts?.length) {
		return null;
	}
	return (
		<Section
			title="Active discounts"
			description="Applied automatically to the usage price of matching requests."
		>
			<ActiveDiscounts discounts={discounts} />
		</Section>
	);
}
