"use client";

import { Info, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
	formatDiscountPercent,
	useActiveDiscounts,
	type CustomerDiscount,
} from "@/components/billing/active-discounts";
import {
	ProviderAccessNotice,
	useProviderAccess,
} from "@/components/dashboard/provider-access-notice";
import { Badge } from "@/lib/components/badge";
import { Input } from "@/lib/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/lib/components/table";
import { cn } from "@/lib/utils";

import type { paths } from "@/lib/api/v1";
import type { ApiModel, ApiProvider } from "@llmgateway/shared/components";

type ListResponse =
	paths["/custom-models"]["get"]["responses"][200]["content"]["application/json"];
export type CustomModel = ListResponse["customModels"][number];

function perMillion(price: number | null): string {
	if (price === null) {
		return "—";
	}
	if (price === 0) {
		return "Free";
	}
	return `$${(price * 1_000_000).toFixed(2)}`;
}

function contextLength(tokens: number): string {
	if (tokens <= 0) {
		return "—";
	}
	if (tokens >= 1_000_000) {
		return `${Number((tokens / 1_000_000).toFixed(1))}M`;
	}
	return `${Math.round(tokens / 1000)}k`;
}

// The listed price comes from the mappings whose credentials can actually
// serve this model — that is what the admin panel controls. servableProviderIds
// is allowedModels-aware; configuredIds is the provider-level fallback.
function minPrice(
	model: ApiModel,
	configuredIds: Set<string>,
	field: "inputPrice" | "outputPrice",
): number | null {
	const servableIds = model.servableProviderIds
		? new Set(model.servableProviderIds)
		: configuredIds;
	const prices = model.mappings
		.filter(
			(mapping) =>
				servableIds.has(mapping.providerId) && mapping[field] !== null,
		)
		.map((mapping) => Number(mapping[field]))
		.filter((value) => Number.isFinite(value));
	return prices.length > 0 ? Math.min(...prices) : null;
}

// The largest discount targeting this model by id.
function modelDiscount(
	discounts: CustomerDiscount[],
	modelId: string,
): CustomerDiscount | undefined {
	return discounts
		.filter((discount) => discount.model === modelId)
		.toSorted(
			(a, b) => Number(b.discountPercent) - Number(a.discountPercent),
		)[0];
}

function describeBroadDiscounts(discounts: CustomerDiscount[]): string {
	const max = (list: CustomerDiscount[]) =>
		formatDiscountPercent(
			String(Math.max(...list.map((d) => Number(d.discountPercent)))),
		);
	const allModels = discounts.filter((d) => !d.providerScoped);
	const routes = discounts.filter((d) => d.providerScoped);
	const parts = [
		allModels.length > 0 && `${max(allModels)} off all models`,
		routes.length > 0 &&
			`${routes.length > 1 ? "up to " : ""}${max(routes)} off selected routes`,
	].filter(Boolean);
	return `Active discounts: ${parts.join(", ")}. See Billing for details.`;
}

export function OrgModelsClient({
	catalogModels,
	catalogProviders,
}: {
	catalogModels: ApiModel[];
	catalogProviders: ApiProvider[];
}) {
	const [search, setSearch] = useState("");
	const access = useProviderAccess();
	const unavailable = useMemo(
		() => new Set(access?.unavailableModels ?? []),
		[access],
	);
	const discounts = useActiveDiscounts() ?? [];
	const broadDiscounts = discounts.filter((discount) => !discount.model);
	const configuredIds = useMemo(
		() => new Set(catalogProviders.map((provider) => provider.id)),
		[catalogProviders],
	);

	const rows = useMemo(() => {
		const query = search.trim().toLowerCase();
		return catalogModels
			.filter(
				(model) =>
					!query ||
					model.id.toLowerCase().includes(query) ||
					(model.name ?? "").toLowerCase().includes(query),
			)
			.map((model) => ({
				model,
				inputPrice: minPrice(model, configuredIds, "inputPrice"),
				outputPrice: minPrice(model, configuredIds, "outputPrice"),
				context: Math.max(
					0,
					...model.mappings.map((mapping) => mapping.contextSize ?? 0),
				),
			}))
			.toSorted((a, b) =>
				(a.model.name ?? a.model.id).localeCompare(b.model.name ?? b.model.id),
			);
	}, [catalogModels, configuredIds, search]);

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<div className="min-w-0">
					<h1 className="text-[28px] font-normal leading-9 text-heading">
						Models
					</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Every model available through Vichar, in one catalogue.
					</p>
				</div>

				{access?.restricted && (
					<ProviderAccessNotice unavailableCount={unavailable.size} />
				)}
				{broadDiscounts.length > 0 && (
					<div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success-soft p-3 text-sm">
						<Info className="mt-0.5 h-4 w-4 shrink-0 text-success" />
						<p>{describeBroadDiscounts(broadDiscounts)}</p>
					</div>
				)}

				<div className="relative max-w-sm">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search models"
						className="h-9 pl-8 text-sm"
					/>
				</div>

				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="text-xs">Model</TableHead>
							<TableHead className="text-xs">Model ID</TableHead>
							<TableHead className="text-right text-xs">
								Input / 1M tokens
							</TableHead>
							<TableHead className="text-right text-xs">
								Output / 1M tokens
							</TableHead>
							<TableHead className="text-right text-xs">Context</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length === 0 ? (
							<TableRow className="hover:bg-transparent">
								<TableCell
									colSpan={5}
									className="py-10 text-center text-sm text-muted-foreground"
								>
									No models found.
								</TableCell>
							</TableRow>
						) : (
							rows.map(({ model, inputPrice, outputPrice, context }) => {
								const blocked = unavailable.has(model.id);
								const discount = modelDiscount(discounts, model.id);
								return (
									<TableRow
										key={model.id}
										className={cn(blocked && "text-muted-foreground")}
									>
										<TableCell className="font-medium">
											<div className="flex flex-wrap items-center gap-2">
												<span>{model.name ?? model.id}</span>
												{blocked && (
													<Badge variant="outline">
														Not available for your workspace
													</Badge>
												)}
												{discount && !blocked && (
													<Badge
														title={`${formatDiscountPercent(discount.discountPercent)} off${discount.providerScoped ? " on selected routes" : ""}${discount.expiresAt ? ` until ${new Date(discount.expiresAt).toLocaleDateString()}` : ""}`}
													>
														−{formatDiscountPercent(discount.discountPercent)}
													</Badge>
												)}
											</div>
										</TableCell>
										<TableCell className="font-mono text-sm">
											{model.id}
										</TableCell>
										<TableCell className="text-right font-mono text-sm">
											{perMillion(inputPrice)}
										</TableCell>
										<TableCell className="text-right font-mono text-sm">
											{perMillion(outputPrice)}
										</TableCell>
										<TableCell className="text-right font-mono text-sm">
											{contextLength(context)}
										</TableCell>
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
