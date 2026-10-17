"use client";

import { useQueries } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SimpleSelect, Toolbar } from "@/components/ui/controls";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import {
	EmptyState,
	ErrorState,
	LoadingRows,
	PageHeader,
	QueryState,
	Section,
} from "@/components/ui/page";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useApi } from "@/lib/fetch-client";

import { Button } from "@llmgateway/shared/components";

import { ACTIVITY_TYPES, ActivityList } from "./activity-list";

import type { ActivityEvent } from "@/lib/api/pending-paths-p2";
import type { CsvColumn } from "@/lib/csv";

const PAGE_SIZE = 50;

const CSV_COLUMNS: CsvColumn<ActivityEvent>[] = [
	{ header: "createdAt", value: (e) => e.createdAt },
	{ header: "type", value: (e) => e.type },
	{ header: "title", value: (e) => e.title },
	{ header: "detail", value: (e) => e.detail },
	{ header: "amount", value: (e) => e.amount },
	{ header: "organizationId", value: (e) => e.organizationId },
	{ header: "userId", value: (e) => e.userId },
];

export function ActivityPage() {
	const api = useApi();
	const [filters, setFilters] = useUrlFilters({ type: "all" });
	const [cursors, setCursors] = useState<string[]>([""]);
	const pages = useQueries({
		queries: cursors.map((before) =>
			api.queryOptions("get", "/admin/activity-feed", {
				params: {
					query: { limit: PAGE_SIZE, before: before || undefined },
				},
			}),
		),
	});

	const loaded = pages.flatMap((p) => p.data?.events ?? []);
	const events = loaded.filter(
		(e) => filters.type === "all" || e.type === filters.type,
	);
	const last = pages[pages.length - 1];
	const firstError: unknown = pages.find((p) => p.error)?.error;
	const hasMore = (last.data?.events.length ?? 0) === PAGE_SIZE;

	return (
		<>
			<PageHeader
				title="Activity"
				description="Signups, payments, credit changes, blocks, flags and admin actions as they happen."
				actions={
					<ExportCsvButton
						filename="activity"
						columns={CSV_COLUMNS}
						rows={events}
					/>
				}
			/>
			<Toolbar>
				<SimpleSelect
					value={filters.type}
					onChange={(type) => setFilters({ type })}
					ariaLabel="Event type"
					options={[
						{ value: "all", label: "All events" },
						...ACTIVITY_TYPES.map((t) => ({ value: t.value, label: t.label })),
					]}
				/>
			</Toolbar>
			<Section>
				{pages[0].isLoading ? (
					<LoadingRows rows={8} />
				) : firstError ? (
					<ErrorState error={firstError} />
				) : events.length === 0 ? (
					<EmptyState>No matching activity loaded.</EmptyState>
				) : (
					<ActivityList events={events} />
				)}
				{hasMore ? (
					<div className="mt-3 flex justify-center">
						<Button
							variant="outline"
							size="sm"
							disabled={last.isFetching}
							onClick={() => {
								const oldest = loaded[loaded.length - 1];
								if (oldest) {
									setCursors((c) => [...c, oldest.createdAt]);
								}
							}}
						>
							{last.isFetching ? <Loader2 className="animate-spin" /> : null}
							Load older
						</Button>
					</div>
				) : null}
			</Section>
		</>
	);
}

/** Compact "recent activity" card for the Overview page. */
export function ActivityFeedWidget({ limit = 8 }: { limit?: number }) {
	const api = useApi();
	const feed = api.useQuery(
		"get",
		"/admin/activity-feed",
		{ params: { query: { limit } } },
		{ refetchInterval: 60_000 },
	);

	return (
		<Section
			title="Recent activity"
			actions={
				<Button variant="ghost" size="sm" asChild>
					<Link href="/activity">View all</Link>
				</Button>
			}
		>
			<QueryState query={feed} rows={4}>
				{(data) =>
					data.events.length === 0 ? (
						<EmptyState>No recent activity.</EmptyState>
					) : (
						<ActivityList events={data.events} compact />
					)
				}
			</QueryState>
		</Section>
	);
}
