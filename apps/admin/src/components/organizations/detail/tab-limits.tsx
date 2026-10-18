"use client";

import { useState } from "react";

import { DiscountsPanel } from "@/components/policies/discounts-panel";
import { RateLimitsPanel } from "@/components/policies/rate-limits-panel";
import { SimpleSelect, Tone } from "@/components/ui/controls";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { QueryState, Section } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatDate, formatDateTime, formatUsd } from "@/lib/utils";

import { formatNumber } from "@llmgateway/shared/number-format";

import type { ApiData } from "@/lib/api/types";

type Hit = ApiData<"/admin/organizations/{orgId}/limit-hits">["hits"][number];

const hitColumns: ColumnDef<Hit>[] = [
	{
		accessorKey: "day",
		header: "Day",
		cell: ({ row }) => formatDate(row.original.day),
	},
	{
		accessorKey: "limitType",
		header: "Limit",
		cell: ({ row }) => <Tone tone="warn">{row.original.limitType}</Tone>,
	},
	{ accessorKey: "endpointKey", header: "Endpoint" },
	{
		accessorKey: "hitCount",
		header: "Hits",
		cell: ({ row }) => formatNumber(row.original.hitCount),
	},
	{
		accessorKey: "blockedUsd",
		header: "Blocked top-ups",
		cell: ({ row }) =>
			row.original.blockedUsd ? formatUsd(row.original.blockedUsd) : "—",
	},
	{
		accessorKey: "updatedAt",
		header: "Last hit",
		cell: ({ row }) => formatDateTime(row.original.updatedAt),
	},
];

export function OrgLimitsTab({ orgId }: { orgId: string }) {
	const api = useApi();
	const [days, setDays] = useState<"7" | "30" | "90">("30");
	const hits = api.useQuery("get", "/admin/organizations/{orgId}/limit-hits", {
		params: { path: { orgId }, query: { days: Number(days) } },
	});

	return (
		<div className="space-y-4">
			<RateLimitsPanel orgId={orgId} />
			<Section
				title="Limit hits"
				description="Requests rejected by rate limits, spend caps or top-up velocity checks."
				actions={
					<SimpleSelect
						value={days}
						onChange={setDays}
						options={[
							{ value: "7", label: "7 days" },
							{ value: "30", label: "30 days" },
							{ value: "90", label: "90 days" },
						]}
					/>
				}
			>
				<QueryState query={hits}>
					{(data) => (
						<DataTable
							columns={hitColumns}
							data={data.hits}
							getRowId={(h) => `${h.day}-${h.limitType}-${h.endpointKey}`}
							empty="No limit hits in this window."
						/>
					)}
				</QueryState>
			</Section>
			<DiscountsPanel orgId={orgId} />
		</div>
	);
}
