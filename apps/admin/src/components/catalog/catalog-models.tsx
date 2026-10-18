"use client";

import { BarChart3, Pencil, Plus, Power, Tag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
	Pager,
	SearchInput,
	SimpleSelect,
	StatusBadge,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { ErrorState, Section } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { perTokenToPerMillion } from "@/lib/decimal";
import { useApi } from "@/lib/fetch-client";
import { formatDate } from "@/lib/utils";

import {
	Button,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@llmgateway/shared/components";
import { formatCompactNumber } from "@llmgateway/shared/number-format";

import { AddModelWizard } from "./add-model-wizard";
import { MappingEditorSheet, type MappingEditMode } from "./mapping-editor";
import { CAPABILITIES } from "./mapping-form";
import { PriceHistory } from "./price-history";

import type { CatalogMapping, CatalogModel } from "@/lib/api/admin-types";
import type { Route } from "next";

const PAGE = 50;

function activeMappings(model: CatalogModel) {
	return model.mappings.filter((m) => !m.deactivatedAt);
}

function money(perToken: string | null | undefined) {
	const value = perTokenToPerMillion(perToken);
	return value === "" ? "—" : `$${value}`;
}

/** Cheapest active input price, with its output price. */
function headlinePrice(model: CatalogModel) {
	const [first] = [...activeMappings(model)].sort(
		(a, b) => Number(a.inputPrice) - Number(b.inputPrice),
	);
	return first
		? `${money(first.inputPrice)} · ${money(first.outputPrice)}`
		: "—";
}

function maxContext(model: CatalogModel) {
	const sizes = activeMappings(model)
		.map((m) => m.contextSize ?? 0)
		.filter((n) => n > 0);
	return sizes.length ? formatCompactNumber(Math.max(...sizes)) : "—";
}

function capabilityLabels(mappings: CatalogMapping[]) {
	return CAPABILITIES.filter(
		([key]) => key !== "streaming" && mappings.some((m) => m[key] === true),
	).map(([, label]) => label);
}

function SourceBadges({ model }: { model: CatalogModel }) {
	const overrides = model.mappings.filter((m) => m.overridesBuiltin).length;
	return (
		<span className="inline-flex flex-wrap gap-1">
			{model.managed ? (
				<Tone tone="info">managed</Tone>
			) : (
				<Tone tone="muted">built-in</Tone>
			)}
			{overrides > 0 ? (
				<Tone tone="warn">
					{overrides} override{overrides > 1 ? "s" : ""}
				</Tone>
			) : null}
		</span>
	);
}

export function CatalogModels() {
	const api = useApi();
	const can = useCan();
	const [filters, setFilters] = useUrlFilters({
		q: "",
		source: "all",
		status: "all",
		provider: "all",
		model: "",
	});
	const [query, setQuery] = useState(filters.q);
	const search = useDebouncedValue(query.trim());
	const [offset, setOffset] = useState(0);
	const [wizard, setWizard] = useState(false);
	const providers = api.useQuery("get", "/admin/catalog/providers");
	const models = api.useQuery("get", "/admin/catalog/models", {
		params: {
			query: {
				search: search || undefined,
				provider: filters.provider === "all" ? undefined : filters.provider,
				managed:
					filters.source === "managed"
						? "true"
						: filters.source === "builtin"
							? "false"
							: undefined,
				status:
					filters.status === "active" || filters.status === "inactive"
						? filters.status
						: undefined,
			},
		},
	});
	const modelsError: unknown = models.error;
	const all = models.data?.models ?? [];
	const selected = all.find((m) => m.id === filters.model);
	const pageRows = all.slice(offset, offset + PAGE);

	const columns: ColumnDef<CatalogModel>[] = [
		{
			id: "name",
			accessorKey: "name",
			header: "Model",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="flex items-center gap-2 font-medium">
						{row.original.name}
						<SourceBadges model={row.original} />
					</div>
					<div className="font-mono text-xs text-muted-foreground">
						{row.original.id}
					</div>
				</div>
			),
		},
		{
			id: "providers",
			header: "Providers",
			enableSorting: false,
			cell: ({ row }) => (
				<div className="flex max-w-56 flex-wrap gap-1">
					{activeMappings(row.original).map((m) => (
						<span
							key={`${m.providerId}-${m.region ?? ""}`}
							className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
						>
							{m.providerId}
						</span>
					))}
				</div>
			),
		},
		{
			id: "price",
			header: "$/1M in · out",
			enableSorting: false,
			cell: ({ row }) => (
				<span className="tabular-nums">{headlinePrice(row.original)}</span>
			),
		},
		{
			id: "context",
			header: "Context",
			enableSorting: false,
			cell: ({ row }) => maxContext(row.original),
		},
		{
			id: "capabilities",
			header: "Capabilities",
			enableSorting: false,
			cell: ({ row }) => (
				<div className="flex max-w-64 flex-wrap gap-1">
					{capabilityLabels(activeMappings(row.original)).map((label) => (
						<Tone key={label} tone="muted">
							{label}
						</Tone>
					))}
				</div>
			),
		},
		{
			id: "status",
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
	];

	return (
		<>
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(v) => {
						setQuery(v);
						setFilters({ q: v });
						setOffset(0);
					}}
					placeholder="Model id, name or family"
				/>
				<SimpleSelect
					ariaLabel="Source"
					value={filters.source}
					onChange={(source) => {
						setFilters({ source });
						setOffset(0);
					}}
					options={[
						{ value: "all", label: "Built-in and managed" },
						{ value: "builtin", label: "Built-in" },
						{ value: "managed", label: "Managed" },
					]}
				/>
				<SimpleSelect
					ariaLabel="Status"
					value={filters.status}
					onChange={(status) => {
						setFilters({ status });
						setOffset(0);
					}}
					options={[
						{ value: "all", label: "Any status" },
						{ value: "active", label: "Active" },
						{ value: "inactive", label: "Inactive" },
					]}
				/>
				<SimpleSelect
					ariaLabel="Provider"
					value={filters.provider}
					onChange={(provider) => {
						setFilters({ provider });
						setOffset(0);
					}}
					options={[
						{ value: "all", label: "Any provider" },
						...(providers.data?.providers ?? []).map((p) => ({
							value: p.id,
							label: p.name,
						})),
					]}
				/>
				<div className="ml-auto">
					<Button
						size="sm"
						disabled={!can("POST", "/admin/catalog/models")}
						onClick={() => setWizard(true)}
					>
						<Plus /> Add model
					</Button>
				</div>
			</Toolbar>
			{modelsError ? (
				<ErrorState error={modelsError} />
			) : (
				<>
					<DataTable
						columns={columns}
						data={pageRows}
						isLoading={models.isLoading}
						getRowId={(m) => m.id}
						onRowClick={(m) => setFilters({ model: m.id })}
						empty="No models match."
					/>
					{models.data ? (
						<Pager
							offset={offset}
							limit={PAGE}
							total={all.length}
							onChange={setOffset}
						/>
					) : null}
				</>
			)}
			<AddModelWizard
				open={wizard}
				onOpenChange={setWizard}
				onCreated={(id) => setFilters({ model: id })}
			/>
			{selected ? (
				<ModelSheet
					model={selected}
					onClose={() => setFilters({ model: "" })}
				/>
			) : null}
		</>
	);
}

function ModelSheet({
	model,
	onClose,
}: {
	model: CatalogModel;
	onClose: () => void;
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [editing, setEditing] = useState<{
		mode: MappingEditMode;
		mapping?: CatalogMapping;
	} | null>(null);
	const deactivate = api.useMutation(
		"delete",
		"/admin/catalog/models/{modelId}/mappings/{providerId}",
		{
			onSuccess: () => {
				toast.success("Mapping deactivated");
				void invalidate("/admin/catalog", "/admin/audit-logs");
			},
		},
	);
	const patchModel = api.useMutation(
		"patch",
		"/admin/catalog/models/{modelId}",
		{
			onSuccess: () => {
				toast.success("Model updated");
				void invalidate("/admin/catalog");
			},
		},
	);
	const mappingPath = `/admin/catalog/models/${model.id}/mappings/_`;
	const canWrite = can("PUT", mappingPath);

	return (
		<>
			<Sheet open onOpenChange={(open) => !open && onClose()}>
				<SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
					<SheetHeader>
						<SheetTitle className="flex flex-wrap items-center gap-2">
							{model.name}
							<SourceBadges model={model} />
							<StatusBadge status={model.status} />
						</SheetTitle>
						<SheetDescription>
							<span className="font-mono">{model.id}</span> · {model.family} ·{" "}
							{model.output.join(", ")}
							{model.description ? ` · ${model.description}` : ""}
						</SheetDescription>
					</SheetHeader>
					<div className="space-y-4 px-4 pb-6">
						<div className="flex flex-wrap gap-2">
							<Button
								size="sm"
								disabled={!canWrite}
								onClick={() => setEditing({ mode: "add" })}
							>
								<Plus /> Add mapping
							</Button>
							<Button size="sm" variant="outline" asChild>
								<Link href={`/models/${encodeURIComponent(model.id)}` as Route}>
									<BarChart3 /> Traffic & stats
								</Link>
							</Button>
							{model.managed ? (
								<ConfirmAction
									title={
										model.status === "active"
											? "Deactivate model"
											: "Reactivate model"
									}
									description={
										model.status === "active"
											? "Stops routing to this managed model. Requests for it fail until reactivated."
											: "Routes this managed model again."
									}
									destructive={model.status === "active"}
									requireReason={false}
									onConfirm={() =>
										patchModel.mutateAsync({
											params: { path: { modelId: model.id } },
											body: {
												status:
													model.status === "active" ? "inactive" : "active",
											},
										})
									}
								>
									<Button
										size="sm"
										variant="outline"
										disabled={
											!can("PATCH", `/admin/catalog/models/${model.id}`)
										}
									>
										<Power />
										{model.status === "active" ? "Deactivate" : "Reactivate"}
									</Button>
								</ConfirmAction>
							) : null}
						</div>

						<Section title="Provider mappings" contentClassName="space-y-2">
							{model.mappings.map((m) => (
								<MappingCard
									key={`${m.providerId}-${m.region ?? ""}`}
									mapping={m}
									canWrite={canWrite}
									onEdit={() =>
										setEditing({
											mode: m.managed ? "edit" : "override",
											mapping: m,
										})
									}
									onDeactivate={() =>
										deactivate.mutateAsync({
											params: {
												path: { modelId: model.id, providerId: m.providerId },
											},
										})
									}
								/>
							))}
						</Section>

						<Section
							title="Price history"
							description="Mapping writes from the admin audit log."
						>
							<PriceHistory modelId={model.id} />
						</Section>
					</div>
				</SheetContent>
			</Sheet>
			{editing ? (
				<MappingEditorSheet
					model={model}
					mapping={editing.mapping}
					mode={editing.mode}
					onClose={() => setEditing(null)}
				/>
			) : null}
		</>
	);
}

function MappingCard({
	mapping: m,
	canWrite,
	onEdit,
	onDeactivate,
}: {
	mapping: CatalogMapping;
	canWrite: boolean;
	onEdit: () => void;
	onDeactivate: () => Promise<unknown>;
}) {
	const caps = capabilityLabels([m]);
	return (
		<div className="space-y-2 rounded-md border p-3">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium">{m.providerId}</span>
				<span className="font-mono text-xs text-muted-foreground">
					{m.externalId}
					{m.region ? ` · ${m.region}` : ""}
				</span>
				{m.overridesBuiltin ? (
					<Tone tone="warn">price override</Tone>
				) : m.managed ? (
					<Tone tone="info">managed</Tone>
				) : (
					<Tone tone="muted">built-in</Tone>
				)}
				{m.deactivatedAt ? (
					<Tone tone="bad">deactivated {formatDate(m.deactivatedAt)}</Tone>
				) : null}
				{m.stability && m.stability !== "stable" ? (
					<Tone tone="warn">{m.stability}</Tone>
				) : null}
				<div className="ml-auto flex gap-1">
					<Button
						size="sm"
						variant="outline"
						disabled={!canWrite}
						onClick={onEdit}
					>
						{m.managed ? <Pencil /> : <Tag />}
						{m.managed ? "Edit" : "Override price"}
					</Button>
					{m.managed && !m.deactivatedAt ? (
						<ConfirmAction
							title="Deactivate mapping"
							description={
								m.overridesBuiltin
									? "Removes the override; the built-in price applies again."
									: "Stops routing this model to this provider. The row is kept for logs."
							}
							destructive
							requireReason={false}
							confirmLabel="Deactivate"
							onConfirm={onDeactivate}
						>
							<Button size="sm" variant="ghost" disabled={!canWrite}>
								<Power /> Deactivate
							</Button>
						</ConfirmAction>
					) : null}
				</div>
			</div>
			<div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
				<div>
					<span className="text-muted-foreground">In </span>
					{money(m.inputPrice)}/1M
				</div>
				<div>
					<span className="text-muted-foreground">Out </span>
					{money(m.outputPrice)}/1M
				</div>
				<div>
					<span className="text-muted-foreground">Cached </span>
					{money(m.cachedInputPrice)}
				</div>
				<div>
					<span className="text-muted-foreground">Context </span>
					{m.contextSize ? formatCompactNumber(m.contextSize) : "—"}
				</div>
			</div>
			{caps.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{caps.map((label) => (
						<Tone key={label} tone="muted">
							{label}
						</Tone>
					))}
				</div>
			) : null}
		</div>
	);
}
