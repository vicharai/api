"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/lib/components/button";
import { Input } from "@/lib/components/input";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { useApi } from "@/lib/fetch-client";
import Spinner from "@/lib/icons/Spinner";

export default function AdminOrganizationsPage() {
	const api = useApi();
	const [search, setSearch] = useState("");
	const [query, setQuery] = useState("");

	const { data, isLoading } = api.useQuery("get", "/admin/organizations", {
		params: {
			query: { search: query || undefined, limit: 50 },
		},
	});

	const organizations = data?.organizations ?? [];

	return (
		<div className="space-y-4">
			<form
				className="flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					setQuery(search);
				}}
			>
				<Input
					placeholder="Search by org name, owner email or org id"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="max-w-sm"
				/>
				<Button type="submit">Search</Button>
			</form>

			<SquircleSurface className="border border-border p-1 shadow-sm">
				<SquirclePanel className="p-4 sm:p-5">
					{isLoading ? (
						<Spinner className="mx-auto h-6 w-6" />
					) : organizations.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No organizations found.
						</p>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b text-left text-muted-foreground">
									<th className="pb-2 pr-4 font-medium">Name</th>
									<th className="pb-2 pr-4 font-medium">Owner</th>
									<th className="pb-2 pr-4 font-medium">Credits</th>
									<th className="pb-2 pr-4 font-medium">Status</th>
									<th className="pb-2 pr-4 font-medium">Risk</th>
									<th className="pb-2 font-medium">Created</th>
								</tr>
							</thead>
							<tbody>
								{organizations.map((org) => (
									<tr key={org.id} className="border-b last:border-0">
										<td className="py-2 pr-4">
											<Link
												href={`/admin/organizations/${org.id}`}
												className="text-primary hover:underline"
											>
												{org.name}
											</Link>
										</td>
										<td className="py-2 pr-4">{org.ownerEmail ?? "—"}</td>
										<td className="py-2 pr-4">
											${Number(org.credits).toFixed(2)}
										</td>
										<td className="py-2 pr-4">{org.status}</td>
										<td className="py-2 pr-4">
											{org.riskFlagged ? (
												<span className="text-destructive">Flagged</span>
											) : (
												"—"
											)}
										</td>
										<td className="py-2">
											{new Date(org.createdAt).toLocaleDateString()}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</SquirclePanel>
			</SquircleSurface>
		</div>
	);
}
