"use client";

import { useState } from "react";

import { Checkbox } from "@llmgateway/shared/components";

import type { ColumnDef } from "@/components/ui/data-table";

export interface RowSelection<T extends { id: string }> {
	selected: T[];
	isSelected: (id: string) => boolean;
	toggle: (row: T) => void;
	setMany: (rows: T[], checked: boolean) => void;
	clear: () => void;
}

/** Row selection keyed by id; survives paging and re-sorting. */
export function useRowSelection<T extends { id: string }>(): RowSelection<T> {
	const [map, setMap] = useState<Map<string, T>>(() => new Map());

	return {
		selected: [...map.values()],
		isSelected: (id) => map.has(id),
		toggle: (row) =>
			setMap((prev) => {
				const next = new Map(prev);
				if (next.has(row.id)) {
					next.delete(row.id);
				} else {
					next.set(row.id, row);
				}
				return next;
			}),
		setMany: (rows, checked) =>
			setMap((prev) => {
				const next = new Map(prev);
				for (const row of rows) {
					if (checked) {
						next.set(row.id, row);
					} else {
						next.delete(row.id);
					}
				}
				return next;
			}),
		clear: () => setMap(new Map()),
	};
}

/** Checkbox column for `DataTable`; `toRef` picks what the bulk actions need. */
export function selectionColumn<Row, T extends { id: string }>(
	selection: RowSelection<T>,
	toRef: (row: Row) => T,
): ColumnDef<Row> {
	return {
		id: "select",
		enableSorting: false,
		header: ({ table }) => {
			const rows = table.getRowModel().rows.map((r) => toRef(r.original));
			const count = rows.filter((r) => selection.isSelected(r.id)).length;
			return (
				<Checkbox
					aria-label="Select all on this page"
					checked={count > 0 && count === rows.length}
					onCheckedChange={(v) => selection.setMany(rows, v === true)}
				/>
			);
		},
		cell: ({ row }) => {
			const ref = toRef(row.original);
			return (
				<div onClick={(e) => e.stopPropagation()}>
					<Checkbox
						aria-label="Select row"
						checked={selection.isSelected(ref.id)}
						onCheckedChange={() => selection.toggle(ref)}
					/>
				</div>
			);
		},
	};
}
