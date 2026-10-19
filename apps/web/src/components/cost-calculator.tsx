"use client";

import { useMemo, useState } from "react";

import { formatPrice, type CatalogModel } from "@/lib/models";

const FEE_RATE = 0.05;

export function CostCalculator({ models }: { models: CatalogModel[] }) {
	const paid = useMemo(() => models.filter((m) => !m.free), [models]);
	const [modelId, setModelId] = useState(paid[0]?.id ?? "");
	const [inputM, setInputM] = useState("50");
	const [outputM, setOutputM] = useState("10");

	const model = paid.find((m) => m.id === modelId);
	const inM = Number(inputM) || 0;
	const outM = Number(outputM) || 0;
	const inputCost = inM * (model?.inputPerMillion ?? 0);
	const outputCost = outM * (model?.outputPerMillion ?? 0);
	const modelCost = inputCost + outputCost;
	const fee = modelCost * FEE_RATE;
	const total = modelCost + fee;

	const inputCls =
		"h-12 rounded-xl border border-input bg-card px-4 text-base text-foreground outline-none transition-colors focus:border-g-blue focus:ring-2 focus:ring-ring";

	return (
		<div className="overflow-hidden rounded-[28px] border border-border bg-card">
			<div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-8">
				<label className="flex flex-col gap-2 text-sm font-medium text-body sm:col-span-3 lg:col-span-1">
					Model
					<select
						value={modelId}
						onChange={(e) => setModelId(e.target.value)}
						className={inputCls}
					>
						{paid.map((m) => (
							<option key={m.id} value={m.id}>
								{m.displayName}
							</option>
						))}
					</select>
				</label>
				<div className="grid grid-cols-2 gap-3 sm:col-span-3 lg:col-span-2">
					<label className="flex flex-col gap-2 text-sm font-medium text-body">
						Input / month
						<span className="relative">
							<input
								type="number"
								min="0"
								inputMode="decimal"
								value={inputM}
								onChange={(e) => setInputM(e.target.value)}
								className={`${inputCls} w-full pr-16`}
							/>
							<span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
								M tok
							</span>
						</span>
					</label>
					<label className="flex flex-col gap-2 text-sm font-medium text-body">
						Output / month
						<span className="relative">
							<input
								type="number"
								min="0"
								inputMode="decimal"
								value={outputM}
								onChange={(e) => setOutputM(e.target.value)}
								className={`${inputCls} w-full pr-16`}
							/>
							<span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
								M tok
							</span>
						</span>
					</label>
				</div>
			</div>

			<div className="bg-g-blue-soft p-5 sm:p-8">
				<div className="flex flex-wrap items-end justify-between gap-2">
					<p className="text-sm font-medium text-g-blue-deep">
						Estimated monthly total
					</p>
					<p className="text-[40px] font-normal leading-none tracking-tight text-foreground tabular-nums sm:text-[48px]">
						${total.toFixed(2)}
					</p>
				</div>
				<dl className="mt-6 space-y-3 border-t border-g-blue/20 pt-5 text-[15px]">
					<div className="flex items-start justify-between gap-4">
						<dt className="min-w-0">
							<span className="block">
								{model?.displayName ?? "Model"} usage
							</span>
							{model && (
								<span className="mt-0.5 block font-mono text-xs text-body">
									{formatPrice(model.inputPerMillion)} in ·{" "}
									{formatPrice(model.outputPerMillion)} out per 1M
								</span>
							)}
						</dt>
						<dd className="shrink-0 font-mono tabular-nums">
							${modelCost.toFixed(2)}
						</dd>
					</div>
					<div className="flex items-start justify-between gap-4">
						<dt>Platform fee (5%)</dt>
						<dd className="shrink-0 font-mono tabular-nums">
							${fee.toFixed(2)}
						</dd>
					</div>
				</dl>
			</div>
		</div>
	);
}
