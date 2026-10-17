"use client";

import {
	Building2,
	CheckCircle2,
	Circle,
	Loader2,
	Plus,
	Save,
	Trash2,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { SimpleSelect, Tone } from "@/components/ui/controls";
import {
	EmptyState,
	PageHeader,
	QueryState,
	Section,
} from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { cn, formatDate, formatDateTime, formatUsd } from "@/lib/utils";

import {
	Button,
	Input,
	Label,
	SearchableSelect,
	Textarea,
} from "@llmgateway/shared/components";

import {
	AccountFields,
	toAccountBody,
	toAccountForm,
	type AccountFormState,
} from "./account-form";
import { ACTIVITY_TYPES, taskBucket } from "./crm-shared";

import type {
	CrmAccountDetail,
	CrmActivityType,
	CrmContact,
} from "@/lib/api/pending-paths";
import type { Route } from "next";

export function AccountDetail({ id }: { id: string }) {
	const api = useApi();
	const detail = api.useQuery("get", "/admin/crm/accounts/{id}", {
		params: { path: { id } },
	});
	return (
		<QueryState query={detail} rows={8}>
			{(d) => <AccountView key={d.account.updatedAt} data={d} />}
		</QueryState>
	);
}

function AccountView({ data }: { data: CrmAccountDetail }) {
	const api = useApi();
	const can = useCan();
	const router = useRouter();
	const invalidate = useInvalidate();
	const { account } = data;
	const path = { id: account.id };
	const [form, setForm] = useState<AccountFormState>(() =>
		toAccountForm(account),
	);
	const canEdit = can("PATCH", `/admin/crm/accounts/${account.id}`);
	const save = api.useMutation("patch", "/admin/crm/accounts/{id}", {
		onSuccess: () => {
			toast.success("Account saved");
			void invalidate("/admin/crm");
		},
	});
	const remove = api.useMutation("delete", "/admin/crm/accounts/{id}", {
		onSuccess: () => {
			toast.success("Account deleted");
			void invalidate("/admin/crm");
			router.push("/crm");
		},
	});

	return (
		<>
			<PageHeader
				title={account.name}
				description={
					<>
						{account.domain ?? "no domain"} · owner{" "}
						{account.ownerEmail ?? "unassigned"} · updated{" "}
						{formatDateTime(account.updatedAt)}
					</>
				}
				actions={
					<>
						<Button
							size="sm"
							disabled={!canEdit || save.isPending || !form.name.trim()}
							onClick={() =>
								save.mutate({ params: { path }, body: toAccountBody(form) })
							}
						>
							{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
							Save
						</Button>
						<ConfirmAction
							title="Delete account"
							description="Deletes the account with its contacts and activities. Linked organizations are not affected."
							confirmLabel="Delete"
							destructive
							onConfirm={() => remove.mutateAsync({ params: { path } })}
						>
							<Button
								size="sm"
								variant="ghost"
								disabled={!can("DELETE", `/admin/crm/accounts/${account.id}`)}
							>
								<Trash2 />
							</Button>
						</ConfirmAction>
					</>
				}
			>
				<div className="flex gap-2">
					<Tone tone="info">{account.stage}</Tone>
					<Tone tone="muted">{account.segment}</Tone>
					{account.overdueTaskCount ? (
						<Tone tone="bad">{account.overdueTaskCount} overdue</Tone>
					) : null}
				</div>
			</PageHeader>
			<div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
				<div className="space-y-4">
					<Section title="Deal">
						<AccountFields form={form} onChange={setForm} disabled={!canEdit} />
					</Section>
					<Activities accountId={account.id} activities={data.activities} />
				</div>
				<div className="space-y-4">
					<LinkedOrgs
						accountId={account.id}
						organizationIds={account.organizationIds}
						organizations={data.organizations}
					/>
					<Contacts accountId={account.id} contacts={data.contacts} />
					<Section
						title="Inbound"
						description="Contact form submissions from this account's domain."
					>
						{data.inbound.length === 0 ? (
							<EmptyState>None.</EmptyState>
						) : (
							<ul className="space-y-2 text-sm">
								{data.inbound.map((s) => (
									<li key={s.id}>
										<div className="font-medium">{s.name ?? s.email}</div>
										<div className="text-xs text-muted-foreground">
											{s.email} · {s.company ?? "—"} · {formatDate(s.createdAt)}
										</div>
									</li>
								))}
							</ul>
						)}
					</Section>
				</div>
			</div>
		</>
	);
}

function Activities({
	accountId,
	activities,
}: {
	accountId: string;
	activities: CrmAccountDetail["activities"];
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [type, setType] = useState<CrmActivityType>("note");
	const [body, setBody] = useState("");
	const [dueAt, setDueAt] = useState("");
	const refresh = () => invalidate("/admin/crm");
	const add = api.useMutation("post", "/admin/crm/accounts/{id}/activities", {
		onSuccess: () => {
			setBody("");
			setDueAt("");
			void refresh();
		},
	});
	const update = api.useMutation("patch", "/admin/crm/activities/{id}", {
		onSuccess: () => void refresh(),
	});
	const remove = api.useMutation("delete", "/admin/crm/activities/{id}", {
		onSuccess: () => void refresh(),
	});
	const canAdd = can("POST", `/admin/crm/accounts/${accountId}/activities`);

	return (
		<Section title="Activity">
			<form
				className="mb-4 space-y-2"
				onSubmit={(e) => {
					e.preventDefault();
					add.mutate({
						params: { path: { id: accountId } },
						body: {
							type,
							body: body.trim(),
							dueAt: dueAt ? new Date(dueAt).toISOString() : null,
						},
					});
				}}
			>
				<Textarea
					rows={2}
					placeholder="Log a note, call or meeting, or add a task"
					value={body}
					disabled={!canAdd}
					onChange={(e) => setBody(e.target.value)}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<SimpleSelect
						value={type}
						onChange={setType}
						options={ACTIVITY_TYPES}
					/>
					{type === "task" ? (
						<Input
							type="date"
							className="h-9 w-40"
							value={dueAt}
							onChange={(e) => setDueAt(e.target.value)}
						/>
					) : null}
					<Button
						type="submit"
						size="sm"
						disabled={!canAdd || !body.trim() || add.isPending}
					>
						<Plus /> Add
					</Button>
				</div>
			</form>
			{activities.length === 0 ? (
				<EmptyState>No activity yet.</EmptyState>
			) : (
				<ol className="space-y-3 border-l pl-4">
					{activities.map((a) => {
						const isTask = a.type === "task";
						const overdue =
							isTask && !a.doneAt && taskBucket(a.dueAt) === "overdue";
						return (
							<li key={a.id} className="relative">
								<span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-chart-1" />
								<div className="flex items-start gap-2">
									{isTask ? (
										<button
											type="button"
											aria-label={a.doneAt ? "Mark open" : "Mark done"}
											disabled={!can("PATCH", `/admin/crm/activities/${a.id}`)}
											onClick={() =>
												update.mutate({
													params: { path: { id: a.id } },
													body: { done: !a.doneAt },
												})
											}
										>
											{a.doneAt ? (
												<CheckCircle2 className="size-4 text-success" />
											) : (
												<Circle className="size-4 text-muted-foreground" />
											)}
										</button>
									) : null}
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
											<Tone tone={overdue ? "bad" : "muted"}>{a.type}</Tone>
											{formatDateTime(a.createdAt)} · {a.createdByEmail ?? "—"}
											{a.dueAt ? ` · due ${formatDate(a.dueAt)}` : ""}
										</div>
										<p
											className={cn(
												"text-sm whitespace-pre-wrap",
												a.doneAt && "text-muted-foreground line-through",
											)}
										>
											{a.body}
										</p>
									</div>
									<Button
										size="icon-sm"
										variant="ghost"
										aria-label="Delete activity"
										disabled={!can("DELETE", `/admin/crm/activities/${a.id}`)}
										onClick={() =>
											remove.mutate({ params: { path: { id: a.id } } })
										}
									>
										<X />
									</Button>
								</div>
							</li>
						);
					})}
				</ol>
			)}
		</Section>
	);
}

function Contacts({
	accountId,
	contacts,
}: {
	accountId: string;
	contacts: CrmContact[];
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [rows, setRows] = useState(
		contacts.map((c) => ({
			id: c.id as string | undefined,
			name: c.name,
			email: c.email ?? "",
			title: c.title ?? "",
			phone: c.phone ?? "",
		})),
	);
	const save = api.useMutation("put", "/admin/crm/accounts/{id}/contacts", {
		onSuccess: () => {
			toast.success("Contacts saved");
			void invalidate("/admin/crm");
		},
	});
	const canEdit = can("PUT", `/admin/crm/accounts/${accountId}/contacts`);

	function set(
		index: number,
		key: "name" | "email" | "title" | "phone",
		value: string,
	) {
		setRows((r) =>
			r.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
		);
	}

	return (
		<Section
			title="Contacts"
			actions={
				<>
					<Button
						size="sm"
						variant="ghost"
						disabled={!canEdit}
						onClick={() =>
							setRows((r) => [
								...r,
								{ id: undefined, name: "", email: "", title: "", phone: "" },
							])
						}
					>
						<Plus /> Add
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={
							!canEdit || save.isPending || rows.some((r) => !r.name.trim())
						}
						onClick={() =>
							save.mutate({
								params: { path: { id: accountId } },
								body: {
									contacts: rows.map((r) => ({
										id: r.id,
										name: r.name.trim(),
										email: r.email.trim() || null,
										title: r.title.trim() || null,
										phone: r.phone.trim() || null,
									})),
								},
							})
						}
					>
						<Save /> Save
					</Button>
				</>
			}
		>
			{rows.length === 0 ? (
				<EmptyState>No contacts.</EmptyState>
			) : (
				<div className="space-y-3">
					{rows.map((r, i) => (
						<div
							key={r.id ?? `new-${i}`}
							className="grid grid-cols-2 gap-2 rounded-md border p-2"
						>
							<Input
								placeholder="Name"
								value={r.name}
								disabled={!canEdit}
								onChange={(e) => set(i, "name", e.target.value)}
							/>
							<Input
								placeholder="Title"
								value={r.title}
								disabled={!canEdit}
								onChange={(e) => set(i, "title", e.target.value)}
							/>
							<Input
								placeholder="Email"
								value={r.email}
								disabled={!canEdit}
								onChange={(e) => set(i, "email", e.target.value)}
							/>
							<div className="flex gap-1">
								<Input
									placeholder="Phone"
									value={r.phone}
									disabled={!canEdit}
									onChange={(e) => set(i, "phone", e.target.value)}
								/>
								<Button
									size="icon"
									variant="ghost"
									aria-label="Remove contact"
									disabled={!canEdit}
									onClick={() =>
										setRows((all) => all.filter((_, j) => j !== i))
									}
								>
									<X />
								</Button>
							</div>
						</div>
					))}
				</div>
			)}
		</Section>
	);
}

function LinkedOrgs({
	accountId,
	organizationIds,
	organizations,
}: {
	accountId: string;
	organizationIds: string[];
	organizations: CrmAccountDetail["organizations"];
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim());
	const results = api.useQuery(
		"get",
		"/admin/organizations",
		{ params: { query: { search, limit: 10 } } },
		{ enabled: search.length >= 2 },
	);
	const patch = api.useMutation("patch", "/admin/crm/accounts/{id}", {
		onSuccess: () => {
			toast.success("Linked organizations updated");
			setQuery("");
			void invalidate("/admin/crm");
		},
	});
	const canEdit = can("PATCH", `/admin/crm/accounts/${accountId}`);
	const setIds = (ids: string[]) =>
		patch.mutate({
			params: { path: { id: accountId } },
			body: { organizationIds: ids },
		});

	return (
		<Section title="Organizations">
			{organizations.length === 0 ? (
				<EmptyState>No linked organizations.</EmptyState>
			) : (
				<ul className="mb-3 space-y-2">
					{organizations.map((o) => (
						<li key={o.id} className="flex items-start gap-2 text-sm">
							<Building2 className="mt-0.5 size-4 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<Link
									href={`/organizations/${o.id}` as Route}
									className="font-medium hover:underline"
								>
									{o.name}
								</Link>
								<div className="text-xs text-muted-foreground">
									{o.plan} · {formatUsd(o.credits)} credits · 30d spend{" "}
									{formatUsd(o.last30dSpend)} · revenue{" "}
									{formatUsd(o.totalRevenue)}
								</div>
							</div>
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label="Unlink"
								disabled={!canEdit}
								onClick={() =>
									setIds(organizationIds.filter((id) => id !== o.id))
								}
							>
								<X />
							</Button>
						</li>
					))}
				</ul>
			)}
			<Label className="mb-1.5 block text-xs text-muted-foreground">
				Link an organization
			</Label>
			<Input
				placeholder="Search organizations…"
				value={query}
				disabled={!canEdit}
				onChange={(e) => setQuery(e.target.value)}
			/>
			{results.data && search.length >= 2 ? (
				<div className="mt-2">
					<SearchableSelect
						value=""
						placeholder={`${results.data.organizations.length} match(es) — pick one`}
						options={results.data.organizations
							.filter((o) => !organizationIds.includes(o.id))
							.map((o) => ({
								value: o.id,
								label: o.name,
								keywords: o.billingEmail,
							}))}
						onValueChange={(id) => setIds([...organizationIds, id])}
					/>
				</div>
			) : null}
		</Section>
	);
}
