"use client";

import { Archive, ArchiveRestore, Loader2, Send, Trash2 } from "lucide-react";
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
import { KeyValue, QueryState } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import {
	Button,
	Input,
	Label,
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	Textarea,
} from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";

type Submission = ApiData<"/admin/contact-submissions">["submissions"][number];
type Listing = ApiData<"/admin/provider-listing-requests">["requests"][number];
type Status = "all" | "pending" | "rejected" | "delivered" | "delivery_failed";

const PAGE = 50;

const STATUS_OPTIONS: { value: Status; label: string }[] = [
	{ value: "all", label: "Any status" },
	{ value: "delivered", label: "Delivered" },
	{ value: "pending", label: "Pending" },
	{ value: "rejected", label: "Rejected (spam)" },
	{ value: "delivery_failed", label: "Delivery failed" },
];

export function ContactSubmissions() {
	const api = useApi();
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim());
	const [status, setStatus] = useState<Status>("all");
	const [archived, setArchived] = useState<"false" | "true">("false");
	const [offset, setOffset] = useState(0);
	const [open, setOpen] = useState<Submission | null>(null);
	const list = api.useQuery("get", "/admin/contact-submissions", {
		params: {
			query: {
				limit: PAGE,
				offset,
				search: search || undefined,
				status: status === "all" ? undefined : status,
				archived,
				sortBy: "createdAt",
				sortOrder: "desc",
			},
		},
	});

	const columns: ColumnDef<Submission>[] = [
		{
			accessorKey: "createdAt",
			header: "Received",
			cell: ({ row }) => formatDateTime(row.original.createdAt),
		},
		{
			accessorKey: "name",
			header: "From",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<div className="font-medium">{row.original.name}</div>
					<div className="text-xs text-muted-foreground">
						{row.original.email}
					</div>
				</div>
			),
		},
		{
			id: "company",
			header: "Size / country",
			cell: ({ row }) =>
				`${row.original.size} · ${row.original.country}${row.original.deployment ? ` · ${row.original.deployment}` : ""}`,
		},
		{
			accessorKey: "message",
			header: "Message",
			cell: ({ row }) => (
				<span className="block max-w-sm truncate text-xs text-muted-foreground">
					{row.original.message}
				</span>
			),
		},
		{
			accessorKey: "spamFilterStatus",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.spamFilterStatus} />,
		},
	];

	return (
		<>
			<Toolbar>
				<SearchInput
					value={query}
					onChange={(v) => {
						setQuery(v);
						setOffset(0);
					}}
					placeholder="Name, email, message"
				/>
				<SimpleSelect
					value={status}
					onChange={(v) => {
						setStatus(v);
						setOffset(0);
					}}
					options={STATUS_OPTIONS}
				/>
				<SimpleSelect
					value={archived}
					onChange={(v) => {
						setArchived(v);
						setOffset(0);
					}}
					options={[
						{ value: "false", label: "Inbox" },
						{ value: "true", label: "Archived" },
					]}
				/>
			</Toolbar>
			<QueryState query={list}>
				{(data) => (
					<>
						<DataTable
							columns={columns}
							data={data.submissions}
							getRowId={(s) => s.id}
							onRowClick={setOpen}
							empty="No submissions."
						/>
						<Pager
							offset={offset}
							limit={PAGE}
							total={data.total}
							onChange={setOffset}
						/>
					</>
				)}
			</QueryState>
			<Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
				<SheetContent className="w-full overflow-y-auto sm:max-w-xl">
					<SheetHeader>
						<SheetTitle>{open?.name}</SheetTitle>
					</SheetHeader>
					{open ? (
						<SubmissionDetail
							key={open.id}
							submission={open}
							onClose={() => setOpen(null)}
						/>
					) : null}
				</SheetContent>
			</Sheet>
		</>
	);
}

function SubmissionDetail({
	submission: s,
	onClose,
}: {
	submission: Submission;
	onClose: () => void;
}) {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const path = { id: s.id };
	const [subject, setSubject] = useState("Re: your message to Vichar");
	const [body, setBody] = useState("");
	const done =
		(message: string, close = false) =>
		() => {
			toast.success(message);
			if (close) {
				onClose();
			}
			void invalidate("/admin/contact-submissions");
		};
	const reply = api.useMutation(
		"post",
		"/admin/contact-submissions/{id}/reply",
		{ onSuccess: done("Reply sent") },
	);
	const archive = api.useMutation(
		"patch",
		"/admin/contact-submissions/{id}/archive",
		{ onSuccess: done("Updated", true) },
	);
	const remove = api.useMutation("delete", "/admin/contact-submissions/{id}", {
		onSuccess: done("Deleted", true),
	});

	return (
		<div className="space-y-4 p-4">
			<KeyValue
				items={[
					{ label: "Email", value: s.email },
					{ label: "Received", value: formatDateTime(s.createdAt) },
					{ label: "Country", value: s.country },
					{ label: "Size", value: s.size },
					{ label: "Deployment", value: s.deployment ?? "—" },
					{ label: "IP", value: s.ipAddress ?? "—" },
					{ label: "Spam filter", value: s.spamFilterStatus },
					{ label: "Rejection", value: s.rejectionReason ?? "—" },
				]}
			/>
			<p className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
				{s.message}
			</p>
			<div className="space-y-2">
				<Label htmlFor="cs-subject">Subject</Label>
				<Input
					id="cs-subject"
					value={subject}
					onChange={(e) => setSubject(e.target.value)}
				/>
				<Textarea
					rows={6}
					value={body}
					onChange={(e) => setBody(e.target.value)}
					placeholder="Your reply"
				/>
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						disabled={
							!body.trim() ||
							reply.isPending ||
							!can("POST", `/admin/contact-submissions/${s.id}/reply`)
						}
						onClick={() =>
							reply.mutate({ params: { path }, body: { subject, body } })
						}
					>
						{reply.isPending ? <Loader2 className="animate-spin" /> : <Send />}
						Send reply
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={
							!can("PATCH", `/admin/contact-submissions/${s.id}/archive`)
						}
						onClick={() =>
							archive.mutate({
								params: { path },
								body: { archived: !s.archivedAt },
							})
						}
					>
						{s.archivedAt ? <ArchiveRestore /> : <Archive />}
						{s.archivedAt ? "Restore" : "Archive"}
					</Button>
					<ConfirmAction
						title="Delete submission"
						confirmLabel="Delete"
						destructive
						onConfirm={() => remove.mutateAsync({ params: { path } })}
					>
						<Button
							size="sm"
							variant="ghost"
							disabled={!can("DELETE", `/admin/contact-submissions/${s.id}`)}
						>
							<Trash2 /> Delete
						</Button>
					</ConfirmAction>
				</div>
			</div>
		</div>
	);
}

export function ProviderListingRequests() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const [archived, setArchived] = useState<"false" | "true">("false");
	const [offset, setOffset] = useState(0);
	const list = api.useQuery("get", "/admin/provider-listing-requests", {
		params: {
			query: {
				limit: PAGE,
				offset,
				archived,
				sortBy: "createdAt",
				sortOrder: "desc",
			},
		},
	});
	const archive = api.useMutation(
		"patch",
		"/admin/provider-listing-requests/{id}/archive",
		{
			onSuccess: () => {
				toast.success("Updated");
				void invalidate("/admin/provider-listing-requests");
			},
		},
	);
	const remove = api.useMutation(
		"delete",
		"/admin/provider-listing-requests/{id}",
		{
			onSuccess: () => {
				toast.success("Deleted");
				void invalidate("/admin/provider-listing-requests");
			},
		},
	);

	const columns: ColumnDef<Listing>[] = [
		{
			accessorKey: "createdAt",
			header: "Received",
			cell: ({ row }) => formatDateTime(row.original.createdAt),
		},
		{
			accessorKey: "providerName",
			header: "Provider",
			cell: ({ row }) => (
				<div className="space-y-0.5">
					<a
						href={row.original.url}
						target="_blank"
						rel="noreferrer"
						className="font-medium hover:underline"
					>
						{row.original.providerName}
					</a>
					<div className="text-xs text-muted-foreground">
						{row.original.email} · {row.original.country}
					</div>
				</div>
			),
		},
		{
			id: "compliance",
			header: "Compliance",
			cell: ({ row }) => (
				<div className="flex flex-wrap gap-1">
					{row.original.complianceSoc2Type2 ? (
						<Tone tone="info">SOC2</Tone>
					) : null}
					{row.original.complianceIso27001 ? (
						<Tone tone="info">ISO27001</Tone>
					) : null}
					{row.original.complianceGdpr ? <Tone tone="info">GDPR</Tone> : null}
					{row.original.trainsOnData ? (
						<Tone tone="warn">trains on data</Tone>
					) : null}
				</div>
			),
		},
		{
			accessorKey: "paymentStatus",
			header: "Payment",
			cell: ({ row }) => <StatusBadge status={row.original.paymentStatus} />,
		},
		{
			accessorKey: "spamFilterStatus",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.spamFilterStatus} />,
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex justify-end gap-1">
					<Button
						size="sm"
						variant="ghost"
						disabled={
							!can(
								"PATCH",
								`/admin/provider-listing-requests/${row.original.id}/archive`,
							)
						}
						onClick={() =>
							archive.mutate({
								params: { path: { id: row.original.id } },
								body: { archived: !row.original.archivedAt },
							})
						}
					>
						{row.original.archivedAt ? <ArchiveRestore /> : <Archive />}
					</Button>
					<ConfirmAction
						title="Delete request"
						confirmLabel="Delete"
						destructive
						onConfirm={() =>
							remove.mutateAsync({ params: { path: { id: row.original.id } } })
						}
					>
						<Button
							size="sm"
							variant="ghost"
							aria-label="Delete"
							disabled={
								!can(
									"DELETE",
									`/admin/provider-listing-requests/${row.original.id}`,
								)
							}
						>
							<Trash2 />
						</Button>
					</ConfirmAction>
				</div>
			),
		},
	];

	return (
		<>
			<Toolbar>
				<SimpleSelect
					value={archived}
					onChange={(v) => {
						setArchived(v);
						setOffset(0);
					}}
					options={[
						{ value: "false", label: "Inbox" },
						{ value: "true", label: "Archived" },
					]}
				/>
			</Toolbar>
			<QueryState query={list}>
				{(data) => (
					<>
						<DataTable
							columns={columns}
							data={data.requests}
							getRowId={(r) => r.id}
							empty="No provider listing requests."
						/>
						<Pager
							offset={offset}
							limit={PAGE}
							total={data.total}
							onChange={setOffset}
						/>
					</>
				)}
			</QueryState>
		</>
	);
}
