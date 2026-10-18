"use client";

import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import {
	EmptyState,
	PageHeader,
	QueryState,
	Section,
} from "@/components/ui/page";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";
import { cn, formatDate } from "@/lib/utils";

import { TASK_BUCKETS, taskBucket } from "./crm-shared";

import type { Route } from "next";

export function TasksPage() {
	const api = useApi();
	const can = useCan();
	const invalidate = useInvalidate();
	const tasks = api.useQuery("get", "/admin/crm/tasks");
	const done = api.useMutation("patch", "/admin/crm/activities/{id}", {
		onSuccess: () => {
			toast.success("Task done");
			void invalidate("/admin/crm");
		},
	});

	return (
		<>
			<PageHeader
				title="CRM tasks"
				description="Open follow-ups across all accounts."
			/>
			<QueryState query={tasks} rows={6}>
				{(data) => {
					if (data.tasks.length === 0) {
						return <EmptyState>No open tasks.</EmptyState>;
					}
					const sorted = [...data.tasks].sort((a, b) =>
						(a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"),
					);
					return (
						<div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
							{TASK_BUCKETS.map((bucket) => {
								const items = sorted.filter(
									(t) => taskBucket(t.dueAt) === bucket.value,
								);
								if (items.length === 0) {
									return null;
								}
								return (
									<Section
										key={bucket.value}
										title={`${bucket.label} (${items.length})`}
										className={cn(
											bucket.value === "overdue" && "border-destructive/40",
										)}
									>
										<ul className="space-y-2">
											{items.map((t) => (
												<li
													key={t.id}
													className="flex items-start gap-2 text-sm"
												>
													<button
														type="button"
														aria-label="Mark done"
														disabled={
															done.isPending ||
															!can("PATCH", `/admin/crm/activities/${t.id}`)
														}
														onClick={() =>
															done.mutate({
																params: { path: { id: t.id } },
																body: { done: true },
															})
														}
														className="mt-0.5 text-muted-foreground hover:text-success"
													>
														{done.isPending &&
														done.variables.params.path.id === t.id ? (
															<CheckCircle2 className="size-4" />
														) : (
															<Circle className="size-4" />
														)}
													</button>
													<div className="min-w-0 flex-1">
														<p className="whitespace-pre-wrap">{t.body}</p>
														<p className="text-xs text-muted-foreground">
															<Link
																href={`/crm/${t.accountId}` as Route}
																className="hover:underline"
															>
																{t.accountName}
															</Link>
															{t.dueAt ? ` · due ${formatDate(t.dueAt)}` : ""}
														</p>
													</div>
												</li>
											))}
										</ul>
									</Section>
								);
							})}
						</div>
					);
				}}
			</QueryState>
		</>
	);
}
