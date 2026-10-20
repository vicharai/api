"use client";

import { Download, FileUp, Loader2, ScanSearch, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Segmented, Tone } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi, useFetchClient } from "@/lib/fetch-client";
import { downloadBlob, errorMessage } from "@/lib/utils";

import { buildCsv, CATALOG_IMPORT_COLUMNS } from "@llmgateway/shared";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Label,
	Textarea,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import type { CatalogImportReport } from "@/lib/api/admin-types";

type Format = "csv" | "json";
type Scope = "managed" | "all";

const MAX_BYTES = 2 * 1024 * 1024;

const EXAMPLE: Record<(typeof CATALOG_IMPORT_COLUMNS)[number], string> = {
	modelId: "acme-large",
	name: "Acme Large",
	family: "acme",
	providerId: "my-provider",
	externalId: "acme/acme-large",
	inputPricePerM: "1.5",
	outputPricePerM: "6",
	cachedInputPricePerM: "0.15",
	contextSize: "131072",
	maxOutput: "8192",
	vision: "false",
	tools: "true",
	jsonOutput: "true",
	reasoning: "false",
	streaming: "true",
};

function template(format: Format): Blob {
	if (format === "csv") {
		const header = [...CATALOG_IMPORT_COLUMNS];
		return new Blob(
			[`${buildCsv(header, [header.map((column) => EXAMPLE[column])])}\n`],
			{ type: "text/csv;charset=utf-8" },
		);
	}
	return new Blob([`${JSON.stringify([EXAMPLE], null, 2)}\n`], {
		type: "application/json",
	});
}

const ACTION_TONES = {
	create: "good",
	update: "warn",
	unchanged: "muted",
	builtin: "muted",
} as const;

function Action({ value }: { value: keyof typeof ACTION_TONES | null }) {
	return value ? <Tone tone={ACTION_TONES[value]}>{value}</Tone> : null;
}

/**
 * Bulk import of models and mappings from pasted or uploaded JSON/CSV: a dry
 * run validates every row first, then Apply writes them in one transaction.
 */
export function CatalogImportDialog({ onClose }: { onClose: () => void }) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [format, setFormat] = useState<Format>("csv");
	const [content, setContent] = useState("");
	const [report, setReport] = useState<{
		key: string;
		data: CatalogImportReport;
	} | null>(null);
	const run = api.useMutation("post", "/admin/catalog/import");
	const key = `${format}\u0000${content}`;
	const current = report?.key === key ? report.data : null;
	const tooBig = new Blob([content]).size > MAX_BYTES;

	async function dryRun() {
		const data = await run.mutateAsync({
			body: { format, content, dryRun: true },
		});
		setReport({ key, data });
	}

	async function apply() {
		const data = await run.mutateAsync({ body: { format, content } });
		const s = data.summary;
		toast.success(
			`Imported: ${formatNumber(s.modelsCreated)} new model(s), ${formatNumber(s.mappingsCreated)} new and ${formatNumber(s.mappingsUpdated)} updated mapping(s)`,
		);
		void invalidate("/admin/catalog", "/admin/models", "/admin/audit-logs");
		onClose();
	}

	async function upload(file: File) {
		if (file.size > MAX_BYTES) {
			toast.error("Files are limited to 2 MB");
			return;
		}
		setFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "csv");
		setContent(await file.text());
	}

	const rows = current
		? [...current.rows].sort(
				(a, b) => Number(b.errors.length > 0) - Number(a.errors.length > 0),
			)
		: [];
	const changes = current
		? current.summary.modelsCreated +
			current.summary.modelsUpdated +
			current.summary.mappingsCreated +
			current.summary.mappingsUpdated
		: 0;

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Import models</DialogTitle>
					<DialogDescription>
						One row per model and provider; prices in $ per 1M tokens. New model
						ids become managed models, existing pairs are updated (built-in
						pairs get a price override), and empty optional cells keep the
						current value. The export uses the same columns.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-wrap items-center gap-2">
					<Segmented
						ariaLabel="Format"
						value={format}
						onChange={setFormat}
						options={[
							{ value: "csv", label: "CSV" },
							{ value: "json", label: "JSON" },
						]}
					/>
					<Button size="sm" variant="outline" asChild>
						<label className="cursor-pointer">
							<FileUp /> Upload file
							<input
								type="file"
								accept=".csv,.json,text/csv,application/json"
								className="sr-only"
								onChange={(e) => {
									const file = e.target.files?.[0];
									e.target.value = "";
									if (file) {
										void upload(file);
									}
								}}
							/>
						</label>
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() =>
							downloadBlob(`catalog-template.${format}`, template(format))
						}
					>
						<Download /> Template
					</Button>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="catalog-import-content" className="sr-only">
						Rows
					</Label>
					<Textarea
						id="catalog-import-content"
						rows={7}
						className="font-mono text-xs"
						placeholder={
							format === "csv"
								? `${CATALOG_IMPORT_COLUMNS.join(",")}\n…`
								: '[{"modelId": "…", "providerId": "…", …}]'
						}
						value={content}
						onChange={(e) => setContent(e.target.value)}
					/>
					{tooBig ? (
						<p className="text-xs text-destructive">Limited to 2 MB.</p>
					) : null}
				</div>
				{current ? (
					<div className="space-y-2">
						<div className="flex flex-wrap gap-1.5 text-xs">
							<Tone tone="muted">
								{formatNumber(current.summary.rows)} rows
							</Tone>
							{current.summary.errors > 0 ? (
								<Tone tone="bad">
									{formatNumber(current.summary.errors)} with errors
								</Tone>
							) : null}
							<Tone tone="good">
								{formatNumber(current.summary.modelsCreated)} new models
							</Tone>
							<Tone tone="good">
								{formatNumber(current.summary.mappingsCreated)} new mappings
							</Tone>
							<Tone tone="warn">
								{formatNumber(current.summary.mappingsUpdated)} updated
							</Tone>
							<Tone tone="muted">
								{formatNumber(current.summary.unchanged)} unchanged
							</Tone>
						</div>
						<div className="max-h-[35vh] overflow-auto rounded-md border">
							<table className="w-full text-sm">
								<thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
									<tr>
										<th className="p-2">Row</th>
										<th className="p-2">Model</th>
										<th className="p-2">Provider · upstream id</th>
										<th className="p-2">Model</th>
										<th className="p-2">Mapping</th>
										<th className="p-2">Problems</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((row) => (
										<tr key={row.row} className="border-t align-top">
											<td className="p-2 tabular-nums">{row.row}</td>
											<td className="p-2 font-mono text-xs">{row.modelId}</td>
											<td className="p-2 font-mono text-xs">
												{row.providerId}
												<span className="text-muted-foreground">
													{" "}
													· {row.externalId}
												</span>
											</td>
											<td className="p-2">
												<Action value={row.model} />
											</td>
											<td className="p-2">
												<Action value={row.mapping} />
											</td>
											<td className="p-2 text-xs text-destructive">
												{row.errors.join("; ")}
											</td>
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
						disabled={!content.trim() || tooBig || run.isPending}
						onClick={() => void dryRun()}
					>
						{run.isPending && !current ? (
							<Loader2 className="animate-spin" />
						) : (
							<ScanSearch />
						)}
						Dry run
					</Button>
					<Button
						disabled={
							!current ||
							current.summary.errors > 0 ||
							changes === 0 ||
							run.isPending
						}
						onClick={() => void apply()}
					>
						{run.isPending && current ? (
							<Loader2 className="animate-spin" />
						) : (
							<Upload />
						)}
						Apply {current ? formatNumber(changes) : ""} change
						{changes === 1 ? "" : "s"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** Downloads managed (or all) live mappings in the import row shape. */
export function CatalogExportDialog({ onClose }: { onClose: () => void }) {
	const fetchClient = useFetchClient();
	const [format, setFormat] = useState<Format>("csv");
	const [scope, setScope] = useState<Scope>("managed");
	const [pending, setPending] = useState(false);

	async function download() {
		setPending(true);
		try {
			const { data, error } = await fetchClient.GET("/admin/catalog/export", {
				params: { query: { format, scope } },
				parseAs: "blob",
			});
			if (error || !data) {
				throw new Error(error ? errorMessage(error) : "Export failed");
			}
			downloadBlob(`catalog-${scope}.${format}`, data);
			onClose();
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setPending(false);
		}
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Export catalog</DialogTitle>
					<DialogDescription>
						Live default-region mappings with $/1M prices, in the columns the
						import reads, so an edited file can be imported back.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label>Rows</Label>
						<Segmented
							ariaLabel="Scope"
							value={scope}
							onChange={setScope}
							options={[
								{ value: "managed", label: "Managed and overrides" },
								{ value: "all", label: "Everything" },
							]}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Format</Label>
						<Segmented
							ariaLabel="Format"
							value={format}
							onChange={setFormat}
							options={[
								{ value: "csv", label: "CSV" },
								{ value: "json", label: "JSON" },
							]}
						/>
					</div>
				</div>
				<DialogFooter className="gap-2">
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button disabled={pending} onClick={() => void download()}>
						{pending ? <Loader2 className="animate-spin" /> : <Download />}
						Download
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
