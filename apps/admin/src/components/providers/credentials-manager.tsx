"use client";

import {
	ArrowDown,
	ArrowUp,
	FlaskConical,
	ListChecks,
	Loader2,
	Pencil,
	Plus,
	Power,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ChipPicker } from "@/components/ui/chip-picker";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
	SimpleSelect,
	StatusBadge,
	Toolbar,
	Tone,
} from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, Section } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatUsd } from "@/lib/utils";

import {
	Button,
	Checkbox,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Input,
	Label,
	SearchableSelect,
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import { KeyUsage } from "./key-usage";

import type { ApiData } from "@/lib/api/types";

type Credential = ApiData<"/admin/provider-credentials">["credentials"][number];
type Catalog = ApiData<"/admin/provider-credentials/catalog">;
type CatalogProvider = Catalog["providers"][number];
type Variant = "default" | "enterprise" | "plans";

const ALL = "__all__";

export function CredentialsManager() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [provider, setProvider] = useState(ALL);
	const [inspect, setInspect] = useState<Credential | null>(null);
	const catalog = api.useQuery("get", "/admin/provider-credentials/catalog");
	const list = api.useQuery("get", "/admin/provider-credentials", {
		params: { query: { provider: provider === ALL ? undefined : provider } },
	});
	const refresh = () => invalidate("/admin/provider-credentials");

	const patch = api.useMutation("patch", "/admin/provider-credentials/{id}", {
		onSuccess: () => {
			toast.success("Credential updated");
			void refresh();
		},
	});
	const remove = api.useMutation("delete", "/admin/provider-credentials/{id}", {
		onSuccess: () => {
			toast.success("Credential deleted");
			void refresh();
		},
	});
	const order = api.useMutation("put", "/admin/provider-credentials/order", {
		onSuccess: () => {
			toast.success("Order saved");
			void refresh();
		},
	});
	const selfTest = api.useMutation(
		"post",
		"/admin/provider-credentials/self-test",
		{
			onSuccess: (res) => {
				if (res.valid) {
					toast.success(
						`Credential works${res.model ? ` (${res.model})` : ""}`,
					);
				} else {
					toast.error(
						`Test failed${res.statusCode ? ` (${res.statusCode})` : ""}: ${res.error ?? "unknown error"}`,
					);
				}
			},
		},
	);

	const catalogById = new Map(
		(catalog.data?.providers ?? []).map((p) => [p.id, p]),
	);
	const rows = list.data?.credentials ?? [];

	function move(cred: Credential, delta: number) {
		const same = rows.filter((r) => r.provider === cred.provider);
		const idx = same.findIndex((r) => r.id === cred.id);
		const target = idx + delta;
		if (target < 0 || target >= same.length) {
			return;
		}
		const ids = same.map((r) => r.id);
		[ids[idx], ids[target]] = [ids[target], ids[idx]];
		order.mutate({ body: { provider: cred.provider, credentialIds: ids } });
	}

	const columns: ColumnDef<Credential>[] = [
		{
			accessorKey: "provider",
			header: "Provider",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="font-medium">
						{catalogById.get(row.original.provider)?.name ??
							row.original.provider}
					</div>
					<div className="flex gap-1">
						{row.original.variant !== "default" ? (
							<Tone tone="info">{row.original.variant}</Tone>
						) : null}
						{row.original.region ? (
							<Tone tone="muted">{row.original.region}</Tone>
						) : null}
					</div>
				</div>
			),
		},
		{
			accessorKey: "maskedToken",
			header: "Key",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<code className="text-xs">{row.original.maskedToken}</code>
					<div className="max-w-48 truncate text-xs text-muted-foreground">
						{row.original.comment ?? ""}
					</div>
				</div>
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			id: "24h",
			header: "Last 24h",
			cell: ({ row }) => {
				const s = row.original.last24h;
				return (
					<span className="text-xs tabular-nums">
						{formatNumber(s.requestCount)} req
						{s.errorCount ? (
							<span className="text-destructive">
								{" "}
								· {formatNumber(s.errorCount)} err ({s.upstreamErrorCount}u)
							</span>
						) : null}
					</span>
				);
			},
		},
		{
			id: "7d",
			header: "7d cost",
			cell: ({ row }) =>
				formatUsd(row.original.last7dDaily.reduce((sum, d) => sum + d.cost, 0)),
		},
		{
			id: "usage",
			header: "Usage",
			cell: ({ row }) =>
				`${formatUsd(row.original.usage)}${row.original.usageLimit ? ` / ${formatUsd(row.original.usageLimit)}` : ""}`,
		},
		{
			id: "models",
			header: "Models",
			cell: ({ row }) =>
				row.original.allowedModels?.length
					? `${row.original.allowedModels.length} allowed`
					: "all",
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const c = row.original;
				const active = c.status !== "inactive";
				const canEdit = can("PATCH", `/admin/provider-credentials/${c.id}`);
				return (
					<div
						className="flex justify-end gap-0.5"
						onClick={(e) => e.stopPropagation()}
					>
						{provider !== ALL ? (
							<>
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label="Move up"
									disabled={!can("PUT", "/admin/provider-credentials/order")}
									onClick={() => move(c, -1)}
								>
									<ArrowUp />
								</Button>
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label="Move down"
									disabled={!can("PUT", "/admin/provider-credentials/order")}
									onClick={() => move(c, 1)}
								>
									<ArrowDown />
								</Button>
							</>
						) : null}
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Test"
							title="Self-test"
							disabled={
								selfTest.isPending ||
								!can("POST", "/admin/provider-credentials/self-test")
							}
							onClick={() => selfTest.mutate({ body: { credentialId: c.id } })}
						>
							<FlaskConical />
						</Button>
						<VerifyModelsDialog
							credential={c}
							catalog={catalogById.get(c.provider)}
						/>
						<CredentialDialog
							catalog={catalog.data}
							credential={c}
							disabled={!canEdit}
						/>
						<ConfirmAction
							title={active ? "Disable credential" : "Enable credential"}
							description={
								active
									? "The gateway stops routing through this key."
									: "The gateway can route through this key again."
							}
							confirmLabel={active ? "Disable" : "Enable"}
							destructive={active}
							onConfirm={() =>
								patch.mutateAsync({
									params: { path: { id: c.id } },
									body: { status: active ? "inactive" : "active" },
								})
							}
						>
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label={active ? "Disable" : "Enable"}
								disabled={!canEdit}
							>
								<Power
									className={active ? undefined : "text-muted-foreground"}
								/>
							</Button>
						</ConfirmAction>
						<ConfirmAction
							title="Delete credential"
							description={`${c.provider} ${c.maskedToken}`}
							confirmLabel="Delete"
							destructive
							onConfirm={() =>
								remove.mutateAsync({ params: { path: { id: c.id } } })
							}
						>
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label="Delete"
								disabled={!can("DELETE", `/admin/provider-credentials/${c.id}`)}
							>
								<Trash2 />
							</Button>
						</ConfirmAction>
					</div>
				);
			},
		},
	];

	const selectedCatalog =
		provider === ALL ? undefined : catalogById.get(provider);

	return (
		<div className="space-y-4">
			<Section
				title="Platform credentials"
				description="Database-managed upstream keys, tried in order before environment keys. Click a row for spend and per-model errors."
				actions={
					<CredentialDialog
						catalog={catalog.data}
						defaultProvider={provider === ALL ? undefined : provider}
						disabled={!can("POST", "/admin/provider-credentials")}
					/>
				}
			>
				<Toolbar>
					<div className="w-64">
						<SearchableSelect
							value={provider}
							onValueChange={setProvider}
							options={[
								{ value: ALL, label: "All providers" },
								...(catalog.data?.providers ?? []).map((p) => ({
									value: p.id,
									label: p.name,
									keywords: p.id,
								})),
							]}
						/>
					</div>
					{provider !== ALL ? (
						<span className="text-xs text-muted-foreground">
							Use the arrows to change the order keys are tried in.
						</span>
					) : null}
				</Toolbar>
				{selectedCatalog ? <EnvCredentials provider={selectedCatalog} /> : null}
				<QueryState query={list}>
					{(data) => (
						<DataTable
							columns={columns}
							data={data.credentials}
							getRowId={(c) => c.id}
							onRowClick={setInspect}
							empty="No database credentials."
						/>
					)}
				</QueryState>
			</Section>
			<Sheet
				open={inspect !== null}
				onOpenChange={(v) => !v && setInspect(null)}
			>
				<SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
					<SheetHeader>
						<SheetTitle>
							{inspect?.provider} · {inspect?.maskedToken}
						</SheetTitle>
					</SheetHeader>
					{inspect ? <KeyUsage providerKeyId={inspect.id} /> : null}
				</SheetContent>
			</Sheet>
		</div>
	);
}

function EnvCredentials({ provider }: { provider: CatalogProvider }) {
	return (
		<div className="mb-4 rounded-md border p-3 text-sm">
			<div className="mb-1 font-medium">Environment keys</div>
			{provider.envCredentials.length === 0 ? (
				<p className="text-muted-foreground">
					None configured
					{provider.apiKeyEnvVar ? ` (${provider.apiKeyEnvVar})` : ""}.
				</p>
			) : (
				<ul className="space-y-0.5 text-xs">
					{provider.envCredentials.map((e) => (
						<li key={e.tokenHash}>
							<code>{e.maskedToken}</code> · {e.envVar}
							{e.variant !== "default" ? ` · ${e.variant}` : ""}
							{e.region ? ` · ${e.region}` : ""}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function CredentialDialog({
	catalog,
	credential,
	defaultProvider,
	disabled,
}: {
	catalog: Catalog | undefined;
	credential?: Credential;
	defaultProvider?: string;
	disabled?: boolean;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [form, setForm] = useState(() => ({
		provider: credential?.provider ?? defaultProvider ?? "",
		token: "",
		comment: credential?.comment ?? "",
		variant: (credential?.variant ?? "default") as Variant,
		region: credential?.region ?? "",
		usageLimit: credential?.usageLimit ?? "",
		allowedModels: credential?.allowedModels ?? [],
		config: credential?.config ?? ({} as Record<string, string>),
		skipValidation: false,
	}));
	const onSuccess = () => {
		toast.success(credential ? "Credential updated" : "Credential added");
		void invalidate("/admin/provider-credentials");
	};
	const create = api.useMutation("post", "/admin/provider-credentials", {
		onSuccess,
	});
	const update = api.useMutation("patch", "/admin/provider-credentials/{id}", {
		onSuccess,
	});
	const providerInfo = catalog?.providers.find((p) => p.id === form.provider);

	return (
		<ConfirmAction
			title={credential ? "Edit credential" : "Add credential"}
			description={
				credential
					? "Leave the key empty to keep the current one."
					: "The key is validated against the provider before saving unless you skip it."
			}
			confirmLabel={credential ? "Save" : "Add"}
			requireReason={false}
			confirmDisabled={!form.provider || (!credential && !form.token.trim())}
			extra={
				<div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
					{credential ? null : (
						<div className="space-y-1.5">
							<Label>Provider</Label>
							<SearchableSelect
								value={form.provider}
								onValueChange={(p) =>
									setForm((f) => ({
										...f,
										provider: p,
										region: "",
										config: {},
									}))
								}
								options={(catalog?.providers ?? []).map((p) => ({
									value: p.id,
									label: p.name,
									keywords: p.id,
								}))}
								placeholder="Choose provider"
							/>
						</div>
					)}
					<div className="space-y-1.5">
						<Label htmlFor="cred-token">API key</Label>
						<Input
							id="cred-token"
							type="password"
							autoComplete="off"
							value={form.token}
							onChange={(e) =>
								setForm((f) => ({ ...f, token: e.target.value }))
							}
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label>Variant</Label>
							<SimpleSelect
								className="w-full"
								value={form.variant}
								onChange={(variant) => setForm((f) => ({ ...f, variant }))}
								options={[
									{ value: "default", label: "Default" },
									{ value: "enterprise", label: "Enterprise" },
									{ value: "plans", label: "Plans" },
								]}
							/>
						</div>
						{providerInfo && providerInfo.regions.length > 0 ? (
							<div className="space-y-1.5">
								<Label>Region</Label>
								<SimpleSelect
									className="w-full"
									value={form.region || "__default__"}
									onChange={(region) =>
										setForm((f) => ({
											...f,
											region: region === "__default__" ? "" : region,
										}))
									}
									options={[
										{ value: "__default__", label: "Default" },
										...providerInfo.regions.map((r) => ({
											value: r.id,
											label: r.label,
										})),
									]}
								/>
							</div>
						) : null}
						<div className="space-y-1.5">
							<Label htmlFor="cred-limit">Usage limit (USD)</Label>
							<Input
								id="cred-limit"
								type="number"
								value={form.usageLimit}
								onChange={(e) =>
									setForm((f) => ({ ...f, usageLimit: e.target.value }))
								}
								placeholder="No limit"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="cred-comment">Note</Label>
							<Input
								id="cred-comment"
								value={form.comment}
								onChange={(e) =>
									setForm((f) => ({ ...f, comment: e.target.value }))
								}
							/>
						</div>
					</div>
					{providerInfo?.configKeys.map((k) => (
						<div key={k.key} className="space-y-1.5">
							<Label htmlFor={`cfg-${k.key}`}>
								{k.key}
								{k.required ? " *" : ""}{" "}
								<span className="text-xs text-muted-foreground">
									({k.envVar})
								</span>
							</Label>
							<Input
								id={`cfg-${k.key}`}
								value={form.config[k.key] ?? ""}
								onChange={(e) =>
									setForm((f) => ({
										...f,
										config: { ...f.config, [k.key]: e.target.value },
									}))
								}
							/>
						</div>
					))}
					{providerInfo ? (
						<div className="space-y-1.5">
							<Label>Restrict to models (empty = all)</Label>
							<ChipPicker
								values={form.allowedModels}
								onChange={(allowedModels) =>
									setForm((f) => ({ ...f, allowedModels }))
								}
								options={providerInfo.models.map((m) => ({
									value: m,
									label: m,
								}))}
								placeholder="Add model…"
							/>
						</div>
					) : null}
					<label className="flex items-center gap-2 text-sm">
						<Checkbox
							checked={form.skipValidation}
							onCheckedChange={(v) =>
								setForm((f) => ({ ...f, skipValidation: v === true }))
							}
						/>
						Skip validation
					</label>
				</div>
			}
			onConfirm={async () => {
				const config = Object.fromEntries(
					Object.entries(form.config).filter(([, v]) => v.trim() !== ""),
				);
				const common = {
					comment: form.comment || undefined,
					variant: form.variant,
					region: form.region || undefined,
					config,
					usageLimit: form.usageLimit === "" ? null : form.usageLimit,
					allowedModels: form.allowedModels.length ? form.allowedModels : null,
					skipValidation: form.skipValidation,
				};
				if (credential) {
					await update.mutateAsync({
						params: { path: { id: credential.id } },
						body: { ...common, token: form.token.trim() || undefined },
					});
				} else {
					await create.mutateAsync({
						body: {
							...common,
							provider: form.provider,
							token: form.token.trim(),
						},
					});
				}
				setForm((f) => ({ ...f, token: "" }));
			}}
		>
			{credential ? (
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label="Edit"
					disabled={disabled}
				>
					<Pencil />
				</Button>
			) : (
				<Button size="sm" variant="outline" disabled={disabled}>
					<Plus /> Add credential
				</Button>
			)}
		</ConfirmAction>
	);
}

function VerifyModelsDialog({
	credential,
	catalog,
}: {
	credential: Credential;
	catalog: CatalogProvider | undefined;
}) {
	const api = useApi();
	const can = useCan();
	const [models, setModels] = useState<string[]>(
		credential.allowedModels ?? catalog?.models.slice(0, 5) ?? [],
	);
	const verify = api.useMutation(
		"post",
		"/admin/provider-credentials/verify-models",
	);

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label="Verify models"
					title="Verify models"
					disabled={!can("POST", "/admin/provider-credentials/verify-models")}
				>
					<ListChecks />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Verify models</DialogTitle>
					<DialogDescription>
						Sends a tiny request per model with this key.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<ChipPicker
						values={models}
						onChange={setModels}
						options={(catalog?.models ?? []).map((m) => ({
							value: m,
							label: m,
						}))}
						placeholder="Add model…"
					/>
					{verify.data ? (
						<ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
							{verify.data.results.map((r) => (
								<li key={r.model} className="flex items-center gap-2">
									<StatusBadge status={r.valid ? "passed" : "failed"} />
									<span className="font-mono text-xs">{r.model}</span>
									{!r.inCatalog ? (
										<Tone tone="warn">not in catalogue</Tone>
									) : null}
									<span className="truncate text-xs text-muted-foreground">
										{r.error ?? ""}
									</span>
								</li>
							))}
						</ul>
					) : null}
				</div>
				<DialogFooter>
					<Button
						disabled={models.length === 0 || verify.isPending}
						onClick={() =>
							verify.mutate({ body: { credentialId: credential.id, models } })
						}
					>
						{verify.isPending ? <Loader2 className="animate-spin" /> : null}
						Run check
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
