"use client";

import Link from "next/link";

import { StatusBadge, Tone } from "@/components/ui/controls";
import { QueryState, Section } from "@/components/ui/page";
import { useApi } from "@/lib/fetch-client";
import { formatDateTime } from "@/lib/utils";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@llmgateway/shared/components";

import { ScoreChip, SignalList } from "./score-chip";

import type { Route } from "next";

const STRENGTH_TONE = { strong: "bad", medium: "warn", weak: "muted" } as const;

/** Live risk score and accounts linked to a user, for the user detail page. */
export function LinkedAccountsPanel({ userId }: { userId: string }) {
	const api = useApi();
	const links = api.useQuery("get", "/admin/fraud/users/{userId}/links", {
		params: { path: { userId } },
	});

	return (
		<Section
			title="Risk & linked accounts"
			description="Shared session IPs (90 days), signup IP, stored card fingerprints and non-webmail email domain."
			actions={
				links.data?.score ? (
					<ScoreChip
						score={links.data.score.score}
						signals={links.data.score.signals}
					/>
				) : null
			}
		>
			<QueryState query={links} rows={3}>
				{(data) => (
					<div className="space-y-4">
						{data.score ? <SignalList signals={data.score.signals} /> : null}
						{data.links.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No linked accounts.
							</p>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Account</TableHead>
										<TableHead>Link</TableHead>
										<TableHead>Status</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{data.links.map((link) => (
										<TableRow key={link.userId}>
											<TableCell>
												<Link
													href={`/users/${link.userId}` as Route}
													className="font-medium hover:underline"
												>
													{link.email}
												</Link>
												<div className="text-xs text-muted-foreground">
													joined {formatDateTime(link.createdAt)}
												</div>
											</TableCell>
											<TableCell>
												<div className="flex flex-col items-start gap-1">
													{link.links.map((l) => (
														<span
															key={`${l.type}:${l.detail}`}
															className="flex items-center gap-1 text-xs"
														>
															<Tone tone={STRENGTH_TONE[l.strength]}>
																{l.type.replace(/_/g, " ")}
															</Tone>
															<span className="text-muted-foreground">
																{l.detail}
															</span>
														</span>
													))}
												</div>
											</TableCell>
											<TableCell>
												<div className="flex gap-1">
													<StatusBadge status={link.status} />
													{link.riskStatus !== "none" ? (
														<StatusBadge status={link.riskStatus} />
													) : null}
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</div>
				)}
			</QueryState>
		</Section>
	);
}
