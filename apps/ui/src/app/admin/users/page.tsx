"use client";

import { useState } from "react";

import { Button } from "@/lib/components/button";
import { Input } from "@/lib/components/input";
import { SquirclePanel, SquircleSurface } from "@/lib/components/squircle";
import { useToast } from "@/lib/components/use-toast";
import { useApi } from "@/lib/fetch-client";
import Spinner from "@/lib/icons/Spinner";

export default function AdminUsersPage() {
	const { toast } = useToast();
	const api = useApi();
	const [search, setSearch] = useState("");
	const [query, setQuery] = useState("");

	const { data, isLoading } = api.useQuery("get", "/admin/users", {
		params: { query: { search: query || "@" } },
	});
	const verifyEmail = api.useMutation(
		"post",
		"/admin/users/{userId}/verify-email",
	);

	const users = data?.users ?? [];

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
					placeholder="Search by email or name"
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
					) : users.length === 0 ? (
						<p className="text-sm text-muted-foreground">No users found.</p>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b text-left text-muted-foreground">
									<th className="pb-2 pr-4 font-medium">Email</th>
									<th className="pb-2 pr-4 font-medium">Name</th>
									<th className="pb-2 pr-4 font-medium">Verified</th>
									<th className="pb-2 pr-4 font-medium">Organizations</th>
									<th className="pb-2 font-medium">Actions</th>
								</tr>
							</thead>
							<tbody>
								{users.map((u) => (
									<tr key={u.id} className="border-b last:border-0">
										<td className="py-2 pr-4">{u.email}</td>
										<td className="py-2 pr-4">{u.name ?? "—"}</td>
										<td className="py-2 pr-4">
											{u.emailVerified ? "Yes" : "No"}
										</td>
										<td className="py-2 pr-4">
											{u.organizations.map((o) => o.name).join(", ") || "—"}
										</td>
										<td className="py-2">
											{!u.emailVerified && (
												<Button
													variant="outline"
													size="sm"
													onClick={async () => {
														const reason = window.prompt(
															`Reason for verifying ${u.email}`,
														);
														if (!reason) {
															return;
														}
														try {
															await verifyEmail.mutateAsync({
																params: { path: { userId: u.id } },
																body: { reason },
															});
															toast({ title: `Verified ${u.email}` });
														} catch {
															toast({
																title: "Verification failed",
																variant: "destructive",
															});
														}
													}}
												>
													Mark verified
												</Button>
											)}
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
