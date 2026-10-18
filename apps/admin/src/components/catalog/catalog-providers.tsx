"use client";

import {
	CheckCircle2,
	Loader2,
	Pencil,
	Plug,
	Plus,
	Power,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { StatusBadge, Toolbar, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState } from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatMs } from "@/lib/utils";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Textarea,
} from "@llmgateway/shared/components";

import type { CatalogProvider } from "@/lib/api/admin-types";
import type { Route } from "next";

const SLUG = /^[a-z0-9][a-z0-9-]{1,47}$/;
const RESERVED = new Set(["custom", "auto", "dynamic"]);

/** Result of a connectivity test, shown inline under the form. */
function TestResult({
	result,
}: {
	result: {
		ok: boolean;
		latencyMs: number | null;
		models: string[] | null;
		error: string | null;
	} | null;
}) {
	if (!result) {
		return null;
	}
	return result.ok ? (
		<div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/10 p-2 text-sm">
			<CheckCircle2 className="mt-0.5 size-4 text-success" />
			<div>
				Reachable
				{result.latencyMs !== null ? ` in ${formatMs(result.latencyMs)}` : ""}
				{result.models?.length ? (
					<div className="text-xs text-muted-foreground">
						{result.models.length} models, e.g.{" "}
						{result.models.slice(0, 5).join(", ")}
					</div>
				) : null}
			</div>
		</div>
	) : (
		<div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">
			<XCircle className="mt-0.5 size-4 text-destructive" />
			<span>{result.error ?? "Test failed"}</span>
		</div>
	);
}

export function CatalogProviders() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const list = api.useQuery("get", "/admin/catalog/providers");
	const [adding, setAdding] = useState(false);
	const [editing, setEditing] = useState<CatalogProvider | null>(null);
	const deactivate = api.useMutation(
		"delete",
		"/admin/catalog/providers/{id}",
		{
			onSuccess: () => {
				toast.success("Provider deactivated");
				void invalidate("/admin/catalog");
			},
		},
	);
	const reactivate = api.useMutation("patch", "/admin/catalog/providers/{id}", {
		onSuccess: () => {
			toast.success("Provider reactivated");
			void invalidate("/admin/catalog");
		},
	});

	const columns: ColumnDef<CatalogProvider>[] = [
		{
			id: "name",
			accessorKey: "name",
			header: "Provider",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="flex items-center gap-2 font-medium">
						{row.original.kind === "builtin" ? (
							<Link
								href={`/providers/${row.original.id}` as Route}
								className="hover:underline"
							>
								{row.original.name}
							</Link>
						) : (
							row.original.name
						)}
						{row.original.kind === "custom" ? (
							<Tone tone="info">custom</Tone>
						) : (
							<Tone tone="muted">built-in</Tone>
						)}
					</div>
					<div className="font-mono text-xs text-muted-foreground">
						{row.original.id}
					</div>
				</div>
			),
		},
		{
			id: "baseUrl",
			header: "Base URL",
			enableSorting: false,
			cell: ({ row }) => (
				<span className="font-mono text-xs">{row.original.baseUrl ?? "—"}</span>
			),
		},
		{
			id: "credentialCount",
			accessorKey: "credentialCount",
			header: "Keys",
			cell: ({ row }) =>
				row.original.credentialCount > 0 ? (
					row.original.credentialCount
				) : (
					<Tone tone="warn">none</Tone>
				),
		},
		{ id: "modelCount", accessorKey: "modelCount", header: "Models" },
		{
			id: "status",
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			id: "actions",
			header: "",
			enableSorting: false,
			cell: ({ row }) => {
				const p = row.original;
				if (p.kind !== "custom") {
					return null;
				}
				const path = `/admin/catalog/providers/${p.id}`;
				return (
					<div className="flex justify-end gap-1">
						<Button
							size="sm"
							variant="ghost"
							disabled={!can("PATCH", path)}
							onClick={() => setEditing(p)}
						>
							<Pencil /> Edit
						</Button>
						{p.status === "active" ? (
							<ConfirmAction
								title={`Deactivate ${p.name}`}
								description="Stops routing to this provider. Models mapped only to it become unavailable."
								destructive
								requireReason={false}
								confirmLabel="Deactivate"
								onConfirm={() =>
									deactivate.mutateAsync({ params: { path: { id: p.id } } })
								}
							>
								<Button
									size="sm"
									variant="ghost"
									disabled={!can("DELETE", path)}
								>
									<Power /> Deactivate
								</Button>
							</ConfirmAction>
						) : (
							<Button
								size="sm"
								variant="ghost"
								disabled={!can("PATCH", path) || reactivate.isPending}
								onClick={() =>
									reactivate.mutate({
										params: { path: { id: p.id } },
										body: { status: "active" },
									})
								}
							>
								<Power /> Reactivate
							</Button>
						)}
					</div>
				);
			},
		},
	];

	return (
		<>
			<Toolbar>
				<p className="text-sm text-muted-foreground">
					Built-in providers ship with the gateway. Custom providers are any
					OpenAI-compatible endpoint.
				</p>
				<div className="ml-auto">
					<Button
						size="sm"
						disabled={!can("POST", "/admin/catalog/providers")}
						onClick={() => setAdding(true)}
					>
						<Plus /> Add provider
					</Button>
				</div>
			</Toolbar>
			<QueryState query={list}>
				{(data) => (
					<DataTable
						columns={columns}
						data={[...data.providers].sort(
							(a, b) =>
								Number(b.kind === "custom") - Number(a.kind === "custom") ||
								a.name.localeCompare(b.name),
						)}
						getRowId={(p) => p.id}
						empty="No providers."
					/>
				)}
			</QueryState>
			{adding ? (
				<ProviderDialog
					existing={list.data?.providers.map((p) => p.id) ?? []}
					onClose={() => setAdding(false)}
				/>
			) : null}
			{editing ? (
				<ProviderDialog
					provider={editing}
					existing={[]}
					onClose={() => setEditing(null)}
				/>
			) : null}
		</>
	);
}

function ProviderDialog({
	provider: initial,
	existing,
	onClose,
}: {
	provider?: CatalogProvider;
	existing: string[];
	onClose: () => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const [created, setCreated] = useState<CatalogProvider | null>(null);
	const provider = initial ?? created ?? undefined;
	const [form, setForm] = useState({
		id: provider?.id ?? "",
		name: provider?.name ?? "",
		baseUrl: provider?.baseUrl ?? "",
		apiKey: "",
		description: provider?.description ?? "",
	});
	const done = (message: string) => () => {
		toast.success(message);
		void invalidate("/admin/catalog", "/admin/provider-credentials");
		onClose();
	};
	const test = api.useMutation("post", "/admin/catalog/providers/{id}/test");
	const create = api.useMutation("post", "/admin/catalog/providers", {
		onSuccess: (res) => {
			toast.success("Provider added. Testing the connection…");
			void invalidate("/admin/catalog", "/admin/provider-credentials");
			setCreated(res.provider);
			setForm((f) => ({ ...f, apiKey: "" }));
			test.mutate({ params: { path: { id: res.provider.id } } });
		},
	});
	const update = api.useMutation("patch", "/admin/catalog/providers/{id}", {
		onSuccess: done("Provider updated"),
	});
	const pending = create.isPending || update.isPending;

	const idError = provider
		? null
		: !SLUG.test(form.id)
			? "2–48 chars: lowercase letters, digits and dashes"
			: RESERVED.has(form.id) || existing.includes(form.id)
				? "This id is already taken"
				: null;
	const baseUrl = form.baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
	const urlError = /^https:\/\/[^\s/]+\S*$/.test(baseUrl)
		? null
		: "Must be an https URL";
	const keyError =
		!provider && form.apiKey.trim().length < 8 ? "Required" : null;
	const valid = !idError && !urlError && !keyError && form.name.trim() !== "";

	function submit() {
		if (provider) {
			update.mutate({
				params: { path: { id: provider.id } },
				body: {
					name: form.name.trim(),
					baseUrl,
					apiKey: form.apiKey.trim() || undefined,
					description: form.description.trim() || null,
				},
			});
		} else {
			create.mutate({
				body: {
					id: form.id,
					name: form.name.trim(),
					baseUrl,
					apiKey: form.apiKey.trim(),
					description: form.description.trim() || undefined,
				},
			});
		}
	}

	return (
		<Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{created
							? `${created.name} added`
							: provider
								? `Edit ${provider.name}`
								: "Add provider"}
					</DialogTitle>
					<DialogDescription>
						An OpenAI-compatible endpoint. The key is stored as a platform
						credential; map models to the provider from the Models tab.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid) {
							submit();
						}
					}}
				>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor="prov-id">Id</Label>
							<Input
								id="prov-id"
								className="font-mono"
								disabled={Boolean(provider)}
								placeholder="e.g. acme-ai"
								value={form.id}
								onChange={(e) =>
									setForm((f) => ({ ...f, id: e.target.value.toLowerCase() }))
								}
							/>
							{form.id && idError ? (
								<p className="text-xs text-destructive">{idError}</p>
							) : null}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="prov-name">Name</Label>
							<Input
								id="prov-name"
								value={form.name}
								onChange={(e) =>
									setForm((f) => ({ ...f, name: e.target.value }))
								}
							/>
						</div>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="prov-url">Base URL</Label>
						<Input
							id="prov-url"
							className="font-mono"
							placeholder="https://api.example.com"
							value={form.baseUrl}
							onChange={(e) =>
								setForm((f) => ({ ...f, baseUrl: e.target.value }))
							}
						/>
						{form.baseUrl && urlError ? (
							<p className="text-xs text-destructive">{urlError}</p>
						) : (
							<p className="text-xs text-muted-foreground">
								Without <code>/v1</code>; the gateway appends{" "}
								<code>/v1/chat/completions</code>.
								{baseUrl !== form.baseUrl.trim() && baseUrl
									? ` Saved as ${baseUrl}.`
									: ""}
							</p>
						)}
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="prov-key">API key</Label>
						<Input
							id="prov-key"
							type="password"
							autoComplete="off"
							placeholder={
								provider ? "Leave empty to keep the current key" : ""
							}
							value={form.apiKey}
							onChange={(e) =>
								setForm((f) => ({ ...f, apiKey: e.target.value }))
							}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="prov-desc">Description (optional)</Label>
						<Textarea
							id="prov-desc"
							rows={2}
							value={form.description}
							onChange={(e) =>
								setForm((f) => ({ ...f, description: e.target.value }))
							}
						/>
					</div>
					{provider ? <TestResult result={test.data ?? null} /> : null}
					<DialogFooter className="gap-2">
						{provider ? (
							<Button
								type="button"
								variant="outline"
								className="mr-auto"
								disabled={test.isPending}
								onClick={() =>
									test.mutate({ params: { path: { id: provider.id } } })
								}
							>
								{test.isPending ? (
									<Loader2 className="animate-spin" />
								) : (
									<Plug />
								)}
								Test connection
							</Button>
						) : null}
						<Button
							type="button"
							variant="outline"
							disabled={pending}
							onClick={onClose}
						>
							{created ? "Done" : "Cancel"}
						</Button>
						<Button type="submit" disabled={!valid || pending}>
							{pending ? <Loader2 className="animate-spin" /> : null}
							{provider ? "Save" : "Add provider"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
