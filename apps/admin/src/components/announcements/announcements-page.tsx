"use client";

import { Megaphone, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { ErrorState, PageHeader, Section } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import {
	Button,
	Input,
	Label,
	Switch,
	Textarea,
} from "@llmgateway/shared/components";
import { formatNumber } from "@llmgateway/shared/number-format";

import {
	describeSegment,
	EMPTY_SEGMENT,
	SegmentPicker,
	toSegment,
	type SegmentDraft,
} from "./segment-picker";

import type { Announcement, SegmentType } from "@/lib/api/pending-paths-p2";
import type { CsvColumn } from "@/lib/csv";

const CSV_COLUMNS: CsvColumn<Announcement>[] = [
	{ header: "id", value: (a) => a.id },
	{ header: "createdAt", value: (a) => a.createdAt },
	{ header: "title", value: (a) => a.title },
	{ header: "message", value: (a) => a.message },
	{ header: "href", value: (a) => a.href },
	{ header: "segment", value: (a) => describeSegment(a.segment) },
	{ header: "recipients", value: (a) => a.recipientCount },
	{ header: "emailSent", value: (a) => a.emailSent },
	{ header: "createdBy", value: (a) => a.createdByEmail },
];

const columns: ColumnDef<Announcement>[] = [
	{
		accessorKey: "title",
		header: "Announcement",
		cell: ({ row }) => (
			<div className="max-w-md space-y-0.5 whitespace-normal">
				<div className="font-medium">{row.original.title}</div>
				<div className="line-clamp-2 text-xs text-muted-foreground">
					{row.original.message}
				</div>
			</div>
		),
	},
	{
		id: "segment",
		header: "Audience",
		cell: ({ row }) => describeSegment(row.original.segment),
	},
	{
		accessorKey: "recipientCount",
		header: "Recipients",
		cell: ({ row }) => (
			<span className="tabular-nums">
				{formatNumber(row.original.recipientCount)}
			</span>
		),
	},
	{
		accessorKey: "emailSent",
		header: "Channels",
		cell: ({ row }) => (
			<div className="flex gap-1">
				<Tone tone="info">in-app</Tone>
				{row.original.emailSent ? <Tone tone="info">email</Tone> : null}
			</div>
		),
	},
	{
		accessorKey: "createdAt",
		header: "Sent",
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<div>{formatDateTime(row.original.createdAt)}</div>
				<div className="text-xs text-muted-foreground">
					{row.original.createdByEmail}
				</div>
			</div>
		),
	},
];

interface PreviewQuery {
	type: SegmentType;
	value?: string;
}

/** Prefills "specific organizations" from `?orgs=id1,id2` (bulk announce). */
function initialSegment(orgsParam: string | null): SegmentDraft {
	const ids = (orgsParam ?? "").split(",").filter(Boolean);
	return ids.length > 0
		? {
				...EMPTY_SEGMENT,
				type: "organizations",
				organizations: ids.map((id) => ({ id, name: id })),
			}
		: EMPTY_SEGMENT;
}

export function AnnouncementsPage() {
	const api = useApi();
	const history = api.useQuery("get", "/admin/announcements");
	const historyError: unknown = history.error;

	return (
		<>
			<PageHeader
				title="Announcements"
				description="Broadcast an in-app notification, optionally by email, to a segment of customers."
			/>
			<div className="space-y-4">
				<ComposeForm />
				<Section
					title="History"
					actions={
						<ExportCsvButton
							filename="announcements"
							columns={CSV_COLUMNS}
							rows={history.data?.announcements}
						/>
					}
				>
					{historyError ? (
						<ErrorState error={historyError} />
					) : (
						<DataTable
							columns={columns}
							data={history.data?.announcements}
							isLoading={history.isLoading}
							getRowId={(row) => row.id}
							empty="No announcements sent yet."
						/>
					)}
				</Section>
			</div>
		</>
	);
}

function ComposeForm() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const params = useSearchParams();
	const [segment, setSegment] = useState<SegmentDraft>(() =>
		initialSegment(params.get("orgs")),
	);
	const [form, setForm] = useState({
		title: "",
		message: "",
		href: "",
		sendEmail: false,
	});

	const apiSegment = toSegment(segment);
	const previewKey = useDebouncedValue(
		apiSegment
			? JSON.stringify({
					type: apiSegment.type,
					value: Array.isArray(apiSegment.value)
						? apiSegment.value.join(",")
						: apiSegment.value,
				})
			: "",
		300,
	);
	const previewQuery: PreviewQuery = previewKey
		? (JSON.parse(previewKey) as PreviewQuery)
		: { type: "all" };
	const preview = api.useQuery(
		"get",
		"/admin/announcements/preview",
		{ params: { query: previewQuery } },
		{ enabled: previewKey !== "" },
	);
	const send = api.useMutation("post", "/admin/announcements", {
		onSuccess: (res) => {
			toast.success(
				`Sent to ${formatNumber(res.announcement.recipientCount)} recipient(s)`,
			);
			setForm({ title: "", message: "", href: "", sendEmail: false });
			setSegment(EMPTY_SEGMENT);
			void invalidate("/admin/announcements");
		},
	});

	const href = form.href.trim();
	const hrefValid = !href || /^(https:\/\/|\/)/.test(href);
	const ready =
		form.title.trim().length > 0 &&
		form.message.trim().length > 0 &&
		hrefValid &&
		apiSegment !== null;
	const count = preview.data?.recipientCount;

	return (
		<Section
			title="Compose"
			description="Recipients see it in their notification bell. Email goes through the regular mailer queue."
		>
			<div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor="announcement-title">Title</Label>
						<Input
							id="announcement-title"
							maxLength={120}
							value={form.title}
							onChange={(e) =>
								setForm((f) => ({ ...f, title: e.target.value }))
							}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="announcement-message">Message</Label>
						<Textarea
							id="announcement-message"
							rows={4}
							maxLength={2000}
							value={form.message}
							onChange={(e) =>
								setForm((f) => ({ ...f, message: e.target.value }))
							}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="announcement-href">Link (optional)</Label>
						<Input
							id="announcement-href"
							placeholder="https://… or /dashboard/…"
							value={form.href}
							aria-invalid={!hrefValid}
							onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))}
						/>
					</div>
				</div>
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label>Audience</Label>
						<SegmentPicker value={segment} onChange={setSegment} />
					</div>
					<div className="flex items-center gap-2 rounded-md border p-3 text-sm">
						<Users className="size-4 text-muted-foreground" />
						{apiSegment === null ? (
							<span className="text-muted-foreground">
								Finish picking the audience.
							</span>
						) : preview.isFetching && count === undefined ? (
							<span className="text-muted-foreground">Counting…</span>
						) : (
							<span>
								<strong className="tabular-nums">
									{count === undefined ? "—" : formatNumber(count)}
								</strong>{" "}
								recipient(s)
							</span>
						)}
					</div>
					<label className="flex items-center gap-2 text-sm">
						<Switch
							checked={form.sendEmail}
							onCheckedChange={(sendEmail) =>
								setForm((f) => ({ ...f, sendEmail }))
							}
						/>
						Also send by email
					</label>
					<ConfirmAction
						title="Send announcement"
						description={`"${form.title.trim()}" goes to ${count === undefined ? "the selected" : formatNumber(count)} recipient(s)${form.sendEmail ? " in-app and by email" : " in-app"}. This cannot be recalled.`}
						confirmLabel="Send"
						requireReason={false}
						onConfirm={async () => {
							if (!apiSegment) {
								return;
							}
							await send.mutateAsync({
								body: {
									title: form.title.trim(),
									message: form.message.trim(),
									href: href || undefined,
									segment: apiSegment,
									sendEmail: form.sendEmail,
								},
							});
						}}
					>
						<Button
							className="w-full"
							disabled={
								!ready || count === 0 || !can("POST", "/admin/announcements")
							}
						>
							<Megaphone /> Send announcement
						</Button>
					</ConfirmAction>
				</div>
			</div>
		</Section>
	);
}
