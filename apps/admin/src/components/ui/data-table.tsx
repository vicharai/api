"use client";

import {
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
	type ColumnDef,
	type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@llmgateway/shared/components";

import { EmptyState, LoadingRows } from "./page";

export type { ColumnDef } from "@tanstack/react-table";

interface DataTableProps<T> {
	columns: ColumnDef<T>[];
	data: T[] | undefined;
	isLoading?: boolean;
	empty?: ReactNode;
	getRowId?: (row: T) => string;
	onRowClick?: (row: T) => void;
	/** Server-driven sorting: when set, header clicks call this instead of sorting locally. */
	sort?: { id: string; desc: boolean };
	onSortChange?: (sort: { id: string; desc: boolean }) => void;
	rowClassName?: (row: T) => string | undefined;
}

export function DataTable<T>({
	columns,
	data,
	isLoading,
	empty = "Nothing here yet.",
	getRowId,
	onRowClick,
	sort,
	onSortChange,
	rowClassName,
}: DataTableProps<T>) {
	const [localSorting, setLocalSorting] = useState<SortingState>([]);
	const manual = Boolean(onSortChange);
	const sorting: SortingState = manual ? (sort ? [sort] : []) : localSorting;

	const table = useReactTable({
		data: data ?? [],
		columns,
		getRowId,
		state: { sorting },
		manualSorting: manual,
		onSortingChange: (updater) => {
			const next = typeof updater === "function" ? updater(sorting) : updater;
			if (manual) {
				const first = next[0];
				if (first) {
					onSortChange?.({ id: first.id, desc: first.desc });
				} else if (sort) {
					onSortChange?.({ id: sort.id, desc: !sort.desc });
				}
			} else {
				setLocalSorting(next);
			}
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: manual ? undefined : getSortedRowModel(),
	});

	if (isLoading) {
		return <LoadingRows />;
	}

	return (
		<div className="overflow-x-auto rounded-md border">
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((group) => (
						<TableRow key={group.id}>
							{group.headers.map((header) => {
								const canSort = header.column.getCanSort();
								const dir = header.column.getIsSorted();
								return (
									<TableHead key={header.id} className="whitespace-nowrap">
										{header.isPlaceholder ? null : canSort ? (
											<button
												type="button"
												className="inline-flex items-center gap-1 hover:text-foreground"
												onClick={header.column.getToggleSortingHandler()}
											>
												{flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
												{dir === "asc" ? (
													<ArrowUp className="size-3" />
												) : dir === "desc" ? (
													<ArrowDown className="size-3" />
												) : (
													<ArrowUpDown className="size-3 opacity-40" />
												)}
											</button>
										) : (
											flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)
										)}
									</TableHead>
								);
							})}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.length === 0 ? (
						<TableRow>
							<TableCell colSpan={columns.length}>
								<EmptyState>{empty}</EmptyState>
							</TableCell>
						</TableRow>
					) : (
						table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								className={cn(
									onRowClick && "cursor-pointer",
									rowClassName?.(row.original),
								)}
								onClick={
									onRowClick ? () => onRowClick(row.original) : undefined
								}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id} className="whitespace-nowrap">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}
