"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { StatusBadge, Tone } from "@/components/ui/controls";
import {
	EmptyState,
	JsonBlock,
	KeyValue,
	PageHeader,
	QueryState,
	Section,
} from "@/components/ui/page";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime, formatMs, formatUsd } from "@/lib/utils";

import {
	Button,
	Input,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@llmgateway/shared/components";

import type { ApiData } from "@/lib/api/types";
import type { Route } from "next";

type Lookup = ApiData<"/admin/requests/{requestId}">;

export function RequestLookupPage() {
	const [filters, setFilters] = useUrlFilters({ id: "" });
	const [draft, setDraft] = useState(filters.id);
	const requestId = filters.id.trim();

	function submit(event: FormEvent) {
		event.preventDefault();
		setFilters({ id: draft.trim() });
	}

	return (
		<>
			<PageHeader
				title="Request lookup"
				description="Find a gateway request by the id returned in the x-request-id header or a customer's error report."
			/>
			<form onSubmit={submit} className="mb-4 flex max-w-xl gap-2">
				<Input
					data-page-search=""
					aria-label="Request id"
					placeholder="Request id"
					className="font-mono"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
				/>
				<Button type="submit" disabled={!draft.trim()}>
					<Search /> Find
				</Button>
			</form>
			{requestId ? (
				<RequestResult requestId={requestId} />
			) : (
				<EmptyState>Enter a request id to look it up.</EmptyState>
			)}
		</>
	);
}

function RequestResult({ requestId }: { requestId: string }) {
	const api = useApi();
	const lookup = api.useQuery("get", "/admin/requests/{requestId}", {
		params: { path: { requestId } },
		retry: false,
	});
	return (
		<QueryState query={lookup} rows={6}>
			{(data) => <RequestDetail data={data} />}
		</QueryState>
	);
}

function RequestDetail({ data }: { data: Lookup }) {
	const r = data.request;
	return (
		<div className="space-y-4">
			<Section
				title={
					<span className="flex flex-wrap items-center gap-2">
						<span className="font-mono text-sm">{r.requestId}</span>
						{r.hasError ? (
							<Tone tone="bad">error</Tone>
						) : (
							<Tone tone="good">ok</Tone>
						)}
						{r.unifiedFinishReason ? (
							<StatusBadge status={r.unifiedFinishReason} />
						) : null}
					</span>
				}
				description={formatDateTime(r.createdAt)}
			>
				<KeyValue
					items={[
						{
							label: "Organization",
							value: (
								<Link
									href={`/organizations/${r.organization.id}` as Route}
									className="hover:underline"
								>
									{r.organization.name ?? r.organization.id}
								</Link>
							),
						},
						{
							label: "Project",
							value: (
								<Link
									href={
										`/organizations/${r.organization.id}?tab=projects` as Route
									}
									className="hover:underline"
								>
									{r.project.name ?? r.project.id}
								</Link>
							),
						},
						{ label: "API key", value: r.apiKey.description ?? r.apiKey.id },
						{
							label: "Requested",
							value: `${r.requestedProvider ? `${r.requestedProvider}/` : ""}${r.requestedModel}`,
						},
						{ label: "Served by", value: `${r.usedProvider} · ${r.usedModel}` },
						{ label: "Billing mode", value: r.usedMode },
						{ label: "Finish reason", value: r.finishReason ?? "—" },
						{ label: "Duration", value: formatMs(r.duration) },
						{
							label: "Time to first token",
							value: formatMs(r.timeToFirstToken),
						},
						{
							label: "Tokens (in / out / total)",
							value: `${r.promptTokens ?? "—"} / ${r.completionTokens ?? "—"} / ${r.totalTokens ?? "—"}`,
						},
						{
							label: "Cost",
							value: `${formatUsd(r.cost, true)}${r.estimatedCost ? " (estimated)" : ""}`,
						},
						{
							label: "Flags",
							value:
								[
									r.streamed ? "streamed" : null,
									r.cached ? "cached" : null,
									r.canceled ? "canceled" : null,
									r.source,
									r.apiOrigin,
								]
									.filter(Boolean)
									.join(" · ") || "—",
						},
					]}
				/>
			</Section>

			{r.errorDetails ? (
				<Section title="Error">
					<KeyValue
						items={[
							{ label: "Status", value: r.errorDetails.statusCode },
							{ label: "Status text", value: r.errorDetails.statusText },
							{ label: "Cause", value: r.errorDetails.cause ?? "—" },
						]}
					/>
					<div className="mt-3">
						<JsonBlock value={r.errorDetails.responseText} />
					</div>
				</Section>
			) : null}

			<Section
				title={`Attempts (${data.attempts.length})`}
				description="Every logged attempt for this id, newest first."
			>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Time</TableHead>
							<TableHead>Provider</TableHead>
							<TableHead>Model</TableHead>
							<TableHead>Outcome</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data.attempts.map((a) => (
							<TableRow key={a.id}>
								<TableCell>{formatDateTime(a.createdAt)}</TableCell>
								<TableCell>{a.usedProvider}</TableCell>
								<TableCell className="font-mono text-xs">
									{a.usedModel}
								</TableCell>
								<TableCell className="space-x-1">
									<StatusBadge status={a.unifiedFinishReason ?? "unknown"} />
									{a.retried ? <Tone tone="muted">retried</Tone> : null}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Section>

			<Section
				title="Payload"
				description={
					r.payloadRetained
						? "Retained by the organization's data retention setting."
						: "Not available: the organization does not retain payloads, or retention cleanup already removed them."
				}
			>
				{r.payload ? (
					<div className="space-y-3">
						<JsonBlock value={r.payload.messages} />
						{r.payload.content ? <JsonBlock value={r.payload.content} /> : null}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">No payload shown.</p>
				)}
			</Section>
		</div>
	);
}
