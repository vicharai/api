"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
	LAB_LABELS,
	formatContext,
	formatPrice,
	labForModel,
	type CatalogModel,
} from "@/lib/models";

type SortKey = "name" | "input" | "context";

const FILTERS = [
	{ key: "all", label: "All" },
	{ key: "paid", label: "Production" },
	{ key: "free", label: "Experimental" },
] as const;

export function ModelsTable({ models }: { models: CatalogModel[] }) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
	const [sort, setSort] = useState<SortKey>("name");

	const rows = useMemo(() => {
		const q = query.trim().toLowerCase();
		let list = models.filter(
			(m) =>
				(!q ||
					m.id.toLowerCase().includes(q) ||
					m.displayName.toLowerCase().includes(q)) &&
				(filter === "all" || (filter === "free" ? m.free : !m.free)),
		);
		list = [...list].sort((a, b) => {
			if (sort === "input") {
				return (
					(a.inputPerMillion ?? Infinity) - (b.inputPerMillion ?? Infinity)
				);
			}
			if (sort === "context") {
				return b.contextLength - a.contextLength;
			}
			return a.displayName.localeCompare(b.displayName);
		});
		return list;
	}, [models, query, filter, sort]);

	return (
		<div>
			<div className="flex flex-wrap items-center gap-3">
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search models..."
					aria-label="Search models"
					className="h-10 w-full max-w-xs rounded-lg border border-input bg-card px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
				/>
				<div className="flex gap-1 rounded-lg border border-border p-1">
					{FILTERS.map((f) => (
						<button
							key={f.key}
							type="button"
							onClick={() => setFilter(f.key)}
							className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
								filter === f.key
									? "bg-secondary text-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{f.label}
						</button>
					))}
				</div>
				<label className="flex items-center gap-2 text-xs text-muted-foreground">
					Sort
					<select
						value={sort}
						onChange={(e) => setSort(e.target.value as SortKey)}
						className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground outline-none"
					>
						<option value="name">Name</option>
						<option value="input">Input price</option>
						<option value="context">Context</option>
					</select>
				</label>
			</div>
			<p className="mt-4 text-xs text-muted-foreground">
				{rows.length} {rows.length === 1 ? "model" : "models"}
			</p>

			{/* Desktop table */}
			<div className="mt-4 hidden overflow-hidden rounded-xl border border-border bg-card md:block">
				<table className="w-full text-left text-sm">
					<thead>
						<tr className="border-b border-border text-xs text-muted-foreground">
							<th className="px-4 py-3 font-medium">Model</th>
							<th className="px-4 py-3 font-medium">Lab</th>
							<th className="px-4 py-3 font-medium">Context</th>
							<th className="px-4 py-3 font-medium">Input /M</th>
							<th className="px-4 py-3 font-medium">Output /M</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((m) => (
							<tr
								key={m.id}
								className="border-b border-border/50 last:border-0 hover:bg-accent/40"
							>
								<td className="px-4 py-3">
									<Link
										href={`/models/${m.id}/`}
										className="font-medium hover:text-brand"
									>
										{m.displayName}
									</Link>
									<div className="font-mono text-xs text-muted-foreground">
										{m.id}
									</div>
								</td>
								<td className="px-4 py-3 text-muted-foreground">
									{LAB_LABELS[labForModel(m)] ?? "—"}
								</td>
								<td className="px-4 py-3 text-muted-foreground">
									{formatContext(m.contextLength)}
								</td>
								<td className="px-4 py-3 font-mono text-xs">
									{formatPrice(m.inputPerMillion)}
								</td>
								<td className="px-4 py-3 font-mono text-xs">
									{formatPrice(m.outputPerMillion)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Mobile cards */}
			<ul className="mt-4 space-y-3 md:hidden">
				{rows.map((m) => (
					<li
						key={m.id}
						className="rounded-xl border border-border bg-card p-4"
					>
						<div className="flex items-start justify-between gap-3">
							<div>
								<Link
									href={`/models/${m.id}/`}
									className="font-medium hover:text-brand"
								>
									{m.displayName}
								</Link>
								<div className="font-mono text-xs text-muted-foreground">
									{m.id}
								</div>
							</div>
							{m.free && (
								<span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
									Experimental
								</span>
							)}
						</div>
						<dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
							<div>
								<dt className="text-muted-foreground">Context</dt>
								<dd>{formatContext(m.contextLength)}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Input /M</dt>
								<dd className="font-mono">{formatPrice(m.inputPerMillion)}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Output /M</dt>
								<dd className="font-mono">{formatPrice(m.outputPerMillion)}</dd>
							</div>
						</dl>
					</li>
				))}
			</ul>

			{rows.length === 0 && (
				<p className="mt-8 text-sm text-muted-foreground">
					No models match this search.
				</p>
			)}
		</div>
	);
}
