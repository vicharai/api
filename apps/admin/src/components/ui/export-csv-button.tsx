"use client";

import { Download } from "lucide-react";

import { exportRowsToCsv, type CsvColumn } from "@/lib/csv";

import { Button } from "@llmgateway/shared/components";

/** CSV download for any table: pass the rows it shows and the columns to export. */
export function ExportCsvButton<T>({
	filename,
	columns,
	rows,
	label = "Export CSV",
}: {
	filename: string;
	columns: readonly CsvColumn<T>[];
	rows: readonly T[] | undefined;
	label?: string;
}) {
	return (
		<Button
			variant="outline"
			size="sm"
			disabled={!rows || rows.length === 0}
			onClick={() => {
				if (rows) {
					exportRowsToCsv(filename, columns, rows);
				}
			}}
		>
			<Download /> {label}
		</Button>
	);
}
