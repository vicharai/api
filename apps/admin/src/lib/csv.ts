import { downloadCsv } from "@/lib/utils";

import { buildCsv } from "@llmgateway/shared";

export interface CsvColumn<T> {
	header: string;
	value: (row: T) => unknown;
}

/** Downloads `rows` as a CSV file with one column per entry in `columns`. */
export function exportRowsToCsv<T>(
	filename: string,
	columns: readonly CsvColumn<T>[],
	rows: readonly T[],
) {
	downloadCsv(
		filename.endsWith(".csv") ? filename : `${filename}.csv`,
		buildCsv(
			columns.map((c) => c.header),
			rows.map((row) => columns.map((c) => c.value(row) ?? "")),
		),
	);
}
