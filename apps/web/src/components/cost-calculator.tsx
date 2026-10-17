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
		"h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring";

	return (
		<div className="rounded-xl border border-border bg-card p-6 sm:p-8">
			<h3 className="font-display text-lg font-semibold tracking-tight">
				Estimate a month
			</h3>
			<div className="mt-6 grid gap-4 sm:grid-cols-3">
				<label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
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
				<label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
					Input tokens / month (M)
					<input
						type="number"
						min="0"
						value={inputM}
						onChange={(e) => setInputM(e.target.value)}
						className={inputCls}
					/>
				</label>
				<label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
					Output tokens / month (M)
					<input
						type="number"
						min="0"
						value={outputM}
						onChange={(e) => setOutputM(e.target.value)}
						className={inputCls}
					/>
				</label>
			</div>

			<dl className="mt-8 space-y-3 border-t border-border pt-6 text-sm">
				<div className="flex justify-between">
					<dt className="text-muted-foreground">
						{model?.displayName ?? "Model"} usage
						{model && (
							<span className="ml-2 font-mono text-xs text-muted-foreground">
								{formatPrice(model.inputPerMillion)} in /{" "}
								{formatPrice(model.outputPerMillion)} out
							</span>
						)}
					</dt>
					<dd className="font-mono">${modelCost.toFixed(2)}</dd>
				</div>
				<div className="flex justify-between">
					<dt className="text-muted-foreground">Platform fee (5%)</dt>
					<dd className="font-mono">${fee.toFixed(2)}</dd>
				</div>
				<div className="flex justify-between border-t border-border pt-3 font-medium">
					<dt>Monthly total</dt>
					<dd className="font-mono">${total.toFixed(2)}</dd>
				</div>
			</dl>
		</div>
	);
}
