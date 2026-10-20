/**
 * Columns of the admin catalog's bulk import/export rows, in file order.
 * Prices are USD per 1M tokens; empty optional cells leave a value unchanged.
 */
export const CATALOG_IMPORT_COLUMNS = [
	"modelId",
	"name",
	"family",
	"providerId",
	"externalId",
	"inputPricePerM",
	"outputPricePerM",
	"cachedInputPricePerM",
	"contextSize",
	"maxOutput",
	"vision",
	"tools",
	"jsonOutput",
	"reasoning",
	"streaming",
] as const;

export type CatalogImportColumn = (typeof CATALOG_IMPORT_COLUMNS)[number];

export const CATALOG_IMPORT_REQUIRED_COLUMNS: readonly CatalogImportColumn[] = [
	"modelId",
	"providerId",
	"externalId",
	"inputPricePerM",
	"outputPricePerM",
];
