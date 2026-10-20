"use client";

import { Check, Loader2, ScanSearch } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
	Segmented,
	SimpleSelect,
	ToggleChips,
	Tone,
} from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { PLAIN_DECIMAL, perTokenToPerMillion } from "@/lib/decimal";
import { useApi } from "@/lib/fetch-client";
import { cn } from "@/lib/utils";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type {
	CatalogPriceField,
	CatalogPriceReport,
} from "@/lib/api/admin-types";

const FIELDS: readonly [CatalogPriceField, string][] = [
	["inputPrice", "Input"],
	["outputPrice", "Output"],
	["cachedInputPrice", "Cached input"],
	["cacheWriteInputPrice", "Cache write"],
	["imageInputPrice", "Image input"],
];
const DEFAULT_FIELDS = ["Input", "Output", "Cached input"];
const PERCENT = /^-?\d+(\.\d+)?$/;

function price(value: string | null) {
	return value === null ? "—" : `$${perTokenToPerMillion(value)}`;
}

/**
 * Changes prices of every live mapping of the selected models by a percentage
 * or to a fixed $/1M, previewing the before/after diff first.
 */
export function BulkPriceDialog({
	modelIds,
	providerIds,
	onClose,
	onDone,
}: {
	modelIds: string[];
	/** Providers serving the selected models, for an optional narrowing. */
	providerIds: string[];
	onClose: () => void;
	onDone: () => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [type, setType] = useState<"percent" | "set">("percent");
	const [value, setValue] = useState("");
	const [labels, setLabels] = useState(DEFAULT_FIELDS);
	const [provider, setProvider] = useState("all");
	const [preview, setPreview] = useState<{
		key: string;
		data: CatalogPriceReport;
	} | null>(null);
	const run = api.useMutation("post", "/admin/catalog/prices/bulk-update");

	const fields = FIELDS.filter(([, label]) => labels.includes(label)).map(
		([field]) => field,
	);
	const trimmed = value.trim();
	const valueValid =
		type === "percent"
			? PERCENT.test(trimmed) && Number(trimmed) >= -100
			: PLAIN_DECIMAL.test(trimmed);
	const body = {
		targets:
			provider === "all" ? { modelIds } : { modelIds, providerIds: [provider] },
		change: { type, value: trimmed, fields },
	};
	const key = JSON.stringify(body);
	const current = preview?.key === key ? preview.data : null;
	const changedRows = current?.rows.filter((row) => row.changed) ?? [];

	async function dryRun() {
		const data = await run.mutateAsync({ body: { ...body, dryRun: true } });
		setPreview({ key, data });
	}

	async function apply() {
		const data = await run.mutateAsync({ body });
		toast.success(`Updated prices on ${formatNumber(data.changed)} mapping(s)`);
		void invalidate("/admin/catalog", "/admin/models", "/admin/audit-logs");
		onDone();
		onClose();
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>
						Change prices of {formatNumber(modelIds.length)} model(s)
					</DialogTitle>
					<DialogDescription>
						Applies to every live mapping of the selection. Built-in mappings
						get a price override; empty prices stay empty. Results are exact and
						rounded to 12 significant digits.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 sm:grid-cols-[auto_10rem_1fr]">
					<div className="space-y-1.5">
						<Label>Change</Label>
						<Segmented
							ariaLabel="Change type"
							value={type}
							onChange={setType}
							options={[
								{ value: "percent", label: "By %" },
								{ value: "set", label: "Set $/1M" },
							]}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="bulk-price-value">
							{type === "percent" ? "Percent (e.g. -10)" : "$ per 1M tokens"}
						</Label>
						<Input
							id="bulk-price-value"
							inputMode="decimal"
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Provider</Label>
						<SimpleSelect
							ariaLabel="Provider"
							value={provider}
							onChange={setProvider}
							options={[
								{ value: "all", label: "All providers" },
								...providerIds.map((id) => ({ value: id, label: id })),
							]}
						/>
					</div>
				</div>
				<div className="space-y-1.5">
					<Label>Prices</Label>
					<ToggleChips
						options={FIELDS.map(([, label]) => label)}
						value={labels}
						onChange={setLabels}
					/>
				</div>
				{current ? (
					<div className="space-y-2">
						<div className="flex gap-1.5 text-xs">
							<Tone tone="muted">{formatNumber(current.matched)} mappings</Tone>
							<Tone tone="warn">
								{formatNumber(current.changed)} would change
							</Tone>
						</div>
						<div className="max-h-[40vh] overflow-auto rounded-md border">
							<table className="w-full text-sm">
								<thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
									<tr>
										<th className="p-2">Model · provider</th>
										{FIELDS.filter(([field]) => fields.includes(field)).map(
											([field, label]) => (
												<th key={field} className="p-2">
													{label} $/1M
												</th>
											),
										)}
									</tr>
								</thead>
								<tbody>
									{current.rows.map((row) => (
										<tr
											key={`${row.modelId}-${row.providerId}-${row.region ?? ""}`}
											className={cn(
												"border-t",
												!row.changed && "text-muted-foreground",
											)}
										>
											<td className="p-2">
												<div className="font-mono text-xs">{row.modelId}</div>
												<div className="text-xs text-muted-foreground">
													{row.providerId}
													{row.region ? ` · ${row.region}` : ""}
												</div>
											</td>
											{fields.map((field) => {
												const before = row.before[field];
												const after = row.after[field];
												return (
													<td key={field} className="p-2 tabular-nums">
														{before === after ? (
															price(before)
														) : (
															<>
																<span className="text-muted-foreground line-through">
																	{price(before)}
																</span>{" "}
																<span className="font-medium">
																	{price(after)}
																</span>
															</>
														)}
													</td>
												);
											})}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				) : null}
				<DialogFooter className="gap-2">
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant="outline"
						disabled={!valueValid || fields.length === 0 || run.isPending}
						onClick={() => void dryRun()}
					>
						{run.isPending && !current ? (
							<Loader2 className="animate-spin" />
						) : (
							<ScanSearch />
						)}
						Preview
					</Button>
					<Button
						disabled={!current || changedRows.length === 0 || run.isPending}
						onClick={() => void apply()}
					>
						{run.isPending && current ? (
							<Loader2 className="animate-spin" />
						) : (
							<Check />
						)}
						Apply {formatNumber(changedRows.length)} change
						{changedRows.length === 1 ? "" : "s"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
